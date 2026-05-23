import { useState } from 'react';
import { ArrowLeft, Edit3, Trash2, Save, Package, Calendar, Hash, FileText, ShoppingBag, Factory } from 'lucide-react';
import dayjs from 'dayjs';
import { useProducts } from '../context/ProductContext';
import { StatusBadge } from '../components/StatusBadge';
import { getExpiryStatus } from '../utils/statusUtils';

export function DetailPage({ productId, onBack }) {
  const { getProduct, updateProduct, removeProduct, settings } = useProducts();
  const product = getProduct(productId);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(product || {});

  if (!product) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-white/50 mb-4">Không tìm thấy sản phẩm</p>
          <button onClick={onBack} className="text-[#00E676] text-sm underline">Quay lại</button>
        </div>
      </div>
    );
  }

  const { status, label, daysLeft } = getExpiryStatus(product.expiryDate, settings.warningDays, product.manufactureDate);

  const handleSave = () => {
    updateProduct(productId, form);
    setEditing(false);
  };

  const handleDelete = () => {
    if (window.confirm(`Xóa "${product.name}"?`)) {
      removeProduct(productId);
      onBack();
    }
  };

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  return (
    <div className="flex flex-col min-h-screen" style={{ paddingBottom: 32 }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-14 pb-4">
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.08)' }}
        >
          <ArrowLeft size={20} className="text-white" />
        </button>
        <h2 className="text-white font-bold text-lg flex-1 truncate">Chi tiết sản phẩm</h2>
        <div className="flex gap-2">
          {editing ? (
            <button
              onClick={handleSave}
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(0,230,118,0.15)', color: '#00E676' }}
            >
              <Save size={18} />
            </button>
          ) : (
            <button
              onClick={() => { setForm(product); setEditing(true); }}
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.6)' }}
            >
              <Edit3 size={18} />
            </button>
          )}
          <button
            onClick={handleDelete}
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(255,68,68,0.1)', color: '#FF4444' }}
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      <div className="px-5 flex flex-col gap-5">
        {/* Hero image / banner */}
        <div
          className="w-full h-52 rounded-3xl overflow-hidden flex items-center justify-center relative"
          style={{ background: 'rgba(255,255,255,0.04)' }}
        >
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              className="w-full h-full object-contain"
              onError={e => { e.target.style.display = 'none'; }}
            />
          ) : (
            <Package size={56} className="text-white/15" />
          )}
          {/* Status overlay */}
          <div className="absolute top-3 right-3">
            <StatusBadge status={status} label={label} />
          </div>
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
            <EditField label="Ngày sản xuất (NSX)">
              <input
                type="date"
                value={form.manufactureDate || ''}
                onChange={e => set('manufactureDate', e.target.value)}
                className={inputCls}
                style={{ colorScheme: 'dark' }}
              />
            </EditField>
            <EditField label="Hạn sử dụng (HSD)">
              <input
                type="date"
                value={form.expiryDate || ''}
                onChange={e => set('expiryDate', e.target.value)}
                className={inputCls}
                style={{ colorScheme: 'dark' }}
              />
            </EditField>
            {form.manufactureDate && form.expiryDate && (() => {
              const totalDays = dayjs(form.expiryDate).startOf('day').diff(dayjs(form.manufactureDate).startOf('day'), 'day');
              const threshold = Math.floor(totalDays / 3);
              return totalDays > 0 ? (
                <p className="text-white/40 text-xs px-1">
                  Ngưỡng cảnh báo tự động: ~{threshold} ngày
                </p>
              ) : null;
            })()}
          </div>
        ) : (
          <div>
            <h1 className="text-white text-2xl font-bold">{product.name}</h1>
            {product.brand && <p className="text-white/40 mt-1">{product.brand}</p>}
          </div>
        )}

        {/* Key stats */}
        <div
          className="p-5 rounded-2xl flex flex-col gap-4"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          {/* Manufacture date – view mode shows only when present */}
          {!editing && product.manufactureDate && (
            <>
              <InfoRow icon={<Factory size={16} />} label="Ngày sản xuất">
                <p className="text-white font-semibold text-sm">
                  {dayjs(product.manufactureDate).format('DD/MM/YYYY')}
                </p>
              </InfoRow>
              <div className="h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
            </>
          )}

          <InfoRow icon={<Calendar size={16} />} label="Hạn sử dụng">
            <div className="text-right">
              <p className="text-white font-semibold text-sm">
                {product.expiryDate ? dayjs(product.expiryDate).format('DD/MM/YYYY') : '—'}
              </p>
              {daysLeft !== Infinity && (
                <p className="text-white/40 text-xs mt-0.5">
                  {daysLeft < 0
                    ? `Đã hết hạn ${Math.abs(daysLeft)} ngày trước`
                    : daysLeft === 0
                    ? 'Hết hạn hôm nay'
                    : `Còn ${daysLeft} ngày`}
                </p>
              )}
            </div>
          </InfoRow>

          {/* Dynamic warning threshold – shown in view mode when both dates are present */}
          {!editing && product.manufactureDate && product.expiryDate && (() => {
            const totalDays = dayjs(product.expiryDate).startOf('day').diff(dayjs(product.manufactureDate).startOf('day'), 'day');
            const threshold = Math.floor(totalDays / 3);
            return (
              <>
                <div className="h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
                <InfoRow icon={<Calendar size={16} />} label="Ngưỡng cảnh báo">
                  <p className="text-white/60 text-sm">~{threshold} ngày</p>
                </InfoRow>
              </>
            );
          })()}

          <div className="h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />

          <InfoRow icon={<ShoppingBag size={16} />} label="Số lượng">
            {editing ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => set('quantity', Math.max(1, (form.quantity || 1) - 1))}
                  className="w-7 h-7 rounded-lg text-white font-bold flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.08)' }}
                >−</button>
                <span className="text-white font-bold text-base w-8 text-center">{form.quantity || 1}</span>
                <button
                  onClick={() => set('quantity', (form.quantity || 1) + 1)}
                  className="w-7 h-7 rounded-lg font-bold flex items-center justify-center"
                  style={{ background: 'rgba(0,230,118,0.12)', color: '#00E676' }}
                >+</button>
              </div>
            ) : (
              <p className="text-white font-semibold text-sm">{product.quantity || 1} sản phẩm</p>
            )}
          </InfoRow>

          {product.barcode && (
            <>
              <div className="h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
              <InfoRow icon={<Hash size={16} />} label="Mã barcode">
                <p className="text-white/60 text-sm font-mono">{product.barcode}</p>
              </InfoRow>
            </>
          )}

          <div className="h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />

          <InfoRow icon={<Calendar size={16} />} label="Ngày thêm">
            <p className="text-white/40 text-sm">
              {dayjs(product.createdAt).format('DD/MM/YYYY HH:mm')}
            </p>
          </InfoRow>
        </div>

        {/* Notes */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 px-1">
            <FileText size={15} className="text-white/30" />
            <p className="text-white/30 text-xs font-semibold uppercase tracking-wide">Ghi chú</p>
          </div>
          {editing ? (
            <textarea
              value={form.notes || ''}
              onChange={e => set('notes', e.target.value)}
              placeholder="Thêm ghi chú..."
              rows={4}
              className="px-4 py-3 rounded-2xl text-white text-sm outline-none resize-none"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            />
          ) : (
            <div
              className="px-4 py-3 rounded-2xl"
              style={{ background: 'rgba(255,255,255,0.04)' }}
            >
              <p className="text-white/50 text-sm leading-relaxed">
                {product.notes || 'Không có ghi chú'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const inputCls = `w-full px-4 py-2.5 rounded-xl text-white text-sm outline-none`;
const inputStyle = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' };

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
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-2 text-white/40 flex-shrink-0">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <div>{children}</div>
    </div>
  );
}
