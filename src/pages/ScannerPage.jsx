/**
 * ScannerPage – iPhone 11 Pro Max · Ultra-fast scanning · Redesigned UI
 *
 * Scanning engine (ZBar WASM — works on all iOS browsers):
 * - Camera: max 480×360 → ZBar processes ~58K pixels/frame → ~10-20ms/frame
 * - requestAnimationFrame loop @ 40ms → instant response, no setTimeout lag
 * - Pre-allocated canvas → zero GC pressure, no re-allocation per frame
 * - No initial delay → first scan attempt ~50ms after camera starts
 *
 * GS1 parser extracts: NSX (AI 11), HSD (AI 17/15), Lot (AI 10) from barcode
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { ArrowLeft, Keyboard, CheckCircle, Package, AlertCircle } from 'lucide-react';
import { scanImageData } from '@undecaf/zbar-wasm';
import { lookupBarcode } from '../services/barcodeApiService';
import { useProducts } from '../context/ProductContext';

const STEPS = { SCAN: 'scan', LOOKUP: 'lookup', FORM: 'form', SUCCESS: 'success' };

// ─── GS1 DataMatrix parser ─────────────────────────────────────────────
function parseGS1Dates(raw) {
  const result = { manufactureDate: '', expiryDate: '', batchNumber: '' };
  if (!raw) return result;
  const s = raw.replace(/\((\d{2,4})\)/g, '$1').replace(/[\x1d\x1c\x1e]/g, '');
  const parseYYMMDD = (yymmdd) => {
    if (!yymmdd || yymmdd.length < 6) return '';
    const yy = parseInt(yymmdd.slice(0, 2), 10);
    const mm = yymmdd.slice(2, 4);
    const dd = yymmdd.slice(4, 6);
    if (dd === '00' || mm === '00' || mm > '12') return '';
    const yyyy = yy >= 0 && yy <= 30 ? 2000 + yy : 1900 + yy;
    return `${yyyy}-${mm}-${dd}`;
  };
  const findDate = (ai) => {
    const idx = s.indexOf(ai);
    if (idx === -1) return '';
    if (idx > 0 && /\d/.test(s[idx - 1])) return '';
    return parseYYMMDD(s.substring(idx + ai.length, idx + ai.length + 6));
  };
  const extractLot = () => {
    const idx = s.indexOf('10');
    if (idx === -1 || (idx > 0 && /\d/.test(s[idx - 1]))) return '';
    let end = idx + 2;
    while (end < s.length) {
      if (end >= idx + 3 && /^\d{2,}/.test(s.substring(end))) break;
      end++;
    }
    return s.substring(idx + 2, end).replace(/[^\w\-./]/g, '').trim();
  };
  result.manufactureDate = findDate('11');
  result.expiryDate      = findDate('17') || findDate('15');
  result.batchNumber     = extractLot();
  return result;
}

// ─── Camera open — balances resolution vs ZBar speed ─────────────────
async function openCamera() {
  // 640×480 (VGA) gives enough detail for EAN-13/GS1 while keeping
  // pixel count low enough for ZBar WASM to process in ~15-25ms.
  // `ideal` (not `exact`) lets iOS Safari fall back gracefully.
  const constraints = {
    video: {
      facingMode: { ideal: 'environment' },
      width:  { min: 480, ideal: 640, max: 1280 },
      height: { min: 360, ideal: 480, max: 720 },
    },
    audio: false,
  };
  try {
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (e) {
    // Fallback: drop `ideal` facingMode in case OverconstrainedError
    console.warn('[Scanner] First camera attempt failed:', e.message);
    const fallback = {
      video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    };
    return navigator.mediaDevices.getUserMedia(fallback);
  }
}

// ─── Main component ────────────────────────────────────────────────────
export function ScannerPage({ onBack, onNavigate }) {
  const { addProduct } = useProducts();

  const videoRef   = useRef(null);
  const canvasRef  = useRef(null);
  const streamRef  = useRef(null);
  const rafRef     = useRef(null);
  const activeRef  = useRef(true);
  const dimsRef    = useRef({ w: 0, h: 0 });  // cached canvas dimensions

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

  // ── Scan loop (requestAnimationFrame) ─────────────────────────────
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

        let lastScan = 0;
        const SCAN_MS = 40; // ~25 scans/sec — fast, leaves CPU for rendering

        const tick = async (timestamp) => {
          if (cancelled || !activeRef.current) { rafRef.current = null; return; }

          // Always schedule next frame first (ensures smooth loop)
          rafRef.current = requestAnimationFrame(tick);

          // Rate-limit actual processing to SCAN_MS
          if (timestamp - lastScan < SCAN_MS) return;
          lastScan = timestamp;

          if (video.readyState < 2) return;

          try {
            const vw = video.videoWidth;
            const vh = video.videoHeight;
            if (!vw || !vh) return;

            // Crop to scan box region: centre 85% × 60%
            // Larger crop = barcode more likely to be inside
            const cropW = Math.round(vw * 0.85);
            const cropH = Math.round(vh * 0.60);
            const cropX = Math.round((vw - cropW) / 2);
            const cropY = Math.round((vh - cropH) / 2);

            // Pre-allocate canvas — only re-allocate when dimensions change
            const d = dimsRef.current;
            if (d.w !== cropW || d.h !== cropH) {
              canvas.width  = cropW;
              canvas.height = cropH;
              d.w = cropW;
              d.h = cropH;
            }

            ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
            const imageData = ctx.getImageData(0, 0, cropW, cropH);
            const symbols = await scanImageData(imageData);

            if (symbols.length > 0 && activeRef.current) {
              const code = symbols[0].decode();
              if (code) {
                activeRef.current = false;
                setScanFlash(true);
                setTimeout(() => setScanFlash(false), 300);
                onBarcodeFound(code);
                rafRef.current = null;
                return;
              }
            }
          } catch (err) {
            if (import.meta.env.DEV) {
              console.warn('[Scanner] scan error:', err);
            }
          }
        };

        // Start scanning immediately (no artificial delay)
        rafRef.current = requestAnimationFrame(tick);

      } catch (err) {
        if (!cancelled) setCameraError(err.message || 'Không thể mở camera');
      }
    })();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
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
    stopStream();
    setStep(STEPS.LOOKUP);
    const gs1 = parseGS1Dates(barcode);
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

  // ── Render: SUCCESS ───────────────────────────────────────────────
  if (step === STEPS.SUCCESS) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black gap-4">
        <div className="relative">
          {/* Expanding green circle */}
          <div className="animate-successExpand w-24 h-24 rounded-full bg-[#00E676] flex items-center justify-center">
            <CheckCircle size={48} className="text-black" strokeWidth={2.5} />
          </div>
        </div>
        <p className="text-white font-bold text-xl mt-2">Đã thêm sản phẩm!</p>
        <p className="text-white/40 text-sm">Đang chuyển về trang chủ...</p>
      </div>
    );
  }

  // ── Render: LOOKUP ────────────────────────────────────────────────
  if (step === STEPS.LOOKUP) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black gap-4">
        <div className="w-16 h-16 rounded-full border-2 border-[#00E676] border-t-transparent animate-spin" />
        <p className="text-white/60">Đang tra cứu sản phẩm...</p>
      </div>
    );
  }

  // ── Render: FORM ──────────────────────────────────────────────────
  if (step === STEPS.FORM) {
    return <ProductForm form={form} setForm={setForm} onSubmit={handleFormSubmit} onBack={resetScanner} lookupData={lookupData} />;
  }

  // ── Render: SCAN (redesigned UI) ──────────────────────────────────
  return (
    <div className="flex flex-col min-h-screen bg-black" style={{ height: '100dvh' }}>
      {manualMode ? (
        /* ══ Manual entry ══ */
        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-5">
          <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <Keyboard size={28} className="text-white/50" />
          </div>
          <p className="text-white font-semibold text-lg">Nhập mã barcode</p>
          <input
            type="text"
            inputMode="numeric"
            placeholder="8934588011234"
            value={manualBarcode}
            onChange={e => setManualBarcode(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleManualSubmit()}
            className="w-full max-w-xs px-5 py-4 rounded-2xl text-white text-center text-xl tracking-[0.3em] outline-none font-mono"
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}
            autoFocus
          />
          <button
            onClick={handleManualSubmit}
            disabled={!manualBarcode.trim()}
            className="w-full max-w-xs py-4 rounded-2xl font-semibold text-base transition-all active:scale-[0.97] disabled:opacity-30"
            style={{ background: '#00E676', color: '#0F0F0F' }}
          >
            Tra cứu
          </button>
          <button onClick={() => setManualMode(false)} className="text-white/30 text-sm underline underline-offset-4">
            Quay lại quét camera
          </button>
        </div>
      ) : (
        /* ══ Camera view (redesigned) ══ */
        <div className="relative flex-1 overflow-hidden">
          {/* Camera feed */}
          <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" autoPlay playsInline muted />
          <canvas ref={canvasRef} className="hidden" />

          {/* Gradient overlays for readability */}
          <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-black/70 via-black/30 to-transparent z-10" />
          <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/70 via-black/30 to-transparent z-10" />

          {/* Top bar (glassmorphism) */}
          <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-5 pt-14">
            <button
              onClick={onBack}
              className="w-10 h-10 rounded-xl flex items-center justify-center active:scale-90 transition-all"
              style={{ background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
            >
              <ArrowLeft size={20} className="text-white" />
            </button>
            <div className="text-right">
              <p className="text-white font-semibold text-sm drop-shadow-lg">Quét mã vạch</p>
              <p className="text-white/60 text-xs drop-shadow-lg">Đưa mã vào khung</p>
            </div>
          </div>

          {/* Success flash overlay */}
          {scanFlash && (
            <div
              className="absolute inset-0 z-30 pointer-events-none"
              style={{
                background: 'radial-gradient(circle at center, rgba(0,230,118,0.35), transparent 70%)',
                animation: 'flashOut 0.3s ease-out',
              }}
            />
          )}

          {/* Scan box — larger, with breathing glow */}
          <div
            className="absolute pointer-events-none z-10"
            style={{
              left: '12%', right: '12%',
              top: '28%',  bottom: '28%',
              borderRadius: 20,
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
              background: 'transparent',
            }}
          >
            {/* Animated border glow */}
            <div
              className="absolute inset-0 rounded-[20px]"
              style={{
                border: '2px solid rgba(0,230,118,0.7)',
                animation: 'borderPulse 2.4s ease-in-out infinite',
              }}
            />

            {/* Corner marks */}
            {[
              { top: -2, left: -2,  borderTop: '3px solid #00E676', borderLeft: '3px solid #00E676', borderRadius: '16px 0 0 0' },
              { top: -2, right: -2, borderTop: '3px solid #00E676', borderRight: '3px solid #00E676', borderRadius: '0 16px 0 0' },
              { bottom: -2, left: -2,  borderBottom: '3px solid #00E676', borderLeft: '3px solid #00E676', borderRadius: '0 0 0 16px' },
              { bottom: -2, right: -2, borderBottom: '3px solid #00E676', borderRight: '3px solid #00E676', borderRadius: '0 0 16px 0' },
            ].map((s, i) => (
              <div key={i} className="absolute w-6 h-6" style={s} />
            ))}

            {/* Scan line */}
            <div
              className="absolute left-2 right-2 h-[1.5px]"
              style={{
                background: 'linear-gradient(90deg, transparent 5%, rgba(0,230,118,0.9) 50%, transparent 95%)',
                animation: 'scanLine 1.8s ease-in-out infinite',
                filter: 'blur(0.5px)',
              }}
            />
          </div>

          {/* Hint text */}
          <p className="absolute inset-x-0 z-10 text-white/80 text-xs font-medium text-center tracking-wide drop-shadow-lg" style={{ bottom: '32%' }}>
            Tự động nhận diện — giữ máy ổn định
          </p>

          {/* Bottom action — floating glassmorphism button */}
          <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center pb-12">
            <button
              onClick={() => setManualMode(true)}
              className="flex items-center gap-2.5 px-6 py-3.5 rounded-2xl text-sm font-semibold active:scale-95 transition-all"
              style={{
                background: 'rgba(255,255,255,0.1)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: 'rgba(255,255,255,0.85)',
              }}
            >
              <Keyboard size={17} />
              Nhập mã thủ công
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes scanLine {
          0%   { top: 8%;  opacity: 0.2; }
          40%  { top: 46%; opacity: 1;   }
          60%  { top: 46%; opacity: 1;   }
          100% { top: 88%; opacity: 0.2; }
        }
        @keyframes borderPulse {
          0%, 100% { border-color: rgba(0,230,118,0.5); box-shadow: 0 0 12px rgba(0,230,118,0.15); }
          50%      { border-color: rgba(0,230,118,0.9); box-shadow: 0 0 24px rgba(0,230,118,0.3);  }
        }
        @keyframes flashOut {
          0%   { opacity: 1; transform: scale(1);   }
          100% { opacity: 0; transform: scale(1.3); }
        }
        @keyframes successExpand {
          0%   { transform: scale(0.6); opacity: 0; }
          50%  { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(1);   opacity: 1; }
        }
        .animate-successExpand {
          animation: successExpand 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
      `}</style>
    </div>
  );
}

// ─── Product Form (polished) ───────────────────────────────────────────
function ProductForm({ form, setForm, onSubmit, onBack, lookupData }) {
  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));
  const isValid = form.name.trim() !== '';

  const autoThresholdDays = (() => {
    if (!form.manufactureDate || !form.expiryDate) return null;
    const total = Math.round((new Date(form.expiryDate) - new Date(form.manufactureDate)) / 86400000);
    return total > 0 ? Math.floor(total / 3) : null;
  })();

  return (
    <div className="flex flex-col min-h-screen bg-black">
      {/* Header */}
      <div className="flex items-center gap-4 px-5 pt-14 pb-4">
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-xl flex items-center justify-center active:scale-90 transition-all"
          style={{ background: 'rgba(255,255,255,0.08)' }}
        >
          <ArrowLeft size={20} className="text-white" />
        </button>
        <div>
          <h2 className="text-white font-bold text-lg">
            {lookupData?.found ? 'Xác nhận sản phẩm' : 'Thêm sản phẩm'}
          </h2>
          {form.barcode && <p className="text-white/25 text-xs font-mono mt-0.5">{form.barcode}</p>}
        </div>
      </div>

      <div className="flex-1 px-5 flex flex-col gap-4 overflow-y-auto pb-8">
        {/* Product image */}
        {form.imageUrl ? (
          <div className="w-full h-40 rounded-2xl overflow-hidden flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <img src={form.imageUrl} alt="" className="h-full object-contain" onError={e => set('imageUrl', '')} />
          </div>
        ) : (
          !lookupData?.found && (
            <div className="w-full h-28 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.08)' }}>
              <div className="text-center">
                <Package size={22} className="text-white/15 mx-auto mb-1" />
                <p className="text-white/15 text-xs">Không có ảnh</p>
              </div>
            </div>
          )
        )}

        <Field label="Tên sản phẩm *" required>
          <input type="text" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Nhập tên" className={inputCls} />
        </Field>

        <Field label="Thương hiệu">
          <input type="text" value={form.brand} onChange={e => set('brand', e.target.value)} placeholder="Vinamilk, Nestle..." className={inputCls} />
        </Field>

        <Field label="Ngày sản xuất (NSX)">
          <input type="date" value={form.manufactureDate} onChange={e => set('manufactureDate', e.target.value)} className={inputCls} style={{ colorScheme: 'dark' }} />
        </Field>

        <Field label="Hạn sử dụng (HSD)">
          <input type="date" value={form.expiryDate} onChange={e => set('expiryDate', e.target.value)} className={inputCls} style={{ colorScheme: 'dark' }} />
        </Field>

        {autoThresholdDays !== null && (
          <p className="text-white/35 text-xs px-1 -mt-2">Ngưỡng cảnh báo: ~{autoThresholdDays} ngày</p>
        )}

        {!form.manufactureDate && (
          <Field label="Ngày thông báo">
            <input type="date" value={form.notifyDate || ''} onChange={e => set('notifyDate', e.target.value)} className={inputCls} style={{ colorScheme: 'dark' }} />
          </Field>
        )}

        <Field label="Số lượng">
          <div className="flex items-center gap-4 px-2 py-1">
            <button onClick={() => set('quantity', Math.max(1, form.quantity - 1))} className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold active:scale-90 transition-all" style={{ background: 'rgba(255,255,255,0.06)' }}>−</button>
            <span className="text-white font-bold text-lg flex-1 text-center">{form.quantity}</span>
            <button onClick={() => set('quantity', form.quantity + 1)} className="w-9 h-9 rounded-xl flex items-center justify-center font-bold active:scale-90 transition-all" style={{ background: 'rgba(0,230,118,0.12)', color: '#00E676' }}>+</button>
          </div>
        </Field>

        <Field label="Ghi chú">
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Ghi chú thêm..." rows={3} className={`${inputCls} resize-none`} />
        </Field>

        <button
          onClick={onSubmit}
          disabled={!isValid}
          className="w-full py-4 rounded-2xl font-bold text-base transition-all active:scale-[0.97] disabled:opacity-30 mt-2"
          style={{ background: isValid ? '#00E676' : 'rgba(255,255,255,0.08)', color: isValid ? '#0F0F0F' : 'rgba(255,255,255,0.3)' }}
        >
          Lưu sản phẩm
        </button>
      </div>
    </div>
  );
}

const inputCls   = 'w-full px-4 py-3 rounded-xl text-white text-sm outline-none bg-transparent';
const inputStyle = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' };

function Field({ label, children, required }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-white/45 text-xs font-semibold tracking-wide uppercase px-1">
        {label}{required && <span className="text-red-400 ml-1.5">*</span>}
      </label>
      <div style={inputStyle} className="rounded-xl overflow-hidden">{children}</div>
    </div>
  );
}
