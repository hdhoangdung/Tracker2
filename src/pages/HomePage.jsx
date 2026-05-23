import { useState, useMemo } from 'react';
import { Search, Plus, AlertTriangle, CheckCircle, Clock, Filter } from 'lucide-react';
import { useProducts } from '../context/ProductContext';
import { ProductCard } from '../components/ProductCard';
import { getExpiryStatus } from '../utils/statusUtils';

const FILTERS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'expired', label: 'Hết hạn' },
  { id: 'warning', label: 'Sắp hết' },
  { id: 'ok', label: 'Còn hạn' },
];

export function HomePage({ onNavigate, onSelectProduct }) {
  const { products, settings } = useProducts();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  const stats = useMemo(() => {
    let expired = 0, warning = 0, ok = 0;
    products.forEach(p => {
      const { status } = getExpiryStatus(p.expiryDate, settings.warningDays, p.manufactureDate);
      if (status === 'expired') expired++;
      else if (status === 'warning') warning++;
      else ok++;
    });
    return { expired, warning, ok, total: products.length };
  }, [products, settings.warningDays]);

  const filtered = useMemo(() => {
    return products.filter(p => {
      const matchSearch = !search ||
        p.name?.toLowerCase().includes(search.toLowerCase()) ||
        p.brand?.toLowerCase().includes(search.toLowerCase()) ||
        p.barcode?.includes(search);
      if (!matchSearch) return false;
      if (filter === 'all') return true;
      const { status } = getExpiryStatus(p.expiryDate, settings.warningDays, p.manufactureDate);
      return status === filter;
    });
  }, [products, search, filter, settings.warningDays]);

  return (
    <div className="flex flex-col min-h-screen" style={{ paddingBottom: 88 }}>
      {/* Header */}
      <div className="px-5 pt-14 pb-4">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Expiry Tracker</h1>
            <p className="text-white/40 text-sm mt-0.5">{stats.total} sản phẩm đang theo dõi</p>
          </div>
          <button
            onClick={() => onNavigate('scanner')}
            className="w-11 h-11 rounded-2xl flex items-center justify-center transition-all active:scale-90"
            style={{ background: 'rgba(0,230,118,0.15)', color: '#00E676' }}
          >
            <Plus size={22} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats.total > 0 && (
        <div className="px-5 mb-4 grid grid-cols-3 gap-2">
          <StatCard
            icon={<AlertTriangle size={16} />}
            value={stats.expired}
            label="Hết hạn"
            color="#FF4444"
            onClick={() => setFilter('expired')}
            active={filter === 'expired'}
          />
          <StatCard
            icon={<Clock size={16} />}
            value={stats.warning}
            label="Sắp hết"
            color="#FFB800"
            onClick={() => setFilter('warning')}
            active={filter === 'warning'}
          />
          <StatCard
            icon={<CheckCircle size={16} />}
            value={stats.ok}
            label="Còn hạn"
            color="#00E676"
            onClick={() => setFilter('ok')}
            active={filter === 'ok'}
          />
        </div>
      )}

      {/* Search */}
      <div className="px-5 mb-3">
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-2xl"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <Search size={18} className="text-white/30 flex-shrink-0" />
          <input
            type="text"
            placeholder="Tìm sản phẩm..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-transparent flex-1 text-white text-sm outline-none placeholder:text-white/25"
          />
        </div>
      </div>

      {/* Filter tabs */}
      <div className="px-5 mb-4 flex gap-2 overflow-x-auto scrollbar-none">
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className="flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold transition-all"
            style={{
              background: filter === f.id ? 'rgba(0,230,118,0.15)' : 'rgba(255,255,255,0.05)',
              color: filter === f.id ? '#00E676' : 'rgba(255,255,255,0.4)',
              border: filter === f.id ? '1px solid rgba(0,230,118,0.3)' : '1px solid transparent',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Product list */}
      <div className="px-5 flex flex-col gap-2">
        {filtered.length === 0 ? (
          <EmptyState hasProducts={stats.total > 0} onAdd={() => onNavigate('scanner')} />
        ) : (
          filtered.map(p => (
            <ProductCard
              key={p.id}
              product={p}
              onClick={() => onSelectProduct(p.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, value, label, color, onClick, active }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 py-3 px-2 rounded-2xl transition-all active:scale-95"
      style={{
        background: active ? `rgba(${hexToRgb(color)},0.15)` : 'rgba(255,255,255,0.04)',
        border: active ? `1px solid ${color}40` : '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <span style={{ color }}>{icon}</span>
      <span className="text-xl font-bold text-white">{value}</span>
      <span className="text-[10px] text-white/40">{label}</span>
    </button>
  );
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? `${parseInt(result[1], 16)},${parseInt(result[2], 16)},${parseInt(result[3], 16)}`
    : '255,255,255';
}

function EmptyState({ hasProducts, onAdd }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div
        className="w-20 h-20 rounded-3xl flex items-center justify-center mb-5"
        style={{ background: 'rgba(0,230,118,0.08)', border: '1px solid rgba(0,230,118,0.15)' }}
      >
        <span className="text-4xl">{hasProducts ? '🔍' : '📦'}</span>
      </div>
      <p className="text-white/60 font-semibold text-lg mb-1">
        {hasProducts ? 'Không tìm thấy sản phẩm' : 'Chưa có sản phẩm nào'}
      </p>
      <p className="text-white/30 text-sm mb-6">
        {hasProducts ? 'Thử thay đổi bộ lọc hoặc từ khóa' : 'Nhấn + để thêm sản phẩm đầu tiên'}
      </p>
      {!hasProducts && (
        <button
          onClick={onAdd}
          className="px-6 py-3 rounded-2xl font-semibold text-sm transition-all active:scale-95"
          style={{ background: 'rgba(0,230,118,0.15)', color: '#00E676', border: '1px solid rgba(0,230,118,0.3)' }}
        >
          Quét mã barcode
        </button>
      )}
    </div>
  );
}
