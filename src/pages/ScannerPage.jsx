import { useEffect, useRef, useState, useCallback } from 'react';
import {
  ArrowLeft, Keyboard, Loader2, CheckCircle, Package, AlertCircle
} from 'lucide-react';
import { lookupBarcode } from '../services/barcodeApiService';
import { useProducts } from '../context/ProductContext';
import dayjs from 'dayjs';

const STEPS = { SCAN: 'scan', LOOKUP: 'lookup', FORM: 'form', SUCCESS: 'success' };

// ─── ZBar WASM scanner ────────────────────────────────────────────────────────
// Scans a canvas ImageData using ZBar (compiled to WASM) — much faster than
// ZXing on mobile because it runs natively via WebAssembly.
let zbarModule = null;
async function getZBar() {
  if (zbarModule) return zbarModule;
  const { scanImageData } = await import('@undecaf/zbar-wasm');
  zbarModule = { scanImageData };
  return zbarModule;
}

// ─── Camera helpers ───────────────────────────────────────────────────────────
async function openCamera(deviceId) {
  // Best constraints for barcode scanning on mobile:
  // - High resolution so small barcodes are readable
  // - Continuous autofocus
  // - Torch off by default (user can enable)
  const base = {
    width:  { ideal: 1920 },
    height: { ideal: 1080 },
    facingMode: deviceId ? undefined : 'environment',
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  };

  // Try with continuous autofocus + high res
  for (const advanced of [
    [{ focusMode: 'continuous' }, { zoom: 1.0 }],
    [{ focusMode: 'continuous' }],
    [],
  ]) {
    try {
      const constraints = { video: advanced.length ? { ...base, advanced } : base, audio: false };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      return stream;
    } catch {
      // try next constraint set
    }
  }
  throw new Error('Không thể mở camera');
}

// ─── Main component ───────────────────────────────────────────────────────────
export function ScannerPage({ onBack, onNavigate }) {
  const { addProduct } = useProducts();
  const videoRef   = useRef(null);
  const canvasRef  = useRef(null);
  const streamRef  = useRef(null);
  const rafRef     = useRef(null);
  const scanningRef = useRef(true);

  const [step, setStep]           = useState(STEPS.SCAN);
  const [manualMode, setManualMode] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const [lookupData, setLookupData] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [torchOn, setTorchOn]     = useState(false);
  const [form, setForm] = useState({
    name: '', brand: '', barcode: '', manufactureDate: '', expiryDate: '',
    notifyDate: '', quantity: 1, imageUrl: '', notes: '',
  });

  // ── Start camera + scan loop ──────────────────────────────────────────────
  useEffect(() => {
    if (manualMode || step !== STEPS.SCAN) return;
    let cancelled = false;
    scanningRef.current = true;

    (async () => {
      try {
        // Pick back camera
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cams    = devices.filter(d => d.kind === 'videoinput');
        const back    = cams.find(d => /back|rear|environment/i.test(d.label))
                     || cams[cams.length - 1];

        const stream = await openCamera(back?.deviceId);
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }

        streamRef.current = stream;
        const video = videoRef.current;
        video.srcObject = stream;
        await video.play();

        // Load ZBar WASM
        const { scanImageData } = await getZBar();
        const canvas = canvasRef.current;
        const ctx    = canvas.getContext('2d', { willReadFrequently: true });

        // Scan loop — capture a frame every ~100 ms and run ZBar on it
        const tick = async () => {
          if (cancelled || !scanningRef.current) return;
          if (video.readyState >= 2) {
            canvas.width  = video.videoWidth  || 640;
            canvas.height = video.videoHeight || 480;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            try {
              const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const symbols   = await scanImageData(imageData);
              if (symbols.length > 0 && scanningRef.current) {
                const code = symbols[0].decode();
                if (code) {
                  scanningRef.current = false;
                  handleBarcode(code);
                  return;
                }
              }
            } catch {
              // ZBar error on this frame — skip
            }
          }
          rafRef.current = setTimeout(tick, 100);
        };
        rafRef.current = setTimeout(tick, 200); // small delay for video to stabilise

      } catch (err) {
        if (!cancelled) setCameraError(err.message || 'Không thể mở camera');
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(rafRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualMode, step]);

  // ── Torch toggle ─────────────────────────────────────────────────────────
  const toggleTorch = useCallback(async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn }] });
      setTorchOn(v => !v);
    } catch {
      // torch not supported
    }
  }, [torchOn]);

  // ── Barcode found ─────────────────────────────────────────────────────────
  const handleBarcode = useCallback(async (barcode) => {
    // Stop camera
    clearTimeout(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setStep(STEPS.LOOKUP);

    const data = await lookupBarcode(barcode);
    setLookupData(data);
    setForm(f => ({
      ...f,
      barcode,
      name:     data.name     || '',
      brand:    data.brand    || '',
      imageUrl: data.imageUrl || '',
    }));
    setStep(STEPS.FORM);
  }, []);

  const handleManualSubmit = () => {
    if (!manualBarcode.trim()) return;
    scanningRef.current = false;
    handleBarcode(manualBarcode.trim());
  };

  const handleFormSubmit = () => {
    if (!form.name) return;
    addProduct(form);
    setStep(STEPS.SUCCESS);
    setTimeout(() => onNavigate('home'), 1500);
  };

  const resetScanner = () => {
    setStep(STEPS.SCAN);
    scanningRef.current = true;
    setManualBarcode('');
    setForm({ name: '', brand: '', barcode: '', manufactureDate: '', expiryDate: '', notifyDate: '', quantity: 1, imageUrl: '', notes: '' });
    setLookupData(null);
    setTorchOn(false);
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

  // SCAN step
  return (
    <div className="flex flex-col min-h-screen bg-black">
      {/* Header */}
      <div className="flex items-center gap-4 px-5 pt-14 pb-4 z-10 relative">
        <button onClick={onBack} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <ArrowLeft size={20} className="text-white" />
        </button>
        <div className="flex-1">
          <h2 className="text-white font-bold text-lg">Quét mã barcode</h2>
          <p className="text-white/40 text-sm">Hướng camera vào mã vạch sản phẩm</p>
        </div>
        {/* Torch button */}
        <button
          onClick={toggleTorch}
          className="w-10 h-10 rounded-full flex items-center justify-center text-lg"
          style={{ background: torchOn ? 'rgba(255,184,0,0.2)' : 'rgba(255,255,255,0.08)', color: torchOn ? '#FFB800' : 'rgba(255,255,255,0.5)' }}
          title="Đèn flash"
        >
          🔦
        </button>
      </div>

      {manualMode ? (
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
          <button onClick={() => { setManualMode(false); }} className="text-white/40 text-sm underline">
            Quay lại quét camera
          </button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col">
          {cameraError ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 text-center">
              <AlertCircle size={40} className="text-red-400" />
              <p className="text-white/70 font-semibold">{cameraError}</p>
              <button onClick={() => setManualMode(true)} className="px-6 py-3 rounded-2xl font-semibold" style={{ background: 'rgba(255,255,255,0.08)', color: 'white' }}>
                Nhập thủ công
              </button>
            </div>
          ) : (
            <div className="relative flex-1">
              {/* Video feed */}
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                style={{ minHeight: '60vh' }}
                autoPlay muted playsInline
              />
              {/* Hidden canvas for ZBar frame capture */}
              <canvas ref={canvasRef} className="hidden" />

              {/* Scan overlay */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                {/* Dark vignette outside the scan box */}
                <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.45)' }} />
                <div
                  className="relative z-10 w-72 h-44 rounded-2xl"
                  style={{
                    border: '2px solid rgba(0,230,118,0.9)',
                    boxShadow: '0 0 0 9999px rgba(0,0,0,0.45), 0 0 40px rgba(0,230,118,0.25)',
                    background: 'transparent',
                  }}
                >
                  {/* Corner accents */}
                  {[
                    'top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl-xl',
                    'top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr-xl',
                    'bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-xl',
                    'bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-xl',
                  ].map((cls, i) => (
                    <div key={i} className={`absolute w-7 h-7 border-[#00E676] ${cls}`} />
                  ))}
                  {/* Animated scan line */}
                  <div
                    className="absolute left-3 right-3 h-0.5 rounded-full"
                    style={{
                      background: 'linear-gradient(90deg, transparent, #00E676, transparent)',
                      animation: 'scanLine 1.8s ease-in-out infinite',
                    }}
                  />
                </div>
                <p className="relative z-10 text-white/70 text-sm mt-5 font-medium">Đặt mã vạch vào khung</p>
              </div>
            </div>
          )}

          <div className="p-5 flex gap-3">
            <button
              onClick={() => setManualMode(true)}
              className="flex-1 py-3.5 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2"
              style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.7)' }}
            >
              <Keyboard size={18} />
              Nhập mã thủ công
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes scanLine {
          0%   { top: 8%;  opacity: 0.5; }
          50%  { top: 82%; opacity: 1;   }
          100% { top: 8%;  opacity: 0.5; }
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
    <div className="flex flex-col min-h-screen" style={{ paddingBottom: 24 }}>
      <div className="flex items-center gap-4 px-5 pt-14 pb-5">
        <button onClick={onBack} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <ArrowLeft size={20} className="text-white" />
        </button>
        <div>
          <h2 className="text-white font-bold text-lg">{lookupData?.found ? 'Xác nhận sản phẩm' : 'Thêm sản phẩm'}</h2>
          {form.barcode && <p className="text-white/30 text-xs font-mono">{form.barcode}</p>}
        </div>
      </div>

      <div className="flex-1 px-5 flex flex-col gap-4 overflow-y-auto">
        {form.imageUrl && (
          <div className="w-full h-40 rounded-2xl overflow-hidden flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <img src={form.imageUrl} alt="product" className="h-full object-contain" onError={e => set('imageUrl', '')} />
          </div>
        )}
        {!lookupData?.found && !form.imageUrl && (
          <div className="w-full h-32 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(255,255,255,0.1)' }}>
            <div className="text-center">
              <Package size={28} className="text-white/20 mx-auto mb-1" />
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
        <Field label="Hạn sử dụng (HSD) *">
          <input type="date" value={form.expiryDate} onChange={e => set('expiryDate', e.target.value)} className={inputCls} style={{ colorScheme: 'dark' }} />
        </Field>
        {autoThresholdDays !== null && (
          <p className="text-white/40 text-xs px-1">Ngưỡng cảnh báo tự động: ~{autoThresholdDays} ngày</p>
        )}
        {!form.manufactureDate && (
          <Field label="Ngày thông báo (tùy chọn)">
            <input type="date" value={form.notifyDate || ''} onChange={e => set('notifyDate', e.target.value)} className={inputCls} style={{ colorScheme: 'dark' }} />
          </Field>
        )}
        <Field label="Số lượng">
          <div className="flex items-center gap-3 px-1">
            <button onClick={() => set('quantity', Math.max(1, form.quantity - 1))} className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold" style={{ background: 'rgba(255,255,255,0.06)' }}>−</button>
            <span className="text-white font-bold text-lg flex-1 text-center">{form.quantity}</span>
            <button onClick={() => set('quantity', form.quantity + 1)} className="w-10 h-10 rounded-xl flex items-center justify-center font-bold" style={{ background: 'rgba(0,230,118,0.12)', color: '#00E676' }}>+</button>
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
