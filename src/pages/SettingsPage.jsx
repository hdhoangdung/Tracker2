import { useState } from 'react';
import { Settings, Bell, Trash2, ChevronRight, AlertTriangle, Moon, Info } from 'lucide-react';
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

  return (
    <div className="flex flex-col min-h-screen" style={{ paddingBottom: 88 }}>
      {/* Header */}
      <div className="px-5 pt-14 pb-6">
        <h1 className="text-2xl font-bold text-white">Cài đặt</h1>
        <p className="text-white/40 text-sm mt-0.5">Tùy chỉnh ứng dụng</p>
      </div>

      <div className="px-5 flex flex-col gap-4">
        {/* Notifications section */}
        <Section title="Cảnh báo hết hạn" icon={<Bell size={16} />}>
          <SettingRow label="Cảnh báo trước (ngày)" description="Cảnh báo khi sản phẩm sắp hết hạn trong vòng N ngày">
            <div className="flex items-center gap-2">
              <button
                onClick={() => saveSettings({ warningDays: Math.max(1, settings.warningDays - 1) })}
                className="w-8 h-8 rounded-xl font-bold text-white flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.08)' }}
              >−</button>
              <span className="text-white font-bold text-base w-10 text-center">
                {settings.warningDays}
              </span>
              <button
                onClick={() => saveSettings({ warningDays: Math.min(30, settings.warningDays + 1) })}
                className="w-8 h-8 rounded-xl font-bold flex items-center justify-center"
                style={{ background: 'rgba(0,230,118,0.12)', color: '#00E676' }}
              >+</button>
            </div>
          </SettingRow>
        </Section>

        {/* Stats section */}
        <Section title="Thống kê" icon={<Info size={16} />}>
          <div className="grid grid-cols-2 gap-3 p-4">
            {[
              { label: 'Tổng sản phẩm', value: products.length },
              { label: 'Đã thêm hôm nay', value: products.filter(p => {
                const d = new Date(p.createdAt);
                const t = new Date();
                return d.toDateString() === t.toDateString();
              }).length },
            ].map(s => (
              <div
                key={s.label}
                className="p-4 rounded-2xl text-center"
                style={{ background: 'rgba(255,255,255,0.04)' }}
              >
                <p className="text-3xl font-bold text-white">{s.value}</p>
                <p className="text-white/30 text-xs mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* Danger zone */}
        <Section title="Vùng nguy hiểm" icon={<AlertTriangle size={16} color="#FF4444" />} danger>
          <div className="p-4">
            <button
              onClick={handleClear}
              className="w-full py-3.5 rounded-2xl font-semibold text-sm transition-all active:scale-95"
              style={{
                background: confirmClear ? 'rgba(255,68,68,0.2)' : 'rgba(255,68,68,0.08)',
                color: '#FF4444',
                border: '1px solid rgba(255,68,68,0.2)',
              }}
            >
              {confirmClear ? '⚠️ Nhấn lần nữa để xác nhận xóa tất cả' : 'Xóa tất cả sản phẩm'}
            </button>
            <p className="text-white/25 text-xs text-center mt-2">
              Hành động này không thể hoàn tác
            </p>
          </div>
        </Section>

        {/* About */}
        <div className="mt-2 text-center">
          <p className="text-white/20 text-xs">Expiry Tracker v1.0.0</p>
          <p className="text-white/15 text-xs mt-0.5">Theo dõi hạn sử dụng sản phẩm dễ dàng</p>
        </div>
      </div>
    </div>
  );
}

function Section({ title, icon, children, danger = false }) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        border: danger
          ? '1px solid rgba(255,68,68,0.15)'
          : '1px solid rgba(255,255,255,0.07)',
        background: 'rgba(255,255,255,0.02)',
      }}
    >
      <div
        className="flex items-center gap-2 px-4 py-3"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
      >
        <span className={danger ? 'text-red-400' : 'text-white/40'}>{icon}</span>
        <p className={`text-xs font-bold tracking-wider uppercase ${danger ? 'text-red-400' : 'text-white/40'}`}>
          {title}
        </p>
      </div>
      {children}
    </div>
  );
}

function SettingRow({ label, description, children }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-4">
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-semibold">{label}</p>
        {description && <p className="text-white/30 text-xs mt-0.5 leading-relaxed">{description}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}
