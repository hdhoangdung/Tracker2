/**
 * ScannerPage – Ultra-fast barcode scanner
 *
 * Architecture (two-tier):
 *   1. BarcodeDetector API (native, < 100ms) — Chromium browsers
 *   2. @zxing/browser + @zxing/library fallback — all other browsers
 *
 * Camera: 640×480, focusMode: 'continuous', environment (rear) camera.
 * Formats: EAN-13, UPC-A, EAN-8, CODE-128, CODE-39 (linear barcodes only).
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { ArrowLeft, Keyboard, CheckCircle, Package, AlertCircle } from 'lucide-react';
import { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } from '@zxing/library';
import { lookupBarcode } from '../services/barcodeApiService';
import { useProducts } from '../context/ProductContext';

const STEPS = { SCAN: 'scan', LOOKUP: 'lookup', FORM: 'form', SUCCESS: 'success' };

// ─── Supported barcode formats (linear only — fastest) ────────────────
const SUPPORTED_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.UPC_A,
  BarcodeFormat.EAN_8,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
];

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

// Check if BarcodeDetector API supports our required formats
function supportsBarcodeDetector() {
  if (typeof BarcodeDetector === 'undefined') return false;
  // We'll check synchronously first; if formats aren't available, default to true
  // and let the runtime fallback handle it
  return true;
}

// Detect supported formats asynchronously and cache the result
let _bdSupported = null;
async function checkBarcodeDetectorFormats() {
  if (_bdSupported !== null) return _bdSupported;
  try {
    const formats = await BarcodeDetector.getSupportedFormats();
    _bdSupported = formats.some(f =>
      ['ean_13', 'upc_a', 'ean_8', 'code_128', 'code_39'].includes(f)
    );
  } catch {
    _bdSupported = false;
  }
  return _bdSupported;
}

// ─── Main component ────────────────────────────────────────────────────
export function ScannerPage({ onBack, onNavigate }) {
  const { addProduct } = useProducts();

  const videoRef     = useRef(null);
  const streamRef    = useRef(null);
  const zxingRef     = useRef(null);
  const rafRef       = useRef(null);
  const activeRef    = useRef(false);
  const mountedRef   = useRef(true);

  const [step, setStep]             = useState(STEPS.SCAN);
  const [manualMode, setManualMode] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const [lookupData, setLookupData] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [scanFlash, setScanFlash]   = useState(false);
  const [usingNative, setUsingNative] = useState(false);
  const [torchOn, setTorchOn]       = useState(false);
  const [form, setForm] = useState({
    name: '', brand: '', barcode: '', manufactureDate: '', expiryDate: '',
    quantity: 1, imageUrl: '', notes: '',
  });

  // ── Barcode found → lookup → form ─────────────────────────────────
  const onBarcodeFound = useCallback(async (barcode) => {
    if (!activeRef.current) return;
    activeRef.current = false;

    setScanFlash(true);
    setTimeout(() => setScanFlash(false), 300);

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

  // ── Camera scan loop using BarcodeDetector API ────────────────────
  const scanWithBarcodeDetector = useCallback(async (stream) => {
    if (!mountedRef.current) return;
    try {
      const detector = new BarcodeDetector({ formats: ['ean_13', 'upc_a', 'ean_8', 'code_128', 'code_39'] });
      const video = videoRef.current;
      if (!video) return;

      video.srcObject = stream;
      await video.play();

      const scanLoop = async () => {
        if (!activeRef.current || !mountedRef.current) return;

        try {
          const barcodes = await detector.detect(video);
          if (barcodes.length > 0 && activeRef.current) {
            const decoded = barcodes[0].rawValue;
            if (decoded) {
              onBarcodeFound(decoded);
              return;
            }
          }
        } catch {
          // frame error — try next frame
        }

        rafRef.current = requestAnimationFrame(scanLoop);
      };

      scanLoop();
    } catch (err) {
      console.warn('[Scanner] BarcodeDetector failed, falling back to @zxing:', err?.message);
      scanWithZxing(stream);
    }
  }, [onBarcodeFound]);

  // ── Camera scan loop using @zxing (fallback) ──────────────────────
  const scanWithZxing = useCallback(async (stream) => {
    if (!mountedRef.current) return;
    try {
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, SUPPORTED_FORMATS);

      const reader = new BrowserMultiFormatReader(hints);
      zxingRef.current = reader;

      const video = videoRef.current;
      if (!video) return;

      video.srcObject = stream;
      await video.play();

      // decodeFromVideoElement handles continuous scanning internally
      reader.decodeFromVideoElement(video, (result, error) => {
        if (result && activeRef.current) {
          const decoded = result.getText();
          if (decoded) {
            onBarcodeFound(decoded);
          }
        }
      });
    } catch (err) {
      console.error('[Scanner] All decoding engines failed:', err);
      setCameraError('Không thể khởi tạo bộ quét mã. Vui lòng nhập thủ công.');
    }
  }, [onBarcodeFound]);

  // ── Start camera ──────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    if (!mountedRef.current) return;
    setCameraError(null);
    activeRef.current = true;

    try {
      // Try with focusMode: 'continuous' and 640x480 for speed
      const constraints = {
        video: {
          facingMode: 'environment',
          width: { ideal: 640 },
          height: { ideal: 480 },
          advanced: [{ focusMode: 'continuous' }],
        },
        audio: false,
      };

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch {
        // Fallback without focusMode constraint
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });
      }

      streamRef.current = stream;

      // Check for torch capability
      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities?.();
      if (capabilities?.torch) {
        setTorchOn(false);
      }

      // Choose decoding engine — check native BarcodeDetector first
      if ('BarcodeDetector' in window || supportsBarcodeDetector()) {
        const supported = await checkBarcodeDetectorFormats();
        if (supported) {
          setUsingNative(true);
          await scanWithBarcodeDetector(stream);
        } else {
          setUsingNative(false);
          await scanWithZxing(stream);
        }
      } else {
        setUsingNative(false);
        await scanWithZxing(stream);
      }
    } catch (err) {
      console.warn('[Scanner] Camera error:', err?.message || err);
      if (mountedRef.current) {
        setCameraError(err?.message?.includes('NotAllowedError')
          ? 'Không có quyền truy cập camera. Vui lòng cho phép trong cài đặt trình duyệt.'
          : 'Không thể mở camera. Vui lòng nhập mã thủ công.');
      }
    }
  }, [scanWithBarcodeDetector, scanWithZxing]);

  // ── Torch toggle ──────────────────────────────────────────────────
  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()?.[0];
    if (!track || !track.getCapabilities?.()?.torch) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn }] });
      setTorchOn(!torchOn);
    } catch {
      // torch not supported
    }
  };

  // ── Init scanner on mount ─────────────────────────────────────────
  useEffect(() => {
    if (manualMode || step !== STEPS.SCAN) return;

    mountedRef.current = true;
    startCamera();

    return () => {
      mountedRef.current = false;
      activeRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (zxingRef.current) {
        try { zxingRef.current.reset(); } catch {}
        zxingRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [manualMode, step, startCamera]);

  // ── Handlers ──────────────────────────────────────────────────────
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
    setManualMode(false);
    setManualBarcode('');
    setCameraError(null);
    setTorchOn(false);
    setForm({ name: '', brand: '', barcode: '', manufactureDate: '', expiryDate: '', quantity: 1, imageUrl: '', notes: '' });
    setLookupData(null);
    setScanFlash(false);
  };

  // ── Render: SUCCESS ───────────────────────────────────────────────
  if (step === STEPS.SUCCESS) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[var(--bg-primary)] gap-4">
        <div className="relative">
          <div className="w-24 h-24 rounded-full bg-[var(--accent)] flex items-center justify-center shadow-lg shadow-[var(--accent-glow)]"
               style={{ animation: 'successPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards' }}>
            <CheckCircle size={48} className="text-[var(--bg-primary)]" strokeWidth={2.5} />
          </div>
        </div>
        <p className="text-white font-bold text-xl mt-4">Đã thêm sản phẩm!</p>
        <p className="text-white/40 text-sm">Đang chuyển về trang chủ...</p>
      </div>
    );
  }

  // ── Render: LOOKUP ────────────────────────────────────────────────
  if (step === STEPS.LOOKUP) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[var(--bg-primary)] gap-5">
        <div className="w-12 h-12 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
        <div className="text-center">
          <p className="text-white/70 font-medium">Đang tra cứu sản phẩm</p>
          <p className="text-white/30 text-sm mt-1">Tìm kiếm thông tin từ cơ sở dữ liệu...</p>
        </div>
      </div>
    );
  }

  // ── Render: FORM ──────────────────────────────────────────────────
  if (step === STEPS.FORM) {
    return <ProductForm form={form} setForm={setForm} onSubmit={handleFormSubmit} onBack={resetScanner} lookupData={lookupData} />;
  }

  // ── Render: SCAN ──────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-screen bg-[var(--bg-primary)]" style={{ height: '100dvh' }}>
      {manualMode ? (
        /* ══ Manual entry ══ */
        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6">
          <div className="w-20 h-20 rounded-3xl flex items-center justify-center glass-strong">
            <Keyboard size={32} className="text-white/60" />
          </div>
          <div className="text-center">
            <p className="text-white font-semibold text-lg">Nhập mã barcode</p>
            <p className="text-white/40 text-sm mt-1">Nhập dãy số dưới mã vạch sản phẩm</p>
          </div>
          <input
            type="text"
            inputMode="numeric"
            placeholder="8934588011234"
            value={manualBarcode}
            onChange={e => setManualBarcode(e.target.value.replace(/\D/g, ''))}
            onKeyDown={e => e.key === 'Enter' && handleManualSubmit()}
            className="w-full max-w-xs px-5 py-4 rounded-2xl text-white text-center text-xl tracking-[0.3em] outline-none font-mono"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-medium)' }}
            autoFocus
          />
          <button
            onClick={handleManualSubmit}
            disabled={!manualBarcode.trim()}
            className="w-full max-w-xs py-4 rounded-2xl font-semibold text-base transition-all active:scale-[0.97] disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-[var(--accent-glow)]"
            style={{ background: 'var(--accent)', color: 'var(--bg-primary)' }}
          >
            Tra cứu
          </button>
          <button onClick={() => setManualMode(false)} className="text-white/30 text-sm underline underline-offset-4 hover:text-white/50 transition-colors">
            Quay lại quét camera
          </button>
        </div>
      ) : (
        /* ══ Camera view ══ */
        <div className="relative flex-1 overflow-hidden bg-black" style={{ minHeight: '65dvh' }}>
          {/* Hidden video element for scanning */}
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="absolute inset-0 w-full h-full object-cover z-0"
            style={{ transform: 'scaleX(-1)' }}
          />

          {/* Gradient overlays */}
          <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-black/80 via-black/30 to-transparent z-10 pointer-events-none" />
          <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/80 via-black/30 to-transparent z-10 pointer-events-none" />

          {/* Top bar */}
          <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-5 pt-safe" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}>
            <button
              onClick={onBack}
              className="w-10 h-10 rounded-xl flex items-center justify-center active:scale-90 transition-all glass-strong"
            >
              <ArrowLeft size={20} className="text-white" />
            </button>
            <div className="text-right">
              <p className="text-white font-semibold text-sm drop-shadow-lg">Quét mã vạch</p>
              <p className="text-white/50 text-xs drop-shadow-lg">Đưa mã vào khung</p>
            </div>
            <div className="w-10" />
          </div>

          {/* Engine badge */}
          <div className="absolute top-0 inset-x-0 z-20 flex justify-center pt-safe" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 56px)' }}>
            <span className="px-3 py-1 rounded-full text-[10px] font-medium tracking-wider"
                  style={{
                    background: 'rgba(0,0,0,0.5)',
                    backdropFilter: 'blur(8px)',
                    color: usingNative ? 'rgba(0,230,118,0.7)' : 'rgba(255,255,255,0.4)',
                    border: '1px solid ' + (usingNative ? 'rgba(0,230,118,0.2)' : 'rgba(255,255,255,0.08)'),
                  }}>
              {usingNative ? '● Native' : '◎ ZXing'}
            </span>
          </div>

          {/* Success flash overlay */}
          {scanFlash && (
            <div
              className="absolute inset-0 z-30 pointer-events-none"
              style={{
                background: 'radial-gradient(circle at center, rgba(0,230,118,0.4), transparent 70%)',
                animation: 'flashOut 0.35s ease-out forwards',
              }}
            />
          )}

          {/* Scan frame */}
          <div
            className="absolute pointer-events-none z-10"
            style={{
              left: '10%', right: '10%',
              top: '25%',  bottom: '25%',
            }}
          >
            {/* Outer border with glow */}
            <div
              className="absolute inset-0"
              style={{
                borderRadius: 24,
                border: '2px solid rgba(0,230,118,0.6)',
                boxShadow: '0 0 30px rgba(0,230,118,0.15), inset 0 0 30px rgba(0,230,118,0.05)',
                animation: 'borderPulse 2.4s ease-in-out infinite',
              }}
            />
            {/* Corner accents */}
            {[
              { top: -3, left: -3,  borderTop: '3px solid var(--accent)', borderLeft: '3px solid var(--accent)', borderRadius: '20px 0 0 0', width: 28, height: 28 },
              { top: -3, right: -3, borderTop: '3px solid var(--accent)', borderRight: '3px solid var(--accent)', borderRadius: '0 20px 0 0', width: 28, height: 28 },
              { bottom: -3, left: -3,  borderBottom: '3px solid var(--accent)', borderLeft: '3px solid var(--accent)', borderRadius: '0 0 0 20px', width: 28, height: 28 },
              { bottom: -3, right: -3, borderBottom: '3px solid var(--accent)', borderRight: '3px solid var(--accent)', borderRadius: '0 0 20px 0', width: 28, height: 28 },
            ].map((s, i) => (
              <div key={i} className="absolute" style={s} />
            ))}
            {/* Scan line */}
            <div
              className="absolute left-2 right-2 h-[2px]"
              style={{
                background: 'linear-gradient(90deg, transparent 5%, var(--accent) 50%, transparent 95%)',
                animation: 'scanLine 1.8s ease-in-out infinite',
                filter: 'blur(0.5px)',
                boxShadow: '0 0 8px var(--accent)',
              }}
            />
          </div>

          {/* Hint text */}
          <p className="absolute inset-x-0 z-10 text-white/70 text-xs font-medium text-center tracking-wide drop-shadow-lg pointer-events-none" style={{ bottom: '33%' }}>
            Tự động nhận diện — giữ máy ổn định
          </p>

          {/* Camera error overlay */}
          {cameraError && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/85 gap-5 px-6 backdrop-blur-sm">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(255,68,68,0.15)' }}>
                <AlertCircle size={32} className="text-red-400" />
              </div>
              <div className="text-center max-w-xs">
                <p className="text-white font-semibold mb-1">Lỗi camera</p>
                <p className="text-white/50 text-sm leading-relaxed">{cameraError}</p>
              </div>
              <button
                onClick={() => setManualMode(true)}
                className="px-8 py-3.5 rounded-2xl font-semibold text-sm transition-all active:scale-95 shadow-lg"
                style={{ background: 'var(--accent)', color: 'var(--bg-primary)' }}
              >
                Nhập mã thủ công
              </button>
            </div>
          )}

          {/* Bottom actions */}
          {!cameraError && (
            <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-3 pb-12">
              {/* Torch button */}
              {torchOn !== null && (
                <button
                  onClick={toggleTorch}
                  className="w-12 h-12 rounded-full flex items-center justify-center active:scale-90 transition-all glass-strong"
                  aria-label={torchOn ? 'Tắt đèn' : 'Bật đèn'}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={torchOn ? '#FFD700' : 'rgba(255,255,255,0.7)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 4h-4l-7 12h7l-2 8 9-14h-5l2-6Z"/>
                  </svg>
                </button>
              )}
              <button
                onClick={() => setManualMode(true)}
                className="flex items-center gap-2.5 px-6 py-3.5 rounded-2xl text-sm font-semibold active:scale-95 transition-all glass-strong"
                style={{ color: 'rgba(255,255,255,0.85)' }}
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
          0%   { top: 8%;  opacity: 0.1; }
          40%  { top: 46%; opacity: 1;   }
          60%  { top: 46%; opacity: 1;   }
          100% { top: 88%; opacity: 0.1; }
        }
        @keyframes borderPulse {
          0%, 100% { border-color: rgba(0,230,118,0.5); box-shadow: 0 0 20px rgba(0,230,118,0.1), inset 0 0 20px rgba(0,230,118,0.02); }
          50%      { border-color: rgba(0,230,118,0.85); box-shadow: 0 0 40px rgba(0,230,118,0.25), inset 0 0 30px rgba(0,230,118,0.08); }
        }
        @keyframes flashOut {
          0%   { opacity: 1; transform: scale(1);   }
          100% { opacity: 0; transform: scale(1.4); }
        }
        @keyframes successPop {
          0%   { transform: scale(0.5); opacity: 0; }
          60%  { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
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
    <div className="flex flex-col min-h-screen bg-[var(--bg-primary)]">
      {/* Header */}
      <div className="flex items-center gap-4 px-5 pt-safe" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)', paddingBottom: 12 }}>
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-xl flex items-center justify-center active:scale-90 transition-all glass"
        >
          <ArrowLeft size={20} className="text-white" />
        </button>
        <div>
          <h2 className="text-white font-bold text-lg">
            {lookupData?.found ? 'Xác nhận sản phẩm' : 'Thêm sản phẩm'}
          </h2>
          {form.barcode && (
            <p className="text-white/30 text-xs font-mono mt-0.5">{form.barcode}</p>
          )}
        </div>
      </div>

      <div className="flex-1 px-5 flex flex-col gap-4 overflow-y-auto pb-8">
        {/* Image preview */}
        {form.imageUrl ? (
          <div className="w-full h-44 rounded-2xl overflow-hidden flex items-center justify-center glass">
            <img src={form.imageUrl} alt="" className="h-full object-contain" onError={e => set('imageUrl', '')} />
          </div>
        ) : !lookupData?.found ? (
          <div className="w-full h-28 rounded-2xl flex items-center justify-center glass" style={{ border: '1px dashed rgba(255,255,255,0.08)' }}>
            <div className="text-center">
              <Package size={24} className="text-white/15 mx-auto mb-1" />
              <p className="text-white/15 text-xs">Không có ảnh sản phẩm</p>
            </div>
          </div>
        ) : null}

        <InputField label="Tên sản phẩm *" required>
          <input type="text" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Nhập tên sản phẩm" className="w-full px-4 py-3 rounded-xl text-white text-sm outline-none bg-transparent" />
        </InputField>
        <InputField label="Thương hiệu">
          <input type="text" value={form.brand} onChange={e => set('brand', e.target.value)} placeholder="Vinamilk, Nestlé..." className="w-full px-4 py-3 rounded-xl text-white text-sm outline-none bg-transparent" />
        </InputField>

        <div className="grid grid-cols-2 gap-3">
          <InputField label="NSX">
            <input type="date" value={form.manufactureDate} onChange={e => set('manufactureDate', e.target.value)} className="w-full px-4 py-3 rounded-xl text-white text-sm outline-none bg-transparent" style={{ colorScheme: 'dark' }} />
          </InputField>
          <InputField label="HSD">
            <input type="date" value={form.expiryDate} onChange={e => set('expiryDate', e.target.value)} className="w-full px-4 py-3 rounded-xl text-white text-sm outline-none bg-transparent" style={{ colorScheme: 'dark' }} />
          </InputField>
        </div>

        {autoThresholdDays !== null && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl" style={{ background: 'rgba(0,230,118,0.06)', border: '1px solid rgba(0,230,118,0.12)' }}>
            <span className="text-[var(--accent)] text-xs font-semibold">⏰</span>
            <span className="text-white/50 text-xs">Ngưỡng cảnh báo: ~{autoThresholdDays} ngày</span>
          </div>
        )}

        <InputField label="Số lượng">
          <div className="flex items-center gap-4 px-2 py-1">
            <button onClick={() => set('quantity', Math.max(1, form.quantity - 1))} className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold active:scale-90 transition-all glass">−</button>
            <span className="text-white font-bold text-lg flex-1 text-center">{form.quantity}</span>
            <button onClick={() => set('quantity', form.quantity + 1)} className="w-9 h-9 rounded-xl flex items-center justify-center font-bold active:scale-90 transition-all" style={{ background: 'rgba(0,230,118,0.12)', color: 'var(--accent)' }}>+</button>
          </div>
        </InputField>

        <InputField label="Ghi chú">
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Ghi chú thêm về sản phẩm..." rows={3} className="w-full px-4 py-3 rounded-xl text-white text-sm outline-none bg-transparent resize-none" />
        </InputField>

        <button
          onClick={onSubmit}
          disabled={!isValid}
          className="w-full py-4 rounded-2xl font-bold text-base transition-all active:scale-[0.97] disabled:opacity-30 disabled:cursor-not-allowed mt-3 shadow-lg"
          style={{
            background: isValid ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
            color: isValid ? 'var(--bg-primary)' : 'rgba(255,255,255,0.3)',
            boxShadow: isValid ? '0 4px 20px rgba(0,230,118,0.25)' : 'none',
          }}
        >
          {isValid ? 'Lưu sản phẩm' : 'Nhập tên sản phẩm'}
        </button>
      </div>
    </div>
  );
}

function InputField({ label, children, required }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-white/40 text-xs font-semibold tracking-wide uppercase px-1">
        {label}{required && <span className="text-red-400 ml-1.5">*</span>}
      </label>
      <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)' }}>
        {children}
      </div>
    </div>
  );
}
