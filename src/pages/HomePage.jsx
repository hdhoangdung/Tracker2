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

  const hasItems = stats.total > 0;

  return (
    <div className="flex flex-col min-h-screen" style={{ paddingBottom: 88 }}>
      {/* Header */}
      <div className="px-5 pt-safe" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)', paddingBottom: 8 }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Expiry Tracker</h1>
            <p className="text-white/40 text-sm mt-0.5">
              {hasItems
                ? `${stats.total} sản phẩm đang theo dõi`
                : 'Thêm sản phẩm để bắt đầu'}
            </p>
          </div>
          <button
            onClick={() => onNavigate('scanner')}
            className="w-11 h-11 rounded-2xl flex items-center justify-center transition-all active:scale-90 shadow-lg"
            style={{ background: 'var(--accent)', color: 'var(--bg-primary)', boxShadow: '0 4px 16px rgba(0,230,118,0.25)' }}
          >
            <Plus size={22} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* Stats cards */}
      {hasItems && (
        <div className="px-5 mb-4 grid grid-cols-3 gap-2.5">
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

      {/* Search bar */}
      <div className="px-5 mb-3">
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-200 focus-within:ring-1 focus-within:ring-[var(--accent)]"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <Search size={18} className="text-white/25 flex-shrink-0" />
          <input
            type="text"
            placeholder="Tìm kiếm sản phẩm..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-transparent flex-1 text-white text-sm outline-none placeholder:text-white/20"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="text-white/25 hover:text-white/50 transition-colors text-xs font-medium"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Filter chips */}
      {hasItems && (
        <div className="px-5 mb-4 flex gap-2 overflow-x-auto scrollbar-none">
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className="flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 active:scale-95"
              style={{
                background: filter === f.id ? 'rgba(0,230,118,0.12)' : 'rgba(255,255,255,0.04)',
                color: filter === f.id ? '#00E676' : 'rgba(255,255,255,0.4)',
                border: filter === f.id ? '1px solid rgba(0,230,118,0.25)' : '1px solid rgba(255,255,255,0.06)',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Product list */}
      <div className="px-5 flex flex-col gap-2 pb-4">
        {!hasItems ? (
          <EmptyState onAdd={() => onNavigate('scanner')} />
        ) : filtered.length === 0 ? (
          <EmptySearch onClear={() => { setSearch(''); setFilter('all'); }} />
        ) : (
          filtered.map((p, i) => (
            <div key={p.id} style={{ animation: `fadeSlideIn 0.3s ease-out ${i * 0.04}s both` }}>
              <ProductCard
                product={p}
                onClick={() => onSelectProduct(p.id)}
              />
            </div>
          ))
        )}
      </div>

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function StatCard({ icon, value, label, color, onClick, active }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 py-3.5 px-2 rounded-2xl transition-all duration-200 active:scale-95"
      style={{
        background: active ? `rgba(${hexToRgb(color)},0.12)` : 'rgba(255,255,255,0.03)',
        border: active ? `1px solid ${color}40` : '1px solid rgba(255,255,255,0.05)',
      }}
    >
      <span style={{ color }}>{icon}</span>
      <span className="text-xl font-bold text-white">{value}</span>
      <span className="text-[10px] text-white/40 font-medium">{label}</span>
    </button>
  );
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? `${parseInt(result[1], 16)},${parseInt(result[2], 16)},${parseInt(result[3], 16)}`
    : '255,255,255';
}

function EmptyState({ onAdd }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div
        className="w-24 h-24 rounded-3xl flex items-center justify-center mb-6"
        style={{ background: 'rgba(0,230,118,0.06)', border: '1px solid rgba(0,230,118,0.12)' }}
      >
        <span className="text-5xl">📦</span>
      </div>
      <p className="text-white/70 font-semibold text-lg mb-2">Chưa có sản phẩm nào</p>
      <p className="text-white/30 text-sm mb-8 max-w-[240px] leading-relaxed">
        Quét mã barcode để thêm sản phẩm và theo dõi hạn sử dụng
      </p>
      <button
        onClick={onAdd}
        className="px-8 py-3.5 rounded-2xl font-semibold text-sm transition-all active:scale-95 shadow-lg"
        style={{
          background: 'var(--accent)',
          color: 'var(--bg-primary)',
          boxShadow: '0 4px 20px rgba(0,230,118,0.25)',
        }}
      >
        <span className="flex items-center gap-2">
          <Plus size={18} />
          Quét mã barcode
        </span>
      </button>
    </div>
  );
}

function EmptySearch({ onClear }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
        style={{ background: 'rgba(255,255,255,0.04)' }}
      >
        <Search size={24} className="text-white/20" />
      </div>
      <p className="text-white/60 font-semibold text-base mb-1">Không tìm thấy sản phẩm</p>
      <p className="text-white/30 text-sm mb-6">Thử thay đổi bộ lọc hoặc từ khóa</p>
      <button
        onClick={onClear}
        className="px-5 py-2.5 rounded-xl text-xs font-semibold transition-all active:scale-95"
        style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)' }}
      >
        Xóa bộ lọc
      </button>
    </div>
  );
}
