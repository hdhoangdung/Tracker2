import { useEffect, useRef, useState, useCallback } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import {
  ArrowLeft, Flashlight, Keyboard, Loader2, CheckCircle, XCircle, Package, AlertCircle
} from 'lucide-react';
import { lookupBarcode } from '../services/barcodeApiService';
import { useProducts } from '../context/ProductContext';

const STEPS = { SCAN: 'scan', LOOKUP: 'lookup', FORM: 'form', SUCCESS: 'success' };

export function ScannerPage({ onBack, onNavigate }) {
  const { addProduct } = useProducts();
  const videoRef = useRef(null);
  const readerRef = useRef(null);
  const [step, setStep] = useState(STEPS.SCAN);
  const [manualMode, setManualMode] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const [lookupData, setLookupData] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [scanning, setScanning] = useState(true);
  const [form, setForm] = useState({
    name: '', brand: '', barcode: '', manufactureDate: '', expiryDate: '', notifyDate: '', quantity: 1, imageUrl: '', notes: ''
  });

  // Start camera
  useEffect(() => {
    if (manualMode || step !== STEPS.SCAN) return;
    let cancelled = false;
    let activeStream = null;

    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;

    const startDecoding = async (stream) => {
      if (cancelled) return;
      activeStream = stream;
      videoRef.current.srcObject = stream;
      reader.decodeFromStream(stream, videoRef.current, (result, err) => {
        if (cancelled) return;
        if (result) {
          handleBarcode(result.getText());
        }
      });
    };

    BrowserMultiFormatReader.listVideoInputDevices()
      .then(async devices => {
        if (cancelled || devices.length === 0) {
          setCameraError('Không tìm thấy camera');
          return;
        }
        // Prefer back camera
        const back = devices.find(d =>
          /back|rear|environment/i.test(d.label)
        ) || devices[devices.length - 1];

        // Try with continuous autofocus first
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              deviceId: { exact: back.deviceId },
              advanced: [{ focusMode: 'continuous' }],
            },
            audio: false,
          });
          await startDecoding(stream);
        } catch (_focusErr) {
          // Device doesn't support focusMode: 'continuous' — fallback to normal init
          if (cancelled) return;
          try {
            const stream = await navigator.mediaDevices.getUserMedia({
              video: { deviceId: { exact: back.deviceId } },
              audio: false,
            });
            await startDecoding(stream);
          } catch (err) {
            if (!cancelled) setCameraError('Không có quyền truy cập camera: ' + err.message);
          }
        }
      })
      .catch(err => {
        if (!cancelled) setCameraError('Không có quyền truy cập camera: ' + err.message);
      });

    return () => {
      cancelled = true;
      // Stop all tracks of the active stream
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
        activeStream = null;
      }
      BrowserMultiFormatReader.releaseAllStreams();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualMode, step]);

  const handleBarcode = useCallback(async (barcode) => {
    if (!scanning) return;
    setScanning(false);
    BrowserMultiFormatReader.releaseAllStreams();
    setStep(STEPS.LOOKUP);

    const data = await lookupBarcode(barcode);
    setLookupData(data);
    setForm(f => ({
      ...f,
      barcode,
      name: data.name || '',
      brand: data.brand || '',
      imageUrl: data.imageUrl || '',
    }));
    setStep(STEPS.FORM);
  }, [scanning]);

  const handleManualSubmit = () => {
    if (!manualBarcode.trim()) return;
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
    setScanning(true);
    setManualBarcode('');
    setForm({ name: '', brand: '', barcode: '', manufactureDate: '', expiryDate: '', notifyDate: '', quantity: 1, imageUrl: '', notes: '' });
    setLookupData(null);
  };

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
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.08)' }}
        >
          <ArrowLeft size={20} className="text-white" />
        </button>
        <div>
          <h2 className="text-white font-bold text-lg">Quét mã barcode</h2>
          <p className="text-white/40 text-sm">Hướng camera vào mã vạch sản phẩm</p>
        </div>
      </div>

      {manualMode ? (
        /* Manual entry */
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
          <button
            onClick={() => { setManualMode(false); setScanning(true); }}
            className="text-white/40 text-sm underline"
          >
            Quay lại quét camera
          </button>
        </div>
      ) : (
        /* Camera view */
        <div className="flex-1 flex flex-col">
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
            <div className="relative flex-1">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                style={{ minHeight: '60vh' }}
                autoPlay
                muted
                playsInline
              />
              {/* Overlay */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div
                  className="w-64 h-40 rounded-2xl relative"
                  style={{ border: '2px solid rgba(0,230,118,0.8)', boxShadow: '0 0 40px rgba(0,230,118,0.2)' }}
                >
                  {/* Corners */}
                  {['tl','tr','bl','br'].map(c => (
                    <div key={c} className={`absolute w-6 h-6 border-[3px] border-[#00E676] rounded-sm
                      ${c.includes('t') ? '-top-[2px]' : '-bottom-[2px]'}
                      ${c.includes('l') ? '-left-[2px]' : '-right-[2px]'}
                      ${c === 'tl' ? 'rounded-tl-xl border-r-0 border-b-0' :
                        c === 'tr' ? 'rounded-tr-xl border-l-0 border-b-0' :
                        c === 'bl' ? 'rounded-bl-xl border-r-0 border-t-0' :
                        'rounded-br-xl border-l-0 border-t-0'}
                    `} />
                  ))}
                  {/* Scan line */}
                  <div
                    className="absolute left-2 right-2 h-0.5 rounded-full"
                    style={{
                      background: 'linear-gradient(90deg, transparent, #00E676, transparent)',
                      animation: 'scanLine 2s ease-in-out infinite',
                      top: '50%',
                    }}
                  />
                </div>
                <p className="text-white/60 text-sm mt-6">Đặt mã vạch vào khung</p>
              </div>
            </div>
          )}

          {/* Bottom controls */}
          <div className="p-6 flex flex-col gap-3">
            <button
              onClick={() => setManualMode(true)}
              className="w-full py-3.5 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2"
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
          0%, 100% { top: 10%; opacity: 0.6; }
          50% { top: 85%; opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function ProductForm({ form, setForm, onSubmit, onBack, lookupData }) {
  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));
  const isValid = form.name.trim() !== '';

  const autoThresholdDays = (() => {
    if (!form.manufactureDate || !form.expiryDate) return null;
    const mfg = new Date(form.manufactureDate);
    const exp = new Date(form.expiryDate);
    const totalDays = Math.round((exp - mfg) / (1000 * 60 * 60 * 24));
    if (totalDays <= 0) return null;
    return Math.floor(totalDays / 3);
  })();

  return (
    <div className="flex flex-col min-h-screen" style={{ paddingBottom: 24 }}>
      {/* Header */}
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
        {/* Image preview */}
        {form.imageUrl && (
          <div
            className="w-full h-40 rounded-2xl overflow-hidden flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.04)' }}
          >
            <img
              src={form.imageUrl}
              alt="product"
              className="h-full object-contain"
              onError={e => set('imageUrl', '')}
            />
          </div>
        )}

        {!lookupData?.found && !form.imageUrl && (
          <div
            className="w-full h-32 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(255,255,255,0.1)' }}
          >
            <div className="text-center">
              <Package size={28} className="text-white/20 mx-auto mb-1" />
              <p className="text-white/20 text-xs">Không tìm thấy hình ảnh</p>
            </div>
          </div>
        )}

        <Field label="Tên sản phẩm *" required>
          <input
            type="text"
            value={form.name}
            onChange={e => set('name', e.target.value)}
            placeholder="Nhập tên sản phẩm"
            className={inputCls}
          />
        </Field>

        <Field label="Thương hiệu">
          <input
            type="text"
            value={form.brand}
            onChange={e => set('brand', e.target.value)}
            placeholder="VD: Vinamilk, Nestle..."
            className={inputCls}
          />
        </Field>

        <Field label="Ngày sản xuất (NSX)">
          <input
            type="date"
            value={form.manufactureDate}
            onChange={e => set('manufactureDate', e.target.value)}
            className={inputCls}
            style={{ colorScheme: 'dark' }}
          />
        </Field>

        <Field label="Hạn sử dụng (HSD) *">
          <input
            type="date"
            value={form.expiryDate}
            onChange={e => set('expiryDate', e.target.value)}
            className={inputCls}
            style={{ colorScheme: 'dark' }}
          />
        </Field>

        {autoThresholdDays !== null && (
          <p className="text-white/40 text-xs px-1">
            Ngưỡng cảnh báo tự động: ~{autoThresholdDays} ngày
          </p>
        )}

        {!form.manufactureDate && (
          <Field label="Ngày thông báo (tùy chọn)">
            <input
              type="date"
              value={form.notifyDate || ''}
              onChange={e => set('notifyDate', e.target.value)}
              className={inputCls}
              style={{ colorScheme: 'dark' }}
            />
          </Field>
        )}

        <div className="flex gap-3">
          <Field label="Số lượng" className="flex-1">
            <div className="flex items-center gap-3">
              <button
                onClick={() => set('quantity', Math.max(1, form.quantity - 1))}
                className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold"
                style={{ background: 'rgba(255,255,255,0.06)' }}
              >−</button>
              <span className="text-white font-bold text-lg flex-1 text-center">{form.quantity}</span>
              <button
                onClick={() => set('quantity', form.quantity + 1)}
                className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold"
                style={{ background: 'rgba(0,230,118,0.12)', color: '#00E676' }}
              >+</button>
            </div>
          </Field>
        </div>

        <Field label="Ghi chú">
          <textarea
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            placeholder="Ghi chú thêm..."
            rows={3}
            className={inputCls + ' resize-none'}
          />
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

const inputCls = `w-full px-4 py-3 rounded-xl text-white text-sm outline-none bg-transparent`;
const inputStyle = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' };

function Field({ label, children, required, className = '' }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label className="text-white/50 text-xs font-semibold tracking-wide uppercase px-1">
        {label}{required && <span className="text-red-400 ml-1">*</span>}
      </label>
      <div style={inputStyle} className="rounded-xl overflow-hidden">
        {children}
      </div>
    </div>
  );
}
