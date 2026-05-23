import { useEffect, useRef, useState, useCallback } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { ArrowLeft, Keyboard, Loader2, CheckCircle, AlertCircle, X } from 'lucide-react';
import { lookupBarcode, guessCountry } from '../services/barcodeApiService';
import { useProducts } from '../context/ProductContext';

const STEPS = { SCAN: 'scan', LOOKUP: 'lookup', FORM: 'form', SUCCESS: 'success' };

const HINTS = new Map([
  [DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13, BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,  BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128, BarcodeFormat.CODE_39,
    BarcodeFormat.ITF,    BarcodeFormat.CODABAR,
  ]],
  [DecodeHintType.TRY_HARDER, false],
]);

export function ScannerPage({ onBack, onNavigate }) {
  const { addProduct } = useProducts();
  const videoRef = useRef(null);
  const lastCodeRef = useRef('');
  const debounceRef = useRef(null);
  const activeRef = useRef(true);

  const [step, setStep] = useState(STEPS.SCAN);
  const [manualMode, setManualMode] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const [lookupData, setLookupData] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [countryHint, setCountryHint] = useState(null);
  const [form, setForm] = useState({
    name: '', brand: '', barcode: '', expiryDate: '', quantity: 1, imageUrl: '', notes: '',
  });

  const stopCamera = useCallback(() => {
    try { BrowserMultiFormatReader.releaseAllStreams(); } catch {}
  }, []);

  useEffect(() => {
    if (manualMode || step !== STEPS.SCAN) return;
    activeRef.current = true;
    const reader = new BrowserMultiFormatReader(HINTS);

    (async () => {
      try {
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        if (!activeRef.current) return;
        if (!devices.length) { setCameraError('Không tìm thấy camera'); return; }
        const back = devices.find(d => /back|rear|environment/i.test(d.label)) || devices[devices.length - 1];
        await reader.decodeFromVideoDevice(back.deviceId, videoRef.current, (result) => {
          if (!activeRef.current || !result) return;
          const text = result.getText();
          if (text === lastCodeRef.current) return;
          clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => {
            lastCodeRef.current = text;
            handleBarcode(text);
          }, 80);
        });
      } catch (err) {
        if (activeRef.current) setCameraError('Không có quyền camera: ' + (err.message || ''));
      }
    })();

    return () => {
      activeRef.current = false;
      clearTimeout(debounceRef.current);
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualMode, step]);

  const handleBarcode = useCallback(async (barcode) => {
    stopCamera();
    setCountryHint(guessCountry(barcode));
    setStep(STEPS.LOOKUP);
    const data = await lookupBarcode(barcode);
    setLookupData(data);
    setForm(f => ({ ...f, barcode, name: data.name||'', brand: data.brand||'', imageUrl: data.imageUrl||'' }));
    setStep(STEPS.FORM);
  }, [stopCamera]);

  const handleManualSubmit = useCallback(() => {
    const code = manualBarcode.trim();
    if (code.length < 4) return;
    handleBarcode(code);
  }, [manualBarcode, handleBarcode]);

  const handleFormSubmit = useCallback(() => {
    if (!form.name.trim()) return;
    addProduct({ ...form, quantity: Number(form.quantity) || 1 });
    setStep(STEPS.SUCCESS);
    setTimeout(() => onNavigate('home'), 1100);
  }, [form, addProduct, onNavigate]);

  const reset = useCallback(() => {
    lastCodeRef.current = '';
    setStep(STEPS.SCAN);
    setManualBarcode('');
    setLookupData(null);
    setCountryHint(null);
    setForm({ name: '', brand: '', barcode: '', expiryDate: '', quantity: 1, imageUrl: '', notes: '' });
  }, []);

  if (step === STEPS.SUCCESS) return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,230,118,0.14)' }}>
        <CheckCircle size={40} color="#00E676" />
      </div>
      <p className="text-white font-bold text-xl">Đã lưu sản phẩm!</p>
    </div>
  );

  if (step === STEPS.LOOKUP) return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <Loader2 size={36} className="text-white/40 animate-spin" />
      <p className="text-white/50 text-sm">Đang tra cứu...</p>
      {countryHint && <p className="text-white/30 text-xs">{countryHint}</p>}
    </div>
  );

  if (step === STEPS.FORM) return (
    <ProductForm form={form} setForm={setForm} onSubmit={handleFormSubmit} onBack={reset} lookupData={lookupData} />
  );

  return (
    <div className="flex flex-col bg-black min-h-screen">
      <div className="flex items-center gap-3 px-4 pt-12 pb-3">
        <button onClick={onBack} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.1)' }}>
          <ArrowLeft size={18} className="text-white" />
        </button>
        <div>
          <p className="text-white font-bold text-sm">Quét mã vạch</p>
          <p className="text-white/35 text-xs">EAN / UPC — không quét QR</p>
        </div>
      </div>

      {manualMode ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4">
          <Keyboard size={28} className="text-white/30" />
          <p className="text-white/55 font-semibold text-sm">Nhập mã vạch thủ công</p>
          <input type="tel" inputMode="numeric" placeholder="8934588XXXXXXX"
            value={manualBarcode} onChange={e => setManualBarcode(e.target.value.replace(/\D/g,''))}
            onKeyDown={e => e.key==='Enter' && handleManualSubmit()}
            className="w-full px-4 py-3.5 rounded-2xl text-white text-center text-xl font-mono tracking-widest outline-none"
            style={{ background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.12)', caretColor:'#00E676' }}
            autoFocus maxLength={14} />
          {manualBarcode.length >= 3 && <p className="text-white/30 text-xs -mt-2">{guessCountry(manualBarcode)||''}</p>}
          <button onClick={handleManualSubmit} disabled={manualBarcode.length < 4}
            className="w-full py-3.5 rounded-2xl font-bold disabled:opacity-40 active:scale-95"
            style={{ background:'#00E676', color:'#0F0F0F' }}>Tra cứu</button>
          <button onClick={() => setManualMode(false)} className="text-white/30 text-xs underline">Quay lại camera</button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col">
          {cameraError ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
              <AlertCircle size={36} className="text-red-400/70" />
              <p className="text-white/50 text-sm">{cameraError}</p>
              <button onClick={() => setManualMode(true)} className="px-5 py-3 rounded-2xl font-semibold text-sm"
                style={{ background:'rgba(255,255,255,0.07)', color:'rgba(255,255,255,0.7)' }}>Nhập thủ công</button>
            </div>
          ) : (
            <div className="relative flex-1">
              <video ref={videoRef} className="w-full h-full object-cover" style={{ minHeight:'58vh' }} autoPlay muted playsInline />
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <div className="absolute inset-0" style={{ background:'linear-gradient(to right,rgba(0,0,0,0.45) 0%,transparent 28%,transparent 72%,rgba(0,0,0,0.45) 100%)' }} />
                <div className="relative w-72 h-28 z-10">
                  {['top-0 left-0 border-t-2 border-l-2 rounded-tl-xl','top-0 right-0 border-t-2 border-r-2 rounded-tr-xl','bottom-0 left-0 border-b-2 border-l-2 rounded-bl-xl','bottom-0 right-0 border-b-2 border-r-2 rounded-br-xl'].map((cls,i) => (
                    <div key={i} className={`absolute w-6 h-6 border-[#00E676] ${cls}`} />
                  ))}
                  <div className="absolute inset-x-3 h-px rounded-full"
                    style={{ background:'linear-gradient(90deg,transparent,#00E676,transparent)', animation:'scanLine 1.8s ease-in-out infinite' }} />
                </div>
                <p className="text-white/45 text-xs mt-4 z-10">Đặt mã vạch nằm ngang vào khung</p>
              </div>
            </div>
          )}
          <div className="p-5">
            <button onClick={() => setManualMode(true)} className="w-full py-3.5 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2"
              style={{ background:'rgba(255,255,255,0.07)', color:'rgba(255,255,255,0.6)' }}>
              <Keyboard size={16} /> Nhập thủ công
            </button>
          </div>
        </div>
      )}
      <style>{`@keyframes scanLine{0%,100%{top:8%;opacity:.5}50%{top:88%;opacity:1}}`}</style>
    </div>
  );
}

function ProductForm({ form, setForm, onSubmit, onBack, lookupData }) {
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const valid = form.name.trim().length > 0;
  return (
    <div className="flex flex-col min-h-screen" style={{ paddingBottom: 24 }}>
      <div className="flex items-center gap-3 px-5 pt-12 pb-5">
        <button onClick={onBack} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background:'rgba(255,255,255,0.08)' }}>
          <ArrowLeft size={18} className="text-white" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-white font-bold text-base">{lookupData?.found ? `✓ ${lookupData.source}` : 'Thêm thủ công'}</h2>
          {form.barcode && <p className="text-white/25 text-xs font-mono truncate">{form.barcode}</p>}
        </div>
      </div>
      <div className="flex-1 px-5 flex flex-col gap-3.5 overflow-y-auto">
        {form.imageUrl && (
          <div className="relative w-full h-36 rounded-2xl overflow-hidden" style={{ background:'rgba(255,255,255,0.04)' }}>
            <img src={form.imageUrl} alt="" className="w-full h-full object-contain" onError={() => set('imageUrl','')} />
            <button onClick={() => set('imageUrl','')} className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center" style={{ background:'rgba(0,0,0,0.5)' }}>
              <X size={12} className="text-white" />
            </button>
          </div>
        )}
        <FField label="Tên sản phẩm" required>
          <input type="text" value={form.name} onChange={e => set('name',e.target.value)} placeholder="Tên sản phẩm" className={iCls} autoFocus={!lookupData?.found} />
        </FField>
        <FField label="Thương hiệu">
          <input type="text" value={form.brand||''} onChange={e => set('brand',e.target.value)} placeholder="Vinamilk, Nestle, ..." className={iCls} />
        </FField>
        <FField label="Hạn sử dụng (HSD)">
          <input type="date" value={form.expiryDate} onChange={e => set('expiryDate',e.target.value)} className={iCls} style={{ colorScheme:'dark' }} />
        </FField>
        <FField label="Số lượng">
          <div className="flex items-center gap-3 px-3 py-1">
            <button onClick={() => set('quantity',Math.max(1,(form.quantity||1)-1))} className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold" style={{ background:'rgba(255,255,255,0.06)' }}>−</button>
            <span className="text-white font-bold text-lg flex-1 text-center">{form.quantity||1}</span>
            <button onClick={() => set('quantity',(form.quantity||1)+1)} className="w-9 h-9 rounded-xl flex items-center justify-center font-bold" style={{ background:'rgba(0,230,118,0.12)', color:'#00E676' }}>+</button>
          </div>
        </FField>
        <FField label="Ghi chú">
          <textarea value={form.notes||''} onChange={e => set('notes',e.target.value)} placeholder="Ghi chú thêm..." rows={3} className={iCls+' resize-none'} />
        </FField>
        <button onClick={onSubmit} disabled={!valid}
          className="w-full py-4 rounded-2xl font-bold text-base disabled:opacity-35 active:scale-[0.98]"
          style={{ background:valid?'#00E676':'rgba(255,255,255,0.08)', color:valid?'#0F0F0F':'rgba(255,255,255,0.3)', transition:'all 0.14s' }}>
          Lưu sản phẩm
        </button>
      </div>
    </div>
  );
}

const iCls = 'w-full px-4 py-3 text-white text-sm outline-none bg-transparent';

function FField({ label, required, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-white/40 text-[11px] font-bold tracking-widest uppercase px-1">
        {label}{required && <span className="text-red-400 ml-1">*</span>}
      </label>
      <div className="rounded-xl overflow-hidden" style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)' }}>
        {children}
      </div>
    </div>
  );
}
