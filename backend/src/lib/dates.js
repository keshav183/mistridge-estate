// All stay dates are plain "YYYY-MM-DD" strings in the property's local calendar (IST).
// Strings sort correctly, avoid timezone drift, and index cleanly in MongoDB.
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function isValidISODate(s) {
  if (typeof s !== 'string' || !ISO.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addDays(s, n) {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const diffDays = (a, b) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

export const todayIST = (now = Date.now()) => new Date(now + 330 * 60_000).toISOString().slice(0, 10);

export const weekday = (s) => new Date(`${s}T00:00:00Z`).getUTCDay();

/** Nights occupied by a stay: check-in night up to, not including, check-out. */
export function eachNight(checkIn, checkOut) {
  const out = [];
  for (let d = checkIn; d < checkOut; d = addDays(d, 1)) out.push(d);
  return out;
}

export function validateStay(checkIn, checkOut, { today = todayIST(), maxNights = 14, horizonDays = 400 } = {}) {
  if (!isValidISODate(checkIn) || !isValidISODate(checkOut)) return { ok: false, error: 'Choose valid dates.' };
  if (checkIn < today) return { ok: false, error: 'Check-in cannot be in the past.' };
  if (checkOut <= checkIn) return { ok: false, error: 'Check-out must be after check-in.' };
  const nights = diffDays(checkIn, checkOut);
  if (nights > maxNights) return { ok: false, error: `Online bookings are limited to ${maxNights} nights. Send us an enquiry for longer stays.` };
  if (diffDays(today, checkIn) > horizonDays) return { ok: false, error: 'Those dates are not open for booking yet.' };
  return { ok: true, nights };
}
