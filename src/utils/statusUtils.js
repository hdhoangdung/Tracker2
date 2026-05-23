import dayjs from 'dayjs';

export function getExpiryStatus(expiryDate, warningDays = 7) {
  if (!expiryDate) return { status: 'ok', daysLeft: Infinity, label: 'Không rõ HSD' };
  const today = dayjs().startOf('day');
  const expiry = dayjs(expiryDate).startOf('day');
  const daysLeft = expiry.diff(today, 'day');
  if (daysLeft < 0) return { status: 'expired', daysLeft, label: `Hết hạn ${Math.abs(daysLeft)}n trước` };
  if (daysLeft === 0) return { status: 'warning', daysLeft: 0, label: 'Hết hạn HÔM NAY' };
  if (daysLeft <= warningDays) return { status: 'warning', daysLeft, label: `Còn ${daysLeft} ngày` };
  if (daysLeft > 365) return { status: 'ok', daysLeft, label: `Còn ~${Math.floor(daysLeft / 30)} tháng` };
  return { status: 'ok', daysLeft, label: `Còn ${daysLeft} ngày` };
}

export const STATUS_CONFIG = {
  expired: { color: '#FF4444', bg: 'rgba(255,68,68,0.12)',    text: 'Hết hạn'    },
  warning: { color: '#FFB800', bg: 'rgba(255,184,0,0.12)',    text: 'Sắp hết hạn' },
  ok:      { color: '#00E676', bg: 'rgba(0,230,118,0.12)',    text: 'Còn hạn'    },
};

/** Attach _status to every product in one pass */
export function computeProductsWithStatus(products, warningDays) {
  return products.map(p => ({ ...p, _status: getExpiryStatus(p.expiryDate, warningDays) }));
}

export function sortByExpiry(products) {
  return [...products].sort((a, b) => {
    if (!a.expiryDate) return 1;
    if (!b.expiryDate) return -1;
    return dayjs(a.expiryDate).valueOf() - dayjs(b.expiryDate).valueOf();
  });
}
