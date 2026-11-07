import { useMemo, useState } from 'react';
import { addDays, inr, todayISO } from './format';

const pad = (n) => String(n).padStart(2, '0');
const monthStart = (y, m) => `${y}-${pad(m + 1)}-01`;
const DOW = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

/**
 * Range picker. `days` (optional) = { 'YYYY-MM-DD': { rate, available, left, blackout } }.
 * With it, unavailable nights can't start or sit inside a stay, but a sold-out day can still be the check-out day.
 */
export default function RangeCalendar({ checkIn, checkOut, onChange, days, showPrices = true }) {
  const today = todayISO();
  const start = checkIn || today;
  const [view, setView] = useState({ y: Number(start.slice(0, 4)), m: Number(start.slice(5, 7)) - 1 });

  const nightOk = (d) => d >= today && (!days || days[d]?.available);
  const stayOk = (a, b) => { for (let d = a; d < b; d = addDays(d, 1)) if (!nightOk(d)) return false; return true; };

  const click = (d) => {
    if (checkIn && !checkOut && d > checkIn && stayOk(checkIn, d)) return onChange(checkIn, d);
    if (nightOk(d)) onChange(d, '');
  };

  const months = useMemo(() => [0, 1].map((off) => {
    const date = new Date(Date.UTC(view.y, view.m + off, 1));
    const y = date.getUTCFullYear(), m = date.getUTCMonth();
    const lead = (date.getUTCDay() + 6) % 7;
    const count = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return { y, m, label: date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }), lead, count };
  }), [view]);

  const shift = (n) => setView((v) => { const d = new Date(Date.UTC(v.y, v.m + n, 1)); return { y: d.getUTCFullYear(), m: d.getUTCMonth() }; });
  const canPrev = monthStart(view.y, view.m) > monthStart(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1);

  return (
    <div className="cal">
      <div className="cal-nav">
        <button type="button" className="icon-btn" onClick={() => shift(-1)} disabled={!canPrev} aria-label="Previous month">‹</button>
        <button type="button" className="icon-btn" onClick={() => shift(1)} aria-label="Next month">›</button>
      </div>
      <div className="cal-months">
        {months.map((mo) => (
          <div key={`${mo.y}-${mo.m}`} className="cal-month">
            <h4>{mo.label}</h4>
            <div className="cal-grid" role="grid">
              {DOW.map((d) => <span key={d} className="cal-dow">{d}</span>)}
              {Array.from({ length: mo.lead }, (_, i) => <span key={`l${i}`} />)}
              {Array.from({ length: mo.count }, (_, i) => {
                const d = `${mo.y}-${pad(mo.m + 1)}-${pad(i + 1)}`;
                const info = days?.[d];
                const ok = nightOk(d);
                const asCheckout = checkIn && !checkOut && d > checkIn && stayOk(checkIn, d);
                const inRange = checkIn && checkOut && d > checkIn && d < checkOut;
                const cls = ['cal-day', !ok && !asCheckout && 'off', d === checkIn && 'start', d === checkOut && 'end', inRange && 'mid', info?.blackout && 'blocked'].filter(Boolean).join(' ');
                return (
                  <button type="button" key={d} className={cls} disabled={!ok && !asCheckout} onClick={() => click(d)}
                    aria-label={`${d}${info ? (info.available ? `, from ${inr(info.rate)}` : ', not available') : ''}`} aria-pressed={d === checkIn || d === checkOut}>
                    <span>{i + 1}</span>
                    {showPrices && info && d >= today && <small>{info.available ? (info.left ? `${info.left} left` : `${(info.rate / 1000).toFixed(info.rate % 1000 ? 1 : 0)}k`) : '—'}</small>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
