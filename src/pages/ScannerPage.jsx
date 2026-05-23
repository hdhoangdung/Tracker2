/**
 * ScannerPage – optimised for iPhone 11 Pro Max / iOS Safari
 *
 * Scanning strategy (fastest first):
 * 1. BarcodeDetector Web API  — iOS 17+ / Safari calls into VisionKit natively.
 *    This is the same engine as the Camera app. Sub-100ms detection.
 * 2. ZBar WASM fallback        — for Android Chrome and older iOS.
 *
 * Other iOS-specific decisions:
 * - facingMode: 'environment' directly (enumerateDevices labels are empty before permission)
 * - No `advanced` constraints (torch/focusMode throw OverconstrainedError on iOS)
 * - Crop canvas to scan-box region only (saves ~80% ZBar work)
 * - `playsInline` + `muted` required for iOS autoplay
 * - height: 100dvh avoids Safari address-bar overlap
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { ArrowLeft, Keyboard, Loader2, CheckCircle, Package, AlertCircle } from 'lucide-react';
import { lookupBarcode } from '../services/barcodeApiService';
import { useProducts } from '../context/ProductContext';

const STEPS = { SCAN: 'scan', LOOKUP: 'lookup', FORM: 'form', SUCCESS: 'success' };

// ─── BarcodeDetector (Web API → VisionKit on iOS) ─────────────────────────────
const hasBarcodeDetector = typeof window !== 'undefined' && 'BarcodeDetector' in window;

// All formats supported by BarcodeDetector / VisionKit
const BD_FORMATS = [
  'aztec','code_128','code_39','code_93','codabar','data_matrix',
  'ean_13','ean_8','itf','pdf417','qr_code','upc_a','upc_e',
];

let _barcodeDetector = null;
function getBarcodeDetector() {
  if (_barcodeDetector) return _barcodeDetector;
  // eslint-disable-next-line no-undef
  _barcodeDetector = new BarcodeDetector({ formats: BD_FORMATS });
  return _barcodeDetector;
}

// ─── ZBar WASM fallback (lazy-loaded) ────────────────────────────────────────
let _scanImageData = null;
async function getZBarScan() {
  if (_scanImageData) return _scanImageData;
  const mod = await import('@undecaf/zbar-wasm');
  _scanImageData = mod.scanImageData;
  return _scanImageData;
}

// ─── GS1 date parser ─────────────────────────────────────────────────────────
// GS1-128 / DataMatrix barcodes encode dates as YYMMDD inside Application Identifiers.
// AI 11 = Production date, AI 15 = Best before, AI 17 = Expiry date
function parseGS1Dates(raw) {
  const result = { manufactureDate: '', expiryDate: '' };
  if (!raw) return result;

  // GS1 uses FNC1 (ASCII 29) or parenthesised AIs like (11)250101
  // Normalise: strip parentheses, replace FNC1 with nothing
  const s = raw.replace(/\((\d{2,4})\)/g, '$1').replace(/\x1d/g, '');

  const parseYYMMDD = (yymmdd) => {
    if (!yymmdd || yymmdd.length < 6) return '';
    const yy = parseInt(yymmdd.slice(0, 2), 10);
    const mm = yymmdd.slice(2, 4);
    const dd = yymmdd.slice(4, 6) === '00' ? '01' : yymmdd.slice(4, 6);
    const yyyy = yy >= 0 && yy <= 30 ? 2000 + yy : 1900 + yy;
    return `${yyyy}-${mm}-${dd}`;
  };

  // Match AI patterns: 2-digit AI followed by 6-digit date
  const aiMatch = (ai) => {
    const re = new RegExp(`${ai}(\\d{6})`);
    const m = s.match(re);
    return m ? parseYYMMDD(m[1]) : '';
  };

  result.manufactureDate = aiMatch('11');
  result.expiryDate      = aiMatch('17') || aiMatch('15');
  return result;
}

// ─── Camera open (iOS-safe) ───────────────────────────────────────────────────
async function openCamera() {
  // On iOS, always use facingMode: environment — deviceId enumeration requires
  // prior permission and labels are empty before that.
  const constraints = {
    video: {
      facingMode: { ideal: 'environment' },
      width:  { ideal: 1280 },   // 1280×720 is the sweet spot: sharp enough, not too heavy
      height: { ideal: 720 },
    },
    audio: false,
  };
  return navigator.mediaDevices.getUserMedia(constraints);
}

// ─── Main component ───────────────────────────────────────────────────────────
export function ScannerPage({ onBack, onNavigate }) {
  const { addProduct } = useProducts();

  const videoRef    = useRef(null);
  const canvasRef   = useRef(null);
  const streamRef   = useRef(null);
  const timerRef    = useRef(null);
  const activeRef   = useRef(true);   // false once a barcode is found

  const [step, setStep]             = useState(STEPS.SCAN);
  const [manualMode, setManualMode] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const [lookupData, setLookupData] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [form, setForm] = useState({
    name: '', brand: '', barcode: '', manufactureDate: '', expiryDate: '',
    notifyDate: '', quantity: 1, imageUrl: '', notes: '',
  });

  // ── Camera + scan loop ────────────────────────────────────────────────────
  useEffect(() => {
    if (manualMode || step !== STEPS.SCAN) return;
    activeRef.current = true;
    let cancelled = false;

    (async () => {
      try {
        const stream = await openCamera();
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }

        streamRef.current = stream;
        const video = videoRef.current;
        video.srcObject = stream;

        // iOS requires a user-gesture or these attributes to autoplay
        video.setAttribute('playsinline', '');
        video.setAttribute('muted', '');
        await video.play().catch(() => {});

        const canvas = canvasRef.current;
        const ctx    = canvas.getContext('2d', { willReadFrequently: true });

        // Pre-load ZBar only if BarcodeDetector is unavailable
        const zbarScan = hasBarcodeDetector ? null : await getZBarScan();
        const detector = hasBarcodeDetector ? getBarcodeDetector() : null;

        // ── Scan tick ──────────────────────────────────────────────────────
        const tick = async () => {
          if (cancelled || !activeRef.current) return;
          if (video.readyState < 2) { timerRef.current = setTimeout(tick, 100); return; }

          try {
            let code = null;

            if (detector) {
              // ── Path 1: BarcodeDetector (VisionKit on iOS) ──────────────
              // Detect directly on the video element — no canvas needed.
              // VisionKit runs on the Neural Engine, extremely fast.
              const results = await detector.detect(video);
              if (results.length > 0) code = results[0].rawValue;

            } else {
              // ── Path 2: ZBar WASM fallback ──────────────────────────────
              const vw = video.videoWidth  || 1280;
              const vh = video.videoHeight || 720;
              // Crop to centre scan box only
              const cropW = Math.round(vw * 0.70);
              const cropH = Math.round(vh * 0.40);
              const cropX = Math.round((vw - cropW) / 2);
              const cropY = Math.round((vh - cropH) / 2);
              canvas.width  = cropW;
              canvas.height = cropH;
              ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
              const imageData = ctx.getImageData(0, 0, cropW, cropH);
              const symbols   = await zbarScan(imageData);
              if (symbols.length > 0) code = symbols[0].decode();
            }

            if (code && activeRef.current) {
              activeRef.current = false;
              onBarcodeFound(code);
              return;
            }
          } catch { /* skip bad frame */ }

          // BarcodeDetector is fast enough to poll every 80ms; ZBar needs 150ms
          timerRef.current = setTimeout(tick, detector ? 80 : 150);
        };

        timerRef.current = setTimeout(tick, 250); // wait for camera to stabilise

      } catch (err) {
        if (!cancelled) setCameraError(err.message || 'Không thể mở camera');
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timerRef.current);
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualMode, step]);

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  // ── Barcode found ─────────────────────────────────────────────────────────
  const onBarcodeFound = useCallback(async (barcode) => {
    clearTimeout(timerRef.current);
    stopStream();
    setStep(STEPS.LOOKUP);

    // Parse GS1 dates embedded in the barcode itself
    const gs1 = parseGS1Dates(barcode);

    // Lookup product info from APIs
    const data = await lookupBarcode(barcode);
    setLookupData(data);

    setForm(f => ({
      ...f,
      barcode,
      name:            data.name     || '',
      brand:           data.brand    || '',
      imageUrl:        data.imageUrl || '',
      // Prefer API dates, fall back to GS1-parsed dates from barcode
      manufactureDate: data.manufactureDate || gs1.manufactureDate || '',
      expiryDate:      data.expiryDate      || gs1.expiryDate      || '',
    }));
    setStep(STEPS.FORM);
  }, []);

  const handleManualSubmit = () => {
    if (!manualBarcode.trim()) return;
    activeRef.current = false;
    onBarcodeFound(manualBarcode.trim());
  };

  const handleFormSubmit = () => {
    if (!form.name) return;
    addProduct(form);
    setStep(STEPS.SUCCESS);
    setTimeout(() => onNavigate('home'), 1500);
  };

  const resetScanner = () => {
    setStep(STEPS.SCAN);
    activeRef.current = true;
    setManualBarcode('');
    setForm({ name: '', brand: '', barcode: '', manufactureDate: '', expiryDate: '', notifyDate: '', quantity: 1, imageUrl: '', notes: '' });
    setLookupData(null);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (step === STEPS.SUCCESS) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,230,118,0.15)' }}>
          <CheckCircle size={40} color="#00E676" />
        </div>
        <p className="text-white font-bold text-xl">Đã thêm sản phẩm!</p>
        <p className="text-white/40 text-sm">Đang chuyển về trang chủ...</p>
      </div>
    );
  }

  if (step === STEPS.LOOKUP) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <Loader2 size={40} className="text-white/60 animate-spin" />
        <p className="text-white/60">Đang tra cứu sản phẩm...</p>
      </div>
    );
  }

  if (step === STEPS.FORM) {
    return <ProductForm form={form} setForm={setForm} onSubmit={handleFormSubmit} onBack={resetScanner} lookupData={lookupData} />;
  }

  // ── SCAN UI ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-screen bg-black" style={{ height: '100dvh' }}>
      {/* Header */}
      <div className="flex items-center gap-4 px-5 pt-14 pb-4 z-10 relative flex-shrink-0">
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.08)' }}
        >
          <ArrowLeft size={20} className="text-white" />
        </button>
        <div className="flex-1">
          <h2 className="text-white font-bold text-lg">Quét mã barcode</h2>
          <p className="text-white/40 text-sm">Hướng camera vào mã vạch sản phẩm</p>
        </div>
      </div>

      {manualMode ? (
        /* ── Manual entry ── */
        <div className="flex-1 flex flex-col items-center justify-center px-8 gap-5">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-2" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <Keyboard size={28} className="text-white/60" />
          </div>
          <p className="text-white font-semibold">Nhập mã barcode thủ công</p>
          <input
            type="text"
            inputMode="numeric"
            placeholder="VD: 8934588011234"
            value={manualBarcode}
            onChange={e => setManualBarcode(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleManualSubmit()}
            className="w-full px-4 py-3 rounded-2xl text-white text-center text-lg tracking-widest outline-none"
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}
            autoFocus
          />
          <button
            onClick={handleManualSubmit}
            disabled={!manualBarcode.trim()}
            className="w-full py-3.5 rounded-2xl font-semibold transition-all active:scale-95 disabled:opacity-40"
            style={{ background: '#00E676', color: '#0F0F0F' }}
          >
            Tra cứu
          </button>
          <button onClick={() => setManualMode(false)} className="text-white/40 text-sm underline">
            Quay lại quét camera
          </button>
        </div>
      ) : (
        /* ── Camera view ── */
        <div className="flex-1 flex flex-col min-h-0">
          {cameraError ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 text-center">
              <AlertCircle size={40} className="text-red-400" />
              <p className="text-white/70 font-semibold">{cameraError}</p>
              <button
                onClick={() => setManualMode(true)}
                className="px-6 py-3 rounded-2xl font-semibold"
                style={{ background: 'rgba(255,255,255,0.08)', color: 'white' }}
              >
                Nhập thủ công
              </button>
            </div>
          ) : (
            <div className="relative flex-1 overflow-hidden">
              {/* Full-screen video */}
              <video
                ref={videoRef}
                className="absolute inset-0 w-full h-full object-cover"
                autoPlay
                playsInline
                muted
              />

              {/* Hidden canvas for ZBar */}
              <canvas ref={canvasRef} className="hidden" />

              {/* Overlay: darken outside scan box */}
              <div className="absolute inset-0 pointer-events-none" style={{ background: 'rgba(0,0,0,0.5)' }} />

              {/* Scan box — centred, 70% wide × 35% tall */}
              <div
                className="absolute pointer-events-none"
                style={{
                  left: '15%', right: '15%',
                  top: '32%',  bottom: '33%',
                  border: '2px solid rgba(0,230,118,0.9)',
                  borderRadius: 16,
                  boxShadow: '0 0 0 9999px rgba(0,0,0,0.5), 0 0 32px rgba(0,230,118,0.3)',
                  background: 'transparent',
                }}
              >
                {/* Corner marks */}
                {[
                  { top: -2, left: -2,  borderTop: '3px solid #00E676', borderLeft:  '3px solid #00E676', borderRadius: '12px 0 0 0' },
                  { top: -2, right: -2, borderTop: '3px solid #00E676', borderRight: '3px solid #00E676', borderRadius: '0 12px 0 0' },
                  { bottom: -2, left: -2,  borderBottom: '3px solid #00E676', borderLeft:  '3px solid #00E676', borderRadius: '0 0 0 12px' },
                  { bottom: -2, right: -2, borderBottom: '3px solid #00E676', borderRight: '3px solid #00E676', borderRadius: '0 0 12px 0' },
                ].map((s, i) => (
                  <div key={i} className="absolute w-7 h-7" style={s} />
                ))}

                {/* Scan line */}
                <div
                  className="absolute left-3 right-3 h-px"
                  style={{
                    background: 'linear-gradient(90deg, transparent, #00E676, transparent)',
                    animation: 'scanLine 1.6s ease-in-out infinite',
                  }}
                />
              </div>

              {/* Hint text */}
              <p
                className="absolute text-white/70 text-sm font-medium text-center w-full"
                style={{ bottom: '28%' }}
              >
                Đặt mã vạch vào khung
              </p>
            </div>
          )}

          {/* Bottom bar */}
          <div className="flex-shrink-0 p-5 pb-8">
            <button
              onClick={() => setManualMode(true)}
              className="w-full py-3.5 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2"
              style={{ background: 'rgba(255,255,255,0.09)', color: 'rgba(255,255,255,0.75)' }}
            >
              <Keyboard size={18} />
              Nhập mã thủ công
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes scanLine {
          0%   { top: 6%;  opacity: 0.4; }
          50%  { top: 88%; opacity: 1;   }
          100% { top: 6%;  opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

// ─── Product Form ─────────────────────────────────────────────────────────────
function ProductForm({ form, setForm, onSubmit, onBack, lookupData }) {
  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));
  const isValid = form.name.trim() !== '';

  const autoThresholdDays = (() => {
    if (!form.manufactureDate || !form.expiryDate) return null;
    const total = Math.round((new Date(form.expiryDate) - new Date(form.manufactureDate)) / 86400000);
    return total > 0 ? Math.floor(total / 3) : null;
  })();

  return (
    <div className="flex flex-col min-h-screen" style={{ paddingBottom: 32 }}>
      <div className="flex items-center gap-4 px-5 pt-14 pb-5">
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.08)' }}
        >
          <ArrowLeft size={20} className="text-white" />
        </button>
        <div>
          <h2 className="text-white font-bold text-lg">
            {lookupData?.found ? 'Xác nhận sản phẩm' : 'Thêm sản phẩm'}
          </h2>
          {form.barcode && <p className="text-white/30 text-xs font-mono">{form.barcode}</p>}
        </div>
      </div>

      <div className="flex-1 px-5 flex flex-col gap-4 overflow-y-auto">
        {form.imageUrl && (
          <div
            className="w-full h-40 rounded-2xl overflow-hidden flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.04)' }}
          >
            <img src={form.imageUrl} alt="product" className="h-full object-contain" onError={e => set('imageUrl', '')} />
          </div>
        )}
        {!lookupData?.found && !form.imageUrl && (
          <div
            className="w-full h-28 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(255,255,255,0.1)' }}
          >
            <div className="text-center">
              <Package size={24} className="text-white/20 mx-auto mb-1" />
              <p className="text-white/20 text-xs">Không tìm thấy hình ảnh</p>
            </div>
          </div>
        )}

        <Field label="Tên sản phẩm *" required>
          <input type="text" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Nhập tên sản phẩm" className={inputCls} />
        </Field>

        <Field label="Thương hiệu">
          <input type="text" value={form.brand} onChange={e => set('brand', e.target.value)} placeholder="VD: Vinamilk, Nestle..." className={inputCls} />
        </Field>

        <Field label="Ngày sản xuất (NSX)">
          <input type="date" value={form.manufactureDate} onChange={e => set('manufactureDate', e.target.value)} className={inputCls} style={{ colorScheme: 'dark' }} />
        </Field>

        <Field label="Hạn sử dụng (HSD)">
          <input type="date" value={form.expiryDate} onChange={e => set('expiryDate', e.target.value)} className={inputCls} style={{ colorScheme: 'dark' }} />
        </Field>

        {autoThresholdDays !== null && (
          <p className="text-white/40 text-xs px-1">
            Ngưỡng cảnh báo tự động: ~{autoThresholdDays} ngày
          </p>
        )}

        {!form.manufactureDate && (
          <Field label="Ngày thông báo (tùy chọn)">
            <input type="date" value={form.notifyDate || ''} onChange={e => set('notifyDate', e.target.value)} className={inputCls} style={{ colorScheme: 'dark' }} />
          </Field>
        )}

        <Field label="Số lượng">
          <div className="flex items-center gap-3 px-1">
            <button
              onClick={() => set('quantity', Math.max(1, form.quantity - 1))}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold"
              style={{ background: 'rgba(255,255,255,0.06)' }}
            >−</button>
            <span className="text-white font-bold text-lg flex-1 text-center">{form.quantity}</span>
            <button
              onClick={() => set('quantity', form.quantity + 1)}
              className="w-10 h-10 rounded-xl flex items-center justify-center font-bold"
              style={{ background: 'rgba(0,230,118,0.12)', color: '#00E676' }}
            >+</button>
          </div>
        </Field>

        <Field label="Ghi chú">
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Ghi chú thêm..." rows={3} className={inputCls + ' resize-none'} />
        </Field>

        <button
          onClick={onSubmit}
          disabled={!isValid}
          className="w-full py-4 rounded-2xl font-bold text-base transition-all active:scale-95 disabled:opacity-40"
          style={{ background: isValid ? '#00E676' : 'rgba(255,255,255,0.1)', color: '#0F0F0F' }}
        >
          Lưu sản phẩm
        </button>
      </div>
    </div>
  );
}

const inputCls   = 'w-full px-4 py-3 rounded-xl text-white text-sm outline-none bg-transparent';
const inputStyle = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' };

function Field({ label, children, required, className = '' }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label className="text-white/50 text-xs font-semibold tracking-wide uppercase px-1">
        {label}{required && <span className="text-red-400 ml-1">*</span>}
      </label>
      <div style={inputStyle} className="rounded-xl overflow-hidden">{children}</div>
    </div>
  );
}
