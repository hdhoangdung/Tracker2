import { memo, useCallback } from 'react';
import dayjs from 'dayjs';
import { Trash2, ChevronRight, Package } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { useProducts } from '../context/ProductContext';

export const ProductCard = memo(function ProductCard({ product, onClick }) {
  const { removeProduct } = useProducts();
  const { _status } = product;

  const handleDelete = useCallback((e) => {
    e.stopPropagation();
    removeProduct(product.id);
  }, [product.id, removeProduct]);

  return (
    <div
      onClick={onClick}
      className="group relative flex items-center gap-3 p-3.5 rounded-2xl cursor-pointer"
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.07)',
        willChange: 'transform',
        transform: 'translateZ(0)',
        transition: 'transform 0.1s ease',
      }}
    >
      {/* Thumbnail */}
      <div
        className="w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.06)' }}
      >
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover"
            onError={e => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <Package size={20} className="text-white/20" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-white font-semibold text-sm truncate leading-tight">
          {product.name || 'Sản phẩm không tên'}
        </p>
        {product.brand && (
          <p className="text-white/35 text-xs truncate mt-0.5">{product.brand}</p>
        )}
        <div className="flex items-center gap-2 mt-1.5">
          <StatusBadge status={_status.status} label={_status.label} />
          {product.quantity > 1 && (
            <span className="text-white/25 text-xs">×{product.quantity}</span>
          )}
        </div>
        <p className="text-white/20 text-[10px] mt-1">
          {product.expiryDate ? dayjs(product.expiryDate).format('DD/MM/YYYY') : '—'}
        </p>
      </div>

      {/* Delete (hover/touch) */}
      <button
        onClick={handleDelete}
        className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: 'rgba(255,68,68,0.12)', color: '#FF4444' }}
        aria-label="Xóa"
      >
        <Trash2 size={13} />
      </button>
      <ChevronRight size={14} className="text-white/15 flex-shrink-0" />
    </div>
  );
});
