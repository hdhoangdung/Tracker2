/**
 * ScannerPage – optimised for iPhone 11 Pro Max
 *
 * Scanning strategy:
 * 1. ZBar WASM            — primary engine (only option on iOS Safari)
 * 2. BarcodeDetector API  — secondary path (Chrome/Android only)
 *
 * iPhone 11 Pro Max optimisations:
 * - Camera: 640×480 (4:3) — matches sensor aspect ratio, fastest for ZBar
 * - ZBar poll: 80ms       — fast enough for real-time, not too CPU-heavy
 * - Preload ZBar at import — zero delay when scanning starts
 * - GS1 DataMatrix parser — extracts NSX (AI 11), HSD (AI 17/15), lot (AI 10)
 * - Green flash animation on successful scan
 *
 * iOS-specific notes:
 * - `playsInline` + `muted` required for video autoplay
 * - `facingMode: { exact: 'environment' }` selects rear Wide camera (26mm f/1.8)
 * - No `advanced` constraints (torch/focusMode throw OverconstrainedError on iOS)
 * - BarcodeDetector is NOT available on any iOS browser (all use WKWebView)
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { ArrowLeft, Keyboard, Loader2, CheckCircle, Package, AlertCircle } from 'lucide-react';
import { scanImageData } from '@undecaf/zbar-wasm';
import { lookupBarcode } from '../services/barcodeApiService';
import { useProducts } from '../context/ProductContext';

const STEPS = { SCAN: 'scan', LOOKUP: 'lookup', FORM: 'form', SUCCESS: 'success' };

// ─── BarcodeDetector (Chrome/Android only) ─────────────────────────────
const hasBarcodeDetector = typeof window !== 'undefined' && 'BarcodeDetector' in window;

const BD_FORMATS = [
  'aztec','code_128','code_39','code_93','codabar','data_matrix',
  'ean_13','ean_8','itf','pdf417','qr_code','upc_a','upc_e',
];

let _barcodeDetector = null;
function getBarcodeDetector() {
  if (_barcodeDetector) return _barcodeDetector;
  _barcodeDetector = new BarcodeDetector({ formats: BD_FORMATS });
  return _barcodeDetector;
}

// ─── GS1 DataMatrix parser ─────────────────────────────────────────────
// GS1 Application Identifiers:
//   AI (11) = Manufacture date  (YYMMDD)
//   AI (15) = Best before date  (YYMMDD)
//   AI (17) = Expiry date       (YYMMDD)
//   AI (10) = Batch / Lot number
function parseGS1Dates(raw) {
  const result = { manufactureDate: '', expiryDate: '', batchNumber: '' };
  if (!raw) return result;

  // Normalise: strip parentheses like (11)250101 → 11250101,
  // replace FNC1 (ASCII 29) and other GS separators
  const s = raw.replace(/\((\d{2,4})\)/g, '$1').replace(/[\x1d\x1c\x1e]/g, '');

  const parseYYMMDD = (yymmdd) => {
    if (!yymmdd || yymmdd.length < 6) return '';
    const yy = parseInt(yymmdd.slice(0, 2), 10);
    const mm = yymmdd.slice(2, 4);
    const dd = yymmdd.slice(4, 6);
    // 00 day or 00 month is invalid
    if (dd === '00' || mm === '00' || mm > '12') return '';
    const yyyy = yy >= 0 && yy <= 30 ? 2000 + yy : 1900 + yy;
    return `${yyyy}-${mm}-${dd}`;
  };

  // Find AI followed by exactly 6 digits (date format YYMMDD)
  const findDate = (ai) => {
    const idx = s.indexOf(ai);
    if (idx === -1) return '';
    // AI must not be part of a longer number — check preceding char
    if (idx > 0 && /\d/.test(s[idx - 1])) return '';
    const dateStr = s.substring(idx + ai.length, idx + ai.length + 6);
    return parseYYMMDD(dateStr);
  };

  // Extract batch/lot number (AI 10) — variable length, alphanumeric,
  // delimited by next AI (2+ digits) or end of string
  const extractLot = () => {
    const idx = s.indexOf('10');
    if (idx === -1) return '';
    // Preceding char must not be a digit (avoid matching inside a larger number)
    if (idx > 0 && /\d/.test(s[idx - 1])) return '';
    const start = idx + 2;
    let end = start;
    while (end < s.length) {
      // If we find 2+ consecutive digits that look like a new AI, stop
      // (GS1 AIs are 2-4 digits, so 2+ digits likely starts next AI)
      if (end >= start + 1 && /^\d{2,}/.test(s.substring(end))) break;
      end++;
    }
    return s.substring(start, end).replace(/[^\w\-./]/g, '').trim();
  };

  result.manufactureDate = findDate('11');
  result.expiryDate      = findDate('17') || findDate('15');
  result.batchNumber     = extractLot();

  return result;
}

// ─── Camera open (optimised for iPhone 11 Pro Max) ─────────────────────
async function openCamera() {
  // iPhone 11 Pro Max Wide camera: 12MP, 26mm, f/1.8, OIS
  // 640×480 (4:3) matches sensor native aspect ratio → no crop, max FOV
  // Sufficient resolution for ZBar — keeps canvas small → faster processing
  const constraints = {
    video: {
      facingMode: { exact: 'environment' },
      width:  { ideal: 640 },
      height: { ideal: 480 },
    },
    audio: false,
  };
  return navigator.mediaDevices.getUserMedia(constraints);
}

// ─── Main component ────────────────────────────────────────────────────
export function ScannerPage({ onBack, onNavigate }) {
  const { addProduct } = useProducts();

  const videoRef    = useRef(null);
  const canvasRef   = useRef(null);
  const streamRef   = useRef(null);
  const timerRef    = useRef(null);
  const activeRef   = useRef(true);

  const [step, setStep]             = useState(STEPS.SCAN);
  const [manualMode, setManualMode] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const [lookupData, setLookupData] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [scanFlash, setScanFlash]   = useState(false);
  const [form, setForm] = useState({
    name: '', brand: '', barcode: '', manufactureDate: '', expiryDate: '',
    notifyDate: '', quantity: 1, imageUrl: '', notes: '',
  });

  // ── Camera + scan loop ─────────────────────────────────────────────
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
        video.setAttribute('playsinline', '');
        video.setAttribute('muted', '');
        await video.play().catch(() => {});

        const canvas = canvasRef.current;
        const ctx    = canvas.getContext('2d', { willReadFrequently: true });

        // ZBar is already loaded eagerly at import time (zero delay).
        // BarcodeDetector is initialised on demand for Chrome/Android.
        const detector = hasBarcodeDetector ? getBarcodeDetector() : null;

        // ── Scan tick ──────────────────────────────────────────────
        const tick = async () => {
          if (cancelled || !activeRef.current) return;
          if (video.readyState < 2) { timerRef.current = setTimeout(tick, 50); return; }

          try {
            let code = null;
            const vw = video.videoWidth  || 640;
            const vh = video.videoHeight || 480;

            if (detector) {
              // Path: BarcodeDetector (Chrome/Android via native API)
              const results = await detector.detect(video);
              if (results.length > 0) code = results[0].rawValue;
            } else {
              // Path: ZBar WASM — primary engine on iPhone 11 Pro Max
              // Crop to centre scan box only → reduces pixel count ~72%
              const cropW = Math.round(vw * 0.70);
              const cropH = Math.round(vh * 0.40);
              const cropX = Math.round((vw - cropW) / 2);
              const cropY = Math.round((vh - cropH) / 2);
              canvas.width  = cropW;
              canvas.height = cropH;
              ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
              const imageData = ctx.getImageData(0, 0, cropW, cropH);
              const symbols   = await scanImageData(imageData);
              if (symbols.length > 0) code = symbols[0].decode();
            }

            if (code && activeRef.current) {
              activeRef.current = false;
              // Green flash — visual feedback on success
              setScanFlash(true);
              setTimeout(() => setScanFlash(false), 250);
              onBarcodeFound(code);
              return;
            }
          } catch { /* skip bad frame — continue scanning */ }

          // 80ms interval: fast enough for real-time, leaves CPU for rendering
          timerRef.current = setTimeout(tick, 80);
        };

        // Allow camera to stabilise before first scan attempt
        timerRef.current = setTimeout(tick, 300);

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

  // ── Barcode found ─────────────────────────────────────────────────
  const onBarcodeFound = useCallback(async (barcode) => {
    clearTimeout(timerRef.current);
    stopStream();
    setStep(STEPS.LOOKUP);

    // Parse GS1 dates + lot number from the barcode itself
    const gs1 = parseGS1Dates(barcode);

    // Lookup product info from online APIs
    const data = await lookupBarcode(barcode);
    setLookupData(data);

    setForm(f => ({
      ...f,
      barcode,
      name:            data.name     || '',
      brand:           data.brand    || '',
      imageUrl:        data.imageUrl || '',
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
    setScanFlash(false);
  };

  // ── Render ────────────────────────────────────────────────────────
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

  // ── SCAN UI ───────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-screen bg-black" style={{ height: '100dvh' }}>
      {/* Header */}
      <div className="flex items-center gap-4 px-5 pt-14 pb-4 z-10 relative flex-shrink-0">
        <button
          onClick={onBack}
          className="w-11 h-11 rounded-2xl flex items-center justify-center active:scale-90 transition-all"
          style={{ background: 'rgba(255,255,255,0.08)' }}
        >
          <ArrowLeft size={20} className="text-white" />
        </button>
        <div className="flex-1">
          <h2 className="text-white font-bold text-lg">Quét mã barcode</h2>
          <p className="text-white/40 text-sm">Hướng camera vào mã vạch</p>
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
                className="px-6 py-3 rounded-2xl font-semibold transition-all active:scale-95"
                style={{ background: 'rgba(255,255,255,0.08)', color: 'white' }}
              >
                Nhập thủ công
              </button>
            </div>
          ) : (
            <div className="relative flex-1 overflow-hidden">
              {/* Camera feed — full screen behind everything */}
              <video
                ref={videoRef}
                className="absolute inset-0 w-full h-full object-cover"
                autoPlay
                playsInline
                muted
              />

              {/* Hidden canvas for ZBar processing */}
              <canvas ref={canvasRef} className="hidden" />

              {/* Green flash overlay on successful scan */}
              {scanFlash && (
                <div
                  className="absolute inset-0 z-20 pointer-events-none"
                  style={{
                    background: 'rgba(0,230,118,0.35)',
                    animation: 'flashOut 0.25s ease-out',
                  }}
                />
              )}

              {/* Scan box — clear camera in centre, dark outside via boxShadow */}
              <div
                className="absolute pointer-events-none z-10"
                style={{
                  left: '15%', right: '15%',
                  top: '32%',  bottom: '33%',
                  border: '2px solid rgba(0,230,118,0.85)',
                  borderRadius: 16,
                  boxShadow: '0 0 0 9999px rgba(0,0,0,0.55), 0 0 24px rgba(0,230,118,0.25)',
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

                {/* Scan line animation */}
                <div
                  className="absolute left-2 right-2 h-px"
                  style={{
                    background: 'linear-gradient(90deg, transparent, #00E676, transparent)',
                    animation: 'scanLine 1.6s ease-in-out infinite',
                    willChange: 'top, opacity',
                  }}
                />
              </div>

              {/* Hint text */}
              <p
                className="absolute text-white/70 text-sm font-medium text-center w-full z-10"
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
              className="w-full py-3.5 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all"
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
          0%   { top: 6%;  opacity: 0.3; }
          50%  { top: 88%; opacity: 1;   }
          100% { top: 6%;  opacity: 0.3; }
        }
        @keyframes flashOut {
          0%   { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ─── Product Form ──────────────────────────────────────────────────────
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
          className="w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-all"
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
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold active:scale-90 transition-all"
              style={{ background: 'rgba(255,255,255,0.06)' }}
            >−</button>
            <span className="text-white font-bold text-lg flex-1 text-center">{form.quantity}</span>
            <button
              onClick={() => set('quantity', form.quantity + 1)}
              className="w-10 h-10 rounded-xl flex items-center justify-center font-bold active:scale-90 transition-all"
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
