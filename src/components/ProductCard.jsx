import dayjs from 'dayjs';
import { Trash2, ChevronRight, Package } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { getExpiryStatus } from '../utils/statusUtils';
import { useProducts } from '../context/ProductContext';

export function ProductCard({ product, onClick }) {
  const { removeProduct, settings } = useProducts();
  const { status, label } = getExpiryStatus(product.expiryDate, settings.warningDays, product.manufactureDate);

  const handleDelete = (e) => {
    e.stopPropagation();
    removeProduct(product.id);
  };

  return (
    <div
      onClick={onClick}
      className="group relative flex items-center gap-3 p-4 rounded-2xl cursor-pointer transition-all duration-200 active:scale-[0.98]"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      {/* Image / Icon */}
      <div
        className="w-14 h-14 rounded-xl flex-shrink-0 flex items-center justify-center overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.06)' }}
      >
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-full object-cover rounded-xl"
            onError={e => { e.target.style.display = 'none'; }}
          />
        ) : (
          <Package size={24} className="text-white/30" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-white font-semibold text-sm truncate">{product.name || 'Sản phẩm không tên'}</p>
        {product.brand && (
          <p className="text-white/40 text-xs mt-0.5 truncate">{product.brand}</p>
        )}
        <div className="flex items-center gap-2 mt-1.5">
          <StatusBadge status={status} label={label} />
          {product.quantity > 1 && (
            <span className="text-white/30 text-xs">×{product.quantity}</span>
          )}
        </div>
        <p className="text-white/25 text-xs mt-1">
          HSD: {product.expiryDate ? dayjs(product.expiryDate).format('DD/MM/YYYY') : '—'}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={handleDelete}
          className="w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: 'rgba(255,68,68,0.15)', color: '#FF4444' }}
        >
          <Trash2 size={14} />
        </button>
        <ChevronRight size={16} className="text-white/20" />
      </div>
    </div>
  );
}
