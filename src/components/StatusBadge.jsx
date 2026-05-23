import { STATUS_CONFIG } from '../utils/statusUtils';

export function StatusBadge({ status, label }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.ok;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold tracking-wide"
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
