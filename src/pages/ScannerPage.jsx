/**
 * ScannerPage – iPhone 11 Pro Max · html5-qrcode (ZXing) engine · Custom UI
 *
 * WHY html5-qrcode instead of ZBar WASM:
 * - @undecaf/zbar-wasm requires vite-plugin-wasm to serve .wasm files correctly
 * - Without the plugin, the WASM binary 404s in production builds → scanner silent-fails
 * - html5-qrcode is pure JS (no WASM), handles camera + decoding in one package
 * - ZXing engine (battle-tested, supports EAN-13, UPC, Code 128, QR, etc.)
 * - 151K weekly downloads, actively maintained
 *
 * Architecture:
 * - Html5Qrcode class (not Html5QrcodeScanner) → no built-in UI, we overlay our own
 * - Camera renders into #reader div, our custom scan box overlays on top
 * - fps: 10 → good balance of speed vs battery on iPhone
 * - qrbox: 400×250 → restricts scan region for accuracy
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { ArrowLeft, Keyboard, CheckCircle, Package, AlertCircle } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
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

// ─── Helpers ───────────────────────────────────────────────────────────
const once = (fn) => { let called = false; return (...args) => { if (called) return; called = true; return fn(...args); }; };

// ─── Main component ────────────────────────────────────────────────────
export function ScannerPage({ onBack, onNavigate }) {
  const { addProduct } = useProducts();

  const scannerRef    = useRef(null);
  const scanningRef   = useRef(false);

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

  // ── Barcode found → lookup → form ─────────────────────────────────
  const onBarcodeFound = useCallback(async (barcode) => {
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

  // ── Init html5-qrcode scanner ─────────────────────────────────────
  useEffect(() => {
    if (manualMode || step !== STEPS.SCAN) return;

    let cancelled = false;
    scanningRef.current = true;
    setCameraError(null);

    const scanner = new Html5Qrcode('reader');
    scannerRef.current = scanner;

    // Ensure onSuccess fires only once (prevent double-detect)
    const onSuccess = once((decodedText) => {
      if (cancelled || !scanningRef.current) return;
      scanningRef.current = false;

      // Flash feedback
      setScanFlash(true);
      setTimeout(() => setScanFlash(false), 300);

      // Stop scanner, then transition
      scanner.stop().catch(() => {});
      onBarcodeFound(decodedText);
    });

    // onError fires for every frame without a detection — ignore silently
    const onError = () => {};

    scanner.start(
      // Camera: back camera, medium resolution for speed
      { facingMode: 'environment' },
      {
        fps: 10,                        // 10 frames/sec — plenty for barcodes
        qrbox: { width: 400, height: 250 },  // scan region inside frame
      },
      onSuccess,
      onError,
    ).catch((err) => {
      if (!cancelled) {
        console.warn('[Scanner] Camera failed:', err?.message || err);
        setCameraError(err?.message || 'Không thể mở camera');
      }
    });

    return () => {
      cancelled = true;
      scanningRef.current = false;
      scannerRef.current?.stop().catch(() => {});
      scannerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualMode, step]);

  // ── Handlers ──────────────────────────────────────────────────────
  const handleManualSubmit = () => {
    if (!manualBarcode.trim()) return;
    scanningRef.current = false;
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
    scanningRef.current = true;
    setManualMode(false);
    setManualBarcode('');
    setCameraError(null);
    setForm({ name: '', brand: '', barcode: '', manufactureDate: '', expiryDate: '', notifyDate: '', quantity: 1, imageUrl: '', notes: '' });
    setLookupData(null);
    setScanFlash(false);
  };

  // ── Render: SUCCESS ───────────────────────────────────────────────
  if (step === STEPS.SUCCESS) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black gap-4">
        <div className="relative">
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

  // ── Render: SCAN ──────────────────────────────────────────────────
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
        /* ══ Camera view (html5-qrcode engine + custom overlay) ══ */
        <div className="relative flex-1 overflow-hidden bg-black" style={{ minHeight: '60dvh' }}>
          {/* html5-qrcode renders its <video> inside here */}
          <div id="reader" className="absolute inset-0 w-full h-full z-0" />

          {/* Gradient overlays for readability */}
          <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-black/70 via-black/30 to-transparent z-10 pointer-events-none" />
          <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/70 via-black/30 to-transparent z-10 pointer-events-none" />

          {/* Top bar */}
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

          {/* Scan box overlay */}
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
            {/* Animated border */}
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
          <p className="absolute inset-x-0 z-10 text-white/80 text-xs font-medium text-center tracking-wide drop-shadow-lg pointer-events-none" style={{ bottom: '32%' }}>
            Tự động nhận diện — giữ máy ổn định
          </p>

          {/* Camera error + manual fallback */}
          {cameraError && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/80 gap-4 px-6">
              <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,68,68,0.15)' }}>
                <AlertCircle size={28} className="text-red-400" />
              </div>
              <p className="text-white text-sm text-center">{cameraError}</p>
              <button
                onClick={() => setManualMode(true)}
                className="px-6 py-3 rounded-2xl font-semibold text-sm transition-all active:scale-95"
                style={{ background: '#00E676', color: '#0F0F0F' }}
              >
                Nhập mã thủ công
              </button>
            </div>
          )}

          {/* Bottom action */}
          {!cameraError && (
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
          )}
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
        /* Force html5-qrcode video to fill container */
        #reader video {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
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
    <div className="flex flex-col min-h-screen bg-black">
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
