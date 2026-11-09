import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api, qs } from '../api';
import { PublicShell } from '../App';
import { fmtDate, fmtRange, plural } from '../format';
import { PriceLines } from '../Price';
import { Field, Spinner } from '../ui';

export function BookingCard({ b, isNew }) {
  const cancelled = b.status === 'cancelled';
  return (
    <div className="confirm stack">
      <div className="stack" style={{ gap: '.5rem' }}>
        {isNew && <div className="alert alert-ok" role="status">Booking confirmed. Keep this reference; you will need it, with your email, to find the booking again.</div>}
        {cancelled && <div className="alert alert-error">This booking has been cancelled.</div>}
        <span className="muted small">Booking reference</span>
        <div className="code">{b.code}</div>
      </div>
      <div className="panel">
        <h3>{b.roomName}</h3>
        <dl className="kv">
          <dt>Stay</dt><dd>{fmtRange(b.checkIn, b.checkOut)} ({plural(b.nights, 'night')})</dd>
          <dt>Guests</dt><dd>{plural(b.adults, 'adult')}{b.children ? `, ${plural(b.children, 'child')}` : ''}{b.rooms > 1 ? ` · ${b.rooms} rooms` : ''}</dd>
          <dt>Rate plan</dt><dd>{b.ratePlan?.name}{b.ratePlan?.refundable === false ? ' (non-refundable)' : ''}</dd>
          <dt>Lead guest</dt><dd>{b.guest?.name}</dd>
          <dt>Payment</dt><dd>{b.payment?.status === 'paid' ? `Paid by card ending ${b.payment.last4}` : b.payment?.status}{b.payment?.mode === 'test' ? ' (test mode)' : ''}</dd>
        </dl>
        <PriceLines quote={b.pricing} promoCode={b.promoCode} />
        <p className="muted small">Check-in from 2 pm, check-out by 11 am. Foreign guests: please carry your passport and visa; Form C details are taken at check-in.</p>
      </div>
      <div style={{ display: 'flex', gap: '.8rem', flexWrap: 'wrap' }}><Link className="btn" to="/">Back to the estate</Link></div>
    </div>
  );
}

export default function Lookup() {
  const loc = useLocation();
  const [form, setForm] = useState({ code: '', email: '' });
  const [booking, setBooking] = useState(loc.state?.booking || null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const isNew = Boolean(loc.state?.isNew);

  const find = async (e) => {
    e.preventDefault(); setErr(null); setBusy(true);
    try { setBooking((await api(`/bookings/lookup?${qs({ code: form.code.trim(), email: form.email.trim() })}`)).booking); }
    catch (x) { setErr(x); } finally { setBusy(false); }
  };

  if (booking) return <PublicShell><div className="wrap"><BookingCard b={booking} isNew={isNew} />{!isNew && <div className="confirm"><button className="btn btn-quiet" onClick={() => setBooking(null)}>Look up another booking</button></div>}</div></PublicShell>;
  return (
    <PublicShell>
      <form className="narrow" onSubmit={find} noValidate>
        <h1 style={{ fontSize: '2.2rem' }}>Find my booking</h1>
        <p className="muted">Enter the reference from your confirmation and the email you booked with.</p>
        {err && <div className="alert alert-error" role="alert">{err.message}</div>}
        <Field label="Booking reference"><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="MR-XXXXXX" autoCapitalize="characters" required /></Field>
        <Field label="Email"><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required autoComplete="email" /></Field>
        <button className="btn" disabled={busy || !form.code || !form.email}>{busy ? <Spinner /> : 'Find booking'}</button>
      </form>
    </PublicShell>
  );
}
