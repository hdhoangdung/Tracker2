import dayjs from 'dayjs';

/**
 * @param {string} expiryDate       ISO date string (YYYY-MM-DD)
 * @param {number} warningDays      Fallback warning threshold (days), used when manufactureDate is absent
 * @param {string|null} manufactureDate  ISO date string (YYYY-MM-DD). When provided together with
 *                                       expiryDate, the warning threshold is computed dynamically as
 *                                       floor(totalDays / 3) where totalDays = expiryDate - manufactureDate.
 * @returns {{ status: 'expired'|'warning'|'ok', daysLeft: number, label: string }}
 */
export function getExpiryStatus(expiryDate, warningDays = 7, manufactureDate = null) {
  if (!expiryDate) return { status: 'ok', daysLeft: Infinity, label: 'Không rõ' };

  const today = dayjs().startOf('day');
  const expiry = dayjs(expiryDate).startOf('day');
  const daysLeft = expiry.diff(today, 'day');

  if (daysLeft < 0) {
    return {
      status: 'expired',
      daysLeft,
      label: `Hết hạn ${Math.abs(daysLeft)} ngày trước`,
    };
  }

  if (daysLeft === 0) {
    return { status: 'warning', daysLeft: 0, label: 'Hết hạn hôm nay' };
  }

  // Determine the effective warning threshold
  let threshold = warningDays;
  if (manufactureDate) {
    const manufacture = dayjs(manufactureDate).startOf('day');
    const totalDays = expiry.diff(manufacture, 'day');
    threshold = Math.floor(totalDays / 3);
  }

  if (daysLeft <= threshold) {
    return {
      status: 'warning',
      daysLeft,
      label: `Còn ${daysLeft} ngày`,
    };
  }

  return {
    status: 'ok',
    daysLeft,
    label: `Còn ${daysLeft} ngày`,
  };
}

export const STATUS_CONFIG = {
  expired: {
    color: '#FF4444',
    bg: 'rgba(255,68,68,0.12)',
    text: 'Hết hạn',
  },
  warning: {
    color: '#FFB800',
    bg: 'rgba(255,184,0,0.12)',
    text: 'Sắp hết hạn',
  },
  ok: {
    color: '#00E676',
    bg: 'rgba(0,230,118,0.12)',
    text: 'Còn hạn',
  },
};

export function sortByExpiry(products) {
  return [...products].sort((a, b) => {
    if (!a.expiryDate) return 1;
    if (!b.expiryDate) return -1;
    return dayjs(a.expiryDate).valueOf() - dayjs(b.expiryDate).valueOf();
  });
}
