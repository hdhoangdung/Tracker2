import { memo } from 'react';
import { STATUS_CONFIG } from '../utils/statusUtils';

export const StatusBadge = memo(function StatusBadge({ status, label }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.ok;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ color: cfg.color, background: cfg.bg }}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: cfg.color }} />
      {label || cfg.text}
    </span>
  );
});
