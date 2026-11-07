import { useState } from 'react';
import { api, qs } from '../api';
import { fmtDate, inr, todayISO } from '../format';
import { Empty, ErrorState, Field, Skeleton, useFetch, useToast } from '../ui';

export default function Bookings() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [day, setDay] = useState(todayISO());
  const list = useFetch((signal) => api(`/admin/bookings?${qs({ q, status })}`, { signal }), [q, status]);

  const cancel = async (b) => {
    if (!window.confirm(`Cancel ${b.code} for ${b.guest?.name}? The room goes back to the website allotment. Refund is handled outside this system.`)) return;
    try { await api(`/admin/bookings/${b.id}/cancel`, { method: 'POST' }); toast(`${b.code} cancelled and room released.`); list.reload(); } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div className="stack" style={{ gap: '1.2rem' }}>
      <div><h1 style={{ fontSize: '2rem' }}>Bookings</h1><p className="muted small">Direct bookings made on the website.</p></div>
      <div className="panel" style={{ maxWidth: 640 }}>
        <h3>Daily export for the reservation system</h3>
        <div className="row" style={{ gridTemplateColumns: '1fr auto', alignItems: 'end' }}>
          <Field label="Bookings created on" hint="One CSV row per booking made (or since cancelled) that day."><input type="date" max={todayISO()} value={day} onChange={(e) => setDay(e.target.value)} /></Field>
          <a className="btn" href={`/api/admin/export/bookings.csv?date=${day}`} download>Download CSV</a>
        </div>
      </div>
      <div className="row row-2" style={{ maxWidth: 640 }}>
        <Field label="Search"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Reference, name or email" /></Field>
        <Field label="Status"><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option><option value="confirmed">Confirmed</option><option value="cancelled">Cancelled</option></select></Field>
      </div>
      {list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : list.loading && !list.data ? <Skeleton h={200} r={8} /> : !list.data.bookings.length ? <Empty title="No bookings found">Try a different search.</Empty> : (
        <div className="tablewrap"><table>
          <thead><tr><th>Reference</th><th>Guest</th><th>Room</th><th>Stay</th><th>Total</th><th>Status</th><th /></tr></thead>
          <tbody>{list.data.bookings.map((b) => (
            <tr key={b.id}>
              <td><strong>{b.code}</strong></td><td>{b.guest?.name}<br /><span className="muted small">{b.guest?.email}</span></td>
              <td>{b.roomName}{b.rooms > 1 ? ` ×${b.rooms}` : ''}<br /><span className="muted small">{b.plan}</span></td>
              <td>{fmtDate(b.checkIn, { day: 'numeric', month: 'short' })} → {fmtDate(b.checkOut, { day: 'numeric', month: 'short' })}</td>
              <td>{inr(b.total)}</td><td><span className={`badge ${b.status === 'confirmed' ? 'badge-ok' : 'badge-red'}`}>{b.status}</span></td>
              <td>{b.status === 'confirmed' && <button className="btn btn-danger btn-sm" onClick={() => cancel(b)}>Cancel</button>}</td>
            </tr>))}</tbody>
        </table></div>
      )}
    </div>
  );
}
