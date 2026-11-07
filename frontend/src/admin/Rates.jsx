import { useState } from 'react';
import { api } from '../api';
import { addDays, fmtDate, inr, todayISO } from '../format';
import { ErrorState, Field, Skeleton, Spinner, useFetch, useToast } from '../ui';

const DAYS = [['M', 1], ['T', 2], ['W', 3], ['T', 4], ['F', 5], ['S', 6], ['S', 0]];
const dow = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' });

export default function Rates() {
  const toast = useToast();
  const [from, setFrom] = useState(todayISO());
  const [form, setForm] = useState({ roomTypeId: '', from: todayISO(), to: todayISO(), weekdays: [], rate: '', allotment: '', blackout: 'keep' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const q = useFetch((signal) => api(`/admin/inventory?from=${from}&days=14`, { signal }), [from]);
  const types = q.data?.roomTypes || [];
  const rowMap = new Map((q.data?.rows || []).map((r) => [`${r.roomType}|${r.date}`, r]));
  const dates = Array.from({ length: 14 }, (_, i) => addDays(from, i));
  const selType = types.find((t) => t._id === form.roomTypeId);

  const submit = async (e) => {
    e.preventDefault(); setError(null);
    if (!form.roomTypeId) return setError({ message: 'Choose a room type.' });
    const body = { roomTypeId: form.roomTypeId, from: form.from, to: form.to, ...(form.weekdays.length ? { weekdays: form.weekdays } : {}) };
    if (form.rate !== '') body.rate = Number(form.rate);
    if (form.allotment !== '') body.allotment = Number(form.allotment);
    if (form.blackout !== 'keep') body.blackout = form.blackout === 'block';
    setBusy(true);
    try {
      const r = await api('/admin/inventory/bulk', { method: 'PUT', body });
      toast(`Updated ${r.dates} night${r.dates > 1 ? 's' : ''}${r.skippedBelowSold ? `. ${r.skippedBelowSold} kept their allotment because rooms are already sold` : ''}.`);
      q.reload();
    } catch (x) { setError(x); } finally { setBusy(false); }
  };

  return (
    <div className="stack" style={{ gap: '1.4rem' }}>
      <div className="topbar" style={{ marginBottom: 0 }}>
        <div><h1 style={{ fontSize: '2rem' }}>Rates &amp; allotment</h1><p className="muted small">Allotment is what the website may sell. Sold counts never go above it, whatever the demand.</p></div>
        <div style={{ display: 'flex', gap: '.5rem' }}>
          <button className="btn btn-quiet btn-sm" onClick={() => setFrom(addDays(from, -14))} disabled={from <= todayISO()}>← Earlier</button>
          <button className="btn btn-quiet btn-sm" onClick={() => setFrom(todayISO())}>Today</button>
          <button className="btn btn-quiet btn-sm" onClick={() => setFrom(addDays(from, 14))}>Later →</button>
        </div>
      </div>

      {q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : q.loading && !q.data ? <Skeleton h={300} r={8} /> : (
        <div className="tablewrap">
          <table className="grid-rates">
            <thead><tr><th>Room type</th>{dates.map((d) => <th key={d} style={{ textAlign: 'center' }}>{dow(d)}<br /><span className="muted small">{fmtDate(d, { day: 'numeric', month: 'short' })}</span></th>)}</tr></thead>
            <tbody>
              {types.map((t) => (
                <tr key={t._id}>
                  <td><strong>{t.name}</strong><br /><span className="muted small">{t.units} units</span></td>
                  {dates.map((d) => {
                    const r = rowMap.get(`${t._id}|${d}`);
                    const full = r && r.allotment > 0 && r.sold >= r.allotment;
                    const sel = form.roomTypeId === t._id && d >= form.from && d <= form.to;
                    return (
                      <td key={d} className={`gcell ${r?.blackout ? 'blocked' : full ? 'full' : ''} ${sel ? 'sel' : ''}`} tabIndex={0} role="button"
                        aria-label={`${t.name} ${d}`} onClick={() => setForm({ ...form, roomTypeId: t._id, from: d, to: d })}
                        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setForm({ ...form, roomTypeId: t._id, from: d, to: d })}>
                        {r ? <><b>{inr(r.rate)}</b>{r.blackout ? 'Blocked' : `${r.sold} / ${r.allotment}`}</> : <span className="muted">—</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">Each cell shows the base nightly rate and rooms sold / website allotment. Click a cell to edit that night.</p>

      <form className="panel" onSubmit={submit} noValidate style={{ maxWidth: 820 }}>
        <h3>Change rates, allotment or blackout</h3>
        {error && <div className="alert alert-error" role="alert">{error.message}{error.fields && Object.values(error.fields).length ? ` ${Object.values(error.fields).join(' ')}` : ''}</div>}
        <div className="row row-3">
          <Field label="Room type"><select value={form.roomTypeId} onChange={(e) => setForm({ ...form, roomTypeId: e.target.value })}><option value="">Select…</option>{types.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}</select></Field>
          <Field label="From"><input type="date" min={todayISO()} value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value, to: form.to < e.target.value ? e.target.value : form.to })} /></Field>
          <Field label="To"><input type="date" min={form.from} value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} /></Field>
        </div>
        <div className="field"><span className="field-label">Only on these days <span className="muted">(none selected = every day)</span></span>
          <div className="weekdays">{DAYS.map(([l, n]) => <button type="button" key={n} aria-pressed={form.weekdays.includes(n)} aria-label={['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][n]} onClick={() => setForm({ ...form, weekdays: form.weekdays.includes(n) ? form.weekdays.filter((x) => x !== n) : [...form.weekdays, n] })}>{l}</button>)}</div></div>
        <div className="row row-3">
          <Field label="Nightly rate (₹)" hint="Before GST. Leave empty to keep."><input type="number" inputMode="numeric" min="500" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} /></Field>
          <Field label="Website allotment" hint={selType ? `Max ${selType.units} units. Leave empty to keep.` : 'Leave empty to keep.'}><input type="number" inputMode="numeric" min="0" max={selType?.units} value={form.allotment} onChange={(e) => setForm({ ...form, allotment: e.target.value })} /></Field>
          <Field label="Blackout"><select value={form.blackout} onChange={(e) => setForm({ ...form, blackout: e.target.value })}><option value="keep">No change</option><option value="block">Block (not sellable)</option><option value="open">Reopen</option></select></Field>
        </div>
        <div><button className="btn" disabled={busy}>{busy ? <><Spinner /> Saving…</> : 'Apply changes'}</button></div>
      </form>
    </div>
  );
}
