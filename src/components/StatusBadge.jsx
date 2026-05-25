import { STATUS_CONFIG } from '../utils/statusUtils';

export function StatusBadge({ status, label, size = 'sm' }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.ok;
  const sizes = {
    sm: 'text-xs px-2.5 py-1',
    md: 'text-sm px-3 py-1.5',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold tracking-wide ${sizes[size] || sizes.sm}`}
      style={{ color: config.color, background: config.bg }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: config.color, boxShadow: `0 0 6px ${config.color}` }}
      />
      {label || config.text}
    </span>
  );
}
