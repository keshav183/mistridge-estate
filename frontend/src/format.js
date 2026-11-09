export const BRAND = 'Mistridge Estate';
export const coverOf = (room) => room?.photos?.[0]?.url || '/photos/estate.svg'; // placeholder until staff upload real photos
export const inr = (n) => '₹' + Math.round(n ?? 0).toLocaleString('en-IN');
export const todayISO = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
export const addDays = (s, n) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const nightsBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);
export const fmtDate = (iso, o = { day: 'numeric', month: 'short', year: 'numeric' }) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { ...o, timeZone: 'UTC' });
export const fmtRange = (a, b) => `${fmtDate(a, { day: 'numeric', month: 'short' })} – ${fmtDate(b, { day: 'numeric', month: 'short', year: 'numeric' })}`;
export const fmtTime = (iso) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
export const ago = (iso) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000));
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
export const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
export const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
