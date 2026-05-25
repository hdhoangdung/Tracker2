import { useState } from 'react';
import { ArrowLeft, Edit3, Trash2, Save, Package, Calendar, Hash, FileText, ShoppingBag, Factory, Info } from 'lucide-react';
import dayjs from 'dayjs';
import { useProducts } from '../context/ProductContext';
import { StatusBadge } from '../components/StatusBadge';
import { getExpiryStatus } from '../utils/statusUtils';

export function DetailPage({ productId, onBack }) {
  const { getProduct, updateProduct, removeProduct, settings } = useProducts();
  const product = getProduct(productId);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(product || {});
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!product) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: 'var(--bg-primary)' }}>
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 glass">
            <Package size={28} className="text-white/30" />
          </div>
          <p className="text-white/50 mb-4">Không tìm thấy sản phẩm</p>
          <button onClick={onBack} className="text-[var(--accent)] text-sm font-semibold underline underline-offset-4">Quay lại</button>
        </div>
      </div>
    );
  }

  const { status, label, daysLeft } = getExpiryStatus(product.expiryDate, settings.warningDays, product.manufactureDate);

  const handleSave = () => {
    updateProduct(productId, form);
    setEditing(false);
    setConfirmDelete(false);
  };

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 4000);
      return;
    }
    removeProduct(productId);
    onBack();
  };

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  return (
    <div className="flex flex-col min-h-screen" style={{ background: 'var(--bg-primary)', paddingBottom: 32 }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-safe" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)', paddingBottom: 12 }}>
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-xl flex items-center justify-center active:scale-90 transition-all glass"
        >
          <ArrowLeft size={20} className="text-white" />
        </button>
        <h2 className="text-white font-bold text-lg flex-1 truncate">Chi tiết sản phẩm</h2>
        <div className="flex gap-2">
          {editing ? (
            <button
              onClick={handleSave}
              className="w-10 h-10 rounded-xl flex items-center justify-center active:scale-90 transition-all"
              style={{ background: 'rgba(0,230,118,0.15)', color: '#00E676' }}
            >
              <Save size={18} />
            </button>
          ) : (
            <button
              onClick={() => { setForm(product); setEditing(true); }}
              className="w-10 h-10 rounded-xl flex items-center justify-center active:scale-90 transition-all glass"
              style={{ color: 'rgba(255,255,255,0.6)' }}
            >
              <Edit3 size={18} />
            </button>
          )}
          <button
            onClick={handleDelete}
            className="w-10 h-10 rounded-xl flex items-center justify-center active:scale-90 transition-all"
            style={{ background: confirmDelete ? 'rgba(255,68,68,0.2)' : 'rgba(255,68,68,0.1)', color: '#FF4444' }}
          >
            {confirmDelete ? <span className="text-xs font-bold">!</span> : <Trash2 size={18} />}
          </button>
        </div>
      </div>

      <div className="px-5 flex flex-col gap-5">
        {/* Hero image banner */}
        <div
          className="w-full h-56 rounded-3xl overflow-hidden flex items-center justify-center relative"
          style={{ background: 'rgba(255,255,255,0.03)' }}
        >
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              className="w-full h-full object-contain p-4"
              onError={e => { e.target.style.display = 'none'; }}
            />
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Package size={64} className="text-white/10" />
              <span className="text-white/10 text-xs">Không có ảnh</span>
            </div>
          )}
          <div className="absolute top-4 right-4">
            <StatusBadge status={status} label={label} />
          </div>
          {daysLeft > 0 && daysLeft < Infinity && (
            <div className="absolute bottom-4 left-4">
              <span className="px-3 py-1.5 rounded-xl text-xs font-semibold glass-strong" style={{ color: 'rgba(255,255,255,0.7)' }}>
                {daysLeft === 0 ? 'Hết hạn hôm nay' : `Còn ${daysLeft} ngày`}
              </span>
            </div>
          )}
        </div>

        {/* Name & brand */}
        {editing ? (
          <div className="flex flex-col gap-3">
            <EditField label="Tên sản phẩm">
              <input type="text" value={form.name} onChange={e => set('name', e.target.value)} className={inputCls} />
            </EditField>
            <EditField label="Thương hiệu">
              <input type="text" value={form.brand || ''} onChange={e => set('brand', e.target.value)} className={inputCls} />
            </EditField>
            <div className="grid grid-cols-2 gap-3">
              <EditField label="Ngày sản xuất">
                <input type="date" value={form.manufactureDate || ''} onChange={e => set('manufactureDate', e.target.value)} className={inputCls} style={{ colorScheme: 'dark' }} />
              </EditField>
              <EditField label="Hạn sử dụng">
                <input type="date" value={form.expiryDate || ''} onChange={e => set('expiryDate', e.target.value)} className={inputCls} style={{ colorScheme: 'dark' }} />
              </EditField>
            </div>
            {form.manufactureDate && form.expiryDate && (() => {
              const totalDays = dayjs(form.expiryDate).startOf('day').diff(dayjs(form.manufactureDate).startOf('day'), 'day');
              const threshold = Math.floor(totalDays / 3);
              return totalDays > 0 ? (
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl" style={{ background: 'rgba(0,230,118,0.06)', border: '1px solid rgba(0,230,118,0.12)' }}>
                  <Info size={14} className="text-[var(--accent)]" />
                  <span className="text-white/50 text-xs">Ngưỡng cảnh báo: ~{threshold} ngày</span>
                </div>
              ) : null;
            })()}
          </div>
        ) : (
          <div>
            <h1 className="text-white text-2xl font-bold">{product.name}</h1>
            {product.brand && <p className="text-white/40 mt-1.5 text-sm">{product.brand}</p>}
          </div>
        )}

        {/* Info cards */}
        <div className="glass rounded-2xl overflow-hidden">
          {/* Manufacture date */}
          {!editing && product.manufactureDate && (
            <>
              <InfoRow icon={<Factory size={16} />} label="Ngày sản xuất">
                <p className="text-white font-semibold text-sm">{dayjs(product.manufactureDate).format('DD/MM/YYYY')}</p>
              </InfoRow>
              <Divider />
            </>
          )}

          <InfoRow icon={<Calendar size={16} />} label="Hạn sử dụng">
            <div className="text-right">
              <p className="text-white font-semibold text-sm">
                {product.expiryDate ? dayjs(product.expiryDate).format('DD/MM/YYYY') : '—'}
              </p>
              {daysLeft !== Infinity && (
                <p className="text-white/35 text-xs mt-0.5">
                  {daysLeft < 0
                    ? `Đã hết hạn ${Math.abs(daysLeft)} ngày`
                    : daysLeft === 0
                    ? 'Hết hạn hôm nay'
                    : `Còn ${daysLeft} ngày`}
                </p>
              )}
            </div>
          </InfoRow>

          {!editing && product.manufactureDate && product.expiryDate && (() => {
            const totalDays = dayjs(product.expiryDate).startOf('day').diff(dayjs(product.manufactureDate).startOf('day'), 'day');
            const threshold = Math.floor(totalDays / 3);
            return (
              <>
                <Divider />
                <InfoRow icon={<Info size={16} />} label="Ngưỡng cảnh báo">
                  <p className="text-white/50 text-sm">~{threshold} ngày</p>
                </InfoRow>
              </>
            );
          })()}

          <Divider />

          <InfoRow icon={<ShoppingBag size={16} />} label="Số lượng">
            {editing ? (
              <div className="flex items-center gap-2">
                <button onClick={() => set('quantity', Math.max(1, (form.quantity || 1) - 1))} className="w-7 h-7 rounded-lg text-white font-bold flex items-center justify-center glass">−</button>
                <span className="text-white font-bold text-base w-8 text-center">{form.quantity || 1}</span>
                <button onClick={() => set('quantity', (form.quantity || 1) + 1)} className="w-7 h-7 rounded-lg font-bold flex items-center justify-center" style={{ background: 'rgba(0,230,118,0.12)', color: '#00E676' }}>+</button>
              </div>
            ) : (
              <p className="text-white font-semibold text-sm">{product.quantity || 1} sản phẩm</p>
            )}
          </InfoRow>

          {product.barcode && (
            <>
              <Divider />
              <InfoRow icon={<Hash size={16} />} label="Mã barcode">
                <p className="text-white/40 text-sm font-mono tracking-wider">{product.barcode}</p>
              </InfoRow>
            </>
          )}

          <Divider />

          <InfoRow icon={<Calendar size={16} />} label="Ngày thêm">
            <p className="text-white/35 text-sm">{dayjs(product.createdAt).format('DD/MM/YYYY HH:mm')}</p>
          </InfoRow>
        </div>

        {/* Notes */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 px-1">
            <FileText size={14} className="text-white/25" />
            <p className="text-white/25 text-xs font-semibold uppercase tracking-wider">Ghi chú</p>
          </div>
          {editing ? (
            <textarea
              value={form.notes || ''}
              onChange={e => set('notes', e.target.value)}
              placeholder="Thêm ghi chú..."
              rows={4}
              className="w-full px-4 py-3 rounded-2xl text-white text-sm outline-none resize-none"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
            />
          ) : (
            <div className="px-4 py-3 rounded-2xl glass">
              <p className="text-white/45 text-sm leading-relaxed">
                {product.notes || 'Không có ghi chú'}
              </p>
            </div>
          )}
        </div>

        {/* Delete confirm */}
        {confirmDelete && (
          <div className="px-4 py-3 rounded-2xl text-center" style={{ background: 'rgba(255,68,68,0.08)', border: '1px solid rgba(255,68,68,0.15)' }}>
            <p className="text-red-400 text-sm font-medium">
              Nhấn lại nút xóa để xác nhận
            </p>
            <p className="text-white/30 text-xs mt-1">Hành động này không thể hoàn tác</p>
          </div>
        )}
      </div>
    </div>
  );
}

const inputCls = 'w-full px-4 py-2.5 rounded-xl text-white text-sm outline-none bg-transparent';
const inputStyle = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.06)' };

function EditField({ label, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-white/40 text-xs font-semibold tracking-wide uppercase px-1">{label}</label>
      <div style={inputStyle} className="rounded-xl overflow-hidden">{children}</div>
    </div>
  );
}

function InfoRow({ icon, label, children }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4">
      <div className="flex items-center gap-2.5 text-white/35 flex-shrink-0">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function Divider() {
  return <div className="mx-5 h-px" style={{ background: 'rgba(255,255,255,0.04)' }} />;
}
