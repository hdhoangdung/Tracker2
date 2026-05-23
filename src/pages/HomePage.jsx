import { useState, useMemo, useCallback, useTransition, memo, useEffect, useRef } from 'react';
import { Search, Plus, AlertTriangle, CheckCircle, Clock, X } from 'lucide-react';
import { useProducts } from '../context/ProductContext';
import { ProductCard } from '../components/ProductCard';

const FILTERS = [
  { id: 'all',     label: 'Tất cả' },
  { id: 'expired', label: 'Hết hạn' },
  { id: 'warning', label: 'Sắp hết' },
  { id: 'ok',      label: 'Còn hạn' },
];

function useDebounce(value, delay = 130) {
  const [dv, setDv] = useState(value);
  const t = useRef(null);
  useEffect(() => {
    t.current = setTimeout(() => setDv(value), delay);
    return () => clearTimeout(t.current);
  }, [value, delay]);
  return dv;
}

export function HomePage({ onNavigate, onSelectProduct }) {
  const { products } = useProducts();
  const [searchRaw, setSearchRaw] = useState('');
  const [filter, setFilter] = useState('all');
  const [, startTransition] = useTransition();
  const search = useDebounce(searchRaw);

  const stats = useMemo(() => {
    let expired = 0, warning = 0, ok = 0;
    for (const p of products) {
      if (p._status.status === 'expired') expired++;
      else if (p._status.status === 'warning') warning++;
      else ok++;
    }
    return { expired, warning, ok, total: products.length };
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter(p => {
      if (filter !== 'all' && p._status.status !== filter) return false;
      if (!q) return true;
      return (
        p.name?.toLowerCase().includes(q) ||
        p.brand?.toLowerCase().includes(q) ||
        p.barcode?.includes(q)
      );
    });
  }, [products, search, filter]);

  const handleFilter = useCallback((id) => {
    startTransition(() => setFilter(f => f === id ? 'all' : id));
  }, []);

  const clearSearch = useCallback(() => setSearchRaw(''), []);

  return (
    <div className="flex flex-col" style={{ minHeight: '100svh', paddingBottom: 80 }}>
      {/* Header */}
      <div className="px-5 pt-12 pb-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-bold text-white tracking-tight leading-tight">
              Expiry Tracker
            </h1>
            <p className="text-white/35 text-xs mt-0.5">{stats.total} sản phẩm đang theo dõi</p>
          </div>
          <button
            onClick={() => onNavigate('scanner')}
            className="w-11 h-11 rounded-2xl flex items-center justify-center active:scale-90"
            style={{ background: 'rgba(0,230,118,0.14)', color: '#00E676', transition: 'transform 0.1s' }}
            aria-label="Thêm sản phẩm"
          >
            <Plus size={22} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats.total > 0 && (
        <div className="px-5 mb-3 grid grid-cols-3 gap-2">
          <StatCard value={stats.expired} label="Hết hạn"  color="#FF4444" icon={<AlertTriangle size={14}/>} active={filter==='expired'} onClick={() => handleFilter('expired')} />
          <StatCard value={stats.warning} label="Sắp hết"  color="#FFB800" icon={<Clock size={14}/>}          active={filter==='warning'} onClick={() => handleFilter('warning')} />
          <StatCard value={stats.ok}      label="Còn hạn"  color="#00E676" icon={<CheckCircle size={14}/>}    active={filter==='ok'}      onClick={() => handleFilter('ok')} />
        </div>
      )}

      {/* Search */}
      <div className="px-5 mb-2">
        <div
          className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <Search size={16} className="text-white/30 flex-shrink-0" />
          <input
            type="search"
            placeholder="Tìm tên, thương hiệu, barcode..."
            value={searchRaw}
            onChange={e => setSearchRaw(e.target.value)}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="bg-transparent flex-1 text-white text-sm outline-none placeholder:text-white/20"
            style={{ caretColor: '#00E676' }}
          />
          {searchRaw && (
            <button onClick={clearSearch} className="text-white/30">
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="px-5 mb-3 flex gap-1.5">
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => handleFilter(f.id)}
            className="flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold"
            style={{
              background: filter === f.id ? 'rgba(0,230,118,0.14)' : 'rgba(255,255,255,0.05)',
              color:      filter === f.id ? '#00E676' : 'rgba(255,255,255,0.35)',
              border:     filter === f.id ? '1px solid rgba(0,230,118,0.28)' : '1px solid transparent',
              transition: 'all 0.14s ease',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="px-5 flex flex-col gap-2">
        {filtered.length === 0 ? (
          <EmptyState hasProducts={stats.total > 0} search={searchRaw} onAdd={() => onNavigate('scanner')} onClear={clearSearch} />
        ) : (
          filtered.map(p => (
            <ProductCard key={p.id} product={p} onClick={() => onSelectProduct(p.id)} />
          ))
        )}
      </div>
    </div>
  );
}

const StatCard = memo(function StatCard({ value, label, color, icon, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-0.5 py-2.5 rounded-2xl active:scale-95"
      style={{
        background: active ? `color-mix(in srgb, ${color} 15%, transparent)` : 'rgba(255,255,255,0.04)',
        border:     active ? `1px solid color-mix(in srgb, ${color} 35%, transparent)` : '1px solid rgba(255,255,255,0.06)',
        transition: 'all 0.14s ease',
      }}
    >
      <span style={{ color, opacity: active ? 1 : 0.6 }}>{icon}</span>
      <span className="text-xl font-bold text-white leading-tight">{value}</span>
      <span className="text-[10px] text-white/35">{label}</span>
    </button>
  );
});

function EmptyState({ hasProducts, search, onAdd, onClear }) {
  return (
    <div className="flex flex-col items-center py-16 text-center">
      <div className="text-4xl mb-4">{hasProducts ? '🔍' : '📦'}</div>
      <p className="text-white/50 font-semibold mb-1">
        {hasProducts ? 'Không tìm thấy kết quả' : 'Chưa có sản phẩm nào'}
      </p>
      <p className="text-white/25 text-sm mb-5">
        {search ? `Không có kết quả cho "${search}"` : hasProducts ? 'Thử thay đổi bộ lọc' : 'Quét mã để thêm sản phẩm'}
      </p>
      {search ? (
        <button onClick={onClear} className="px-5 py-2.5 rounded-xl text-sm font-semibold"
          style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.6)' }}>
          Xóa tìm kiếm
        </button>
      ) : !hasProducts ? (
        <button onClick={onAdd} className="px-5 py-3 rounded-2xl font-semibold text-sm active:scale-95"
          style={{ background: 'rgba(0,230,118,0.14)', color: '#00E676', border: '1px solid rgba(0,230,118,0.28)' }}>
          Quét mã barcode
        </button>
      ) : null}
    </div>
  );
}
