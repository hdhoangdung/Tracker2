import { useState } from 'react';
import { Bell, Trash2, AlertTriangle, Info } from 'lucide-react';
import { useProducts } from '../context/ProductContext';

export function SettingsPage() {
  const { products, settings, saveSettings, clearAll } = useProducts();
  const [confirmClear, setConfirmClear] = useState(false);

  const handleClear = () => {
    if (confirmClear) {
      clearAll();
      setConfirmClear(false);
    } else {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 4000);
    }
  };

  const todayCount = products.filter(p => {
    const d = new Date(p.createdAt);
    const t = new Date();
    return d.toDateString() === t.toDateString();
  }).length;

  return (
    <div className="flex flex-col min-h-screen" style={{ paddingBottom: 88 }}>
      {/* Header */}
      <div className="px-5 pt-safe" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)', paddingBottom: 20 }}>
        <h1 className="text-2xl font-bold text-white tracking-tight">Cài đặt</h1>
        <p className="text-white/40 text-sm mt-0.5">Tùy chỉnh ứng dụng</p>
      </div>

      <div className="px-5 flex flex-col gap-4">
        {/* Notifications section */}
        <Section icon={<Bell size={16} />} title="Cảnh báo hết hạn">
          <div className="flex items-center justify-between gap-4 px-5 py-4">
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-semibold">Cảnh báo trước</p>
              <p className="text-white/30 text-xs mt-1 leading-relaxed">
                Cảnh báo khi sản phẩm sắp hết hạn trong vòng N ngày
                {products.some(p => p.manufactureDate) && (
                  <span className="block mt-0.5 text-white/20">
                    (Sản phẩm có NSX sẽ dùng ngưỡng động = ⅓ thời hạn)
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => saveSettings({ warningDays: Math.max(1, settings.warningDays - 1) })}
                className="w-8 h-8 rounded-xl font-bold text-white flex items-center justify-center active:scale-90 transition-all glass"
              >−</button>
              <span className="text-white font-bold text-base w-10 text-center tabular-nums">
                {settings.warningDays}
              </span>
              <button
                onClick={() => saveSettings({ warningDays: Math.min(30, settings.warningDays + 1) })}
                className="w-8 h-8 rounded-xl font-bold flex items-center justify-center active:scale-90 transition-all"
                style={{ background: 'rgba(0,230,118,0.12)', color: '#00E676' }}
              >+</button>
            </div>
          </div>
        </Section>

        {/* Stats section */}
        <Section icon={<Info size={16} />} title="Thống kê">
          <div className="grid grid-cols-2 gap-3 p-4">
            {[
              { label: 'Tổng sản phẩm', value: products.length, color: '#00E676' },
              { label: 'Đã thêm hôm nay', value: todayCount, color: '#FFB800' },
            ].map(s => (
              <div
                key={s.label}
                className="p-4 rounded-2xl text-center glass"
              >
                <p className="text-3xl font-bold text-white tabular-nums">{s.value}</p>
                <p className="text-white/30 text-xs mt-1.5">{s.label}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* Danger zone */}
        <Section icon={<AlertTriangle size={16} />} title="Vùng nguy hiểm" danger>
          <div className="p-4">
            <button
              onClick={handleClear}
              className="w-full py-3.5 rounded-2xl font-semibold text-sm transition-all active:scale-95"
              style={{
                background: confirmClear ? 'rgba(255,68,68,0.2)' : 'rgba(255,68,68,0.06)',
                color: '#FF4444',
                border: `1px solid ${confirmClear ? 'rgba(255,68,68,0.3)' : 'rgba(255,68,68,0.15)'}`,
              }}
            >
              {confirmClear ? '⚠️ Nhấn lần nữa để xác nhận' : 'Xóa tất cả sản phẩm'}
            </button>
            <p className="text-white/20 text-xs text-center mt-2">
              Xóa toàn bộ dữ liệu — không thể hoàn tác
            </p>
          </div>
        </Section>

        {/* About */}
        <div className="mt-6 text-center pb-4">
          <p className="text-white/15 text-xs">Expiry Tracker v1.0.0</p>
          <p className="text-white/10 text-xs mt-0.5">Theo dõi hạn sử dụng sản phẩm dễ dàng</p>
        </div>
      </div>
    </div>
  );
}

function Section({ icon, title, children, danger = false }) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        border: danger
          ? '1px solid rgba(255,68,68,0.12)'
          : '1px solid rgba(255,255,255,0.05)',
        background: 'rgba(255,255,255,0.02)',
      }}
    >
      <div
        className="flex items-center gap-2.5 px-5 py-3.5"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
      >
        <span className={danger ? 'text-red-400' : 'text-white/35'}>{icon}</span>
        <p className={`text-xs font-bold tracking-wider uppercase ${danger ? 'text-red-400' : 'text-white/35'}`}>
          {title}
        </p>
      </div>
      {children}
    </div>
  );
}
