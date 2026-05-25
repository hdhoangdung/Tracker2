import { Home, ScanLine, Settings } from 'lucide-react';

const TABS = [
  { id: 'home', label: 'Trang chủ', icon: Home },
  { id: 'scanner', label: 'Quét mã', icon: ScanLine },
  { id: 'settings', label: 'Cài đặt', icon: Settings },
];

export function BottomNav({ active, onChange }) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around px-2 pb-safe"
      style={{
        background: 'rgba(10,10,15,0.92)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        height: 72,
      }}
    >
      {TABS.map(({ id, label, icon: Icon }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            className="flex flex-col items-center gap-1.5 px-6 py-2 rounded-2xl transition-all duration-200 active:scale-90 relative"
            style={{
              color: isActive ? '#00E676' : 'rgba(255,255,255,0.3)',
            }}
          >
            {isActive && (
              <span
                className="absolute -top-0.5 w-8 h-[2px] rounded-full"
                style={{ background: '#00E676', boxShadow: '0 0 8px rgba(0,230,118,0.5)' }}
              />
            )}
            <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
            <span className={`text-[10px] font-semibold tracking-wide ${isActive ? 'opacity-100' : 'opacity-60'}`}>
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
