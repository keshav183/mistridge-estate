import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { PublicShell } from '../App';
import { Field, Photo, Spinner } from '../ui';

const TYPES = [['wedding', 'Wedding'], ['offsite', 'Corporate offsite'], ['celebration', 'Other celebration']];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^\+?[0-9 ()-]{8,16}$/;
const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

export default function Events() {
  const [f, setF] = useState({ eventType: 'wedding', guests: '', mode: 'flexible', startDate: '', endDate: '', month: '', nights: '', rooms: '', budgetLakh: '', notes: '', name: '', contact: '', consent: false });
  const [errors, setErrors] = useState({});
  const [state, setState] = useState({ busy: false, ref: null, error: null });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const err = (k) => errors[k] || errors[`form.${k}`];

  const submit = async (ev) => {
    ev.preventDefault();
    const e = {};
    if (f.name.trim().length < 2) e.name = 'Enter your name.';
    if (!(EMAIL.test(f.contact.trim()) || PHONE.test(f.contact.trim()))) e.contact = 'Enter an email address or phone number.';
    if (!(Number(f.guests) >= 10)) e.guests = 'Enter the expected number of guests (10 or more).';
    if (f.mode === 'dates' && (!f.startDate || !f.endDate || f.endDate <= f.startDate)) e.startDate = 'Choose a start date and a later end date.';
    if (f.mode === 'flexible' && !f.month) e.month = 'Choose a month.';
    if (!f.consent) e.consent = 'Please accept the privacy notice to continue.';
    setErrors(e);
    if (Object.keys(e).length) { setTimeout(() => document.getElementById('form-errors')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 0); return; }
    setState({ busy: true, ref: null, error: null });
    try {
      const form = { eventType: f.eventType, guests: Number(f.guests), notes: f.notes.trim() || undefined,
        ...(f.mode === 'dates' ? { startDate: f.startDate, endDate: f.endDate } : { flexibleMonth: f.month }),
        nights: f.nights ? Number(f.nights) : undefined, roomsNeeded: f.rooms ? Number(f.rooms) : undefined,
        budgetInr: f.budgetLakh ? Math.round(Number(f.budgetLakh) * 100000) : undefined };
      const d = await api('/enquiries/web', { method: 'POST', body: { name: f.name.trim(), contact: f.contact.trim(), message: '', form, consent: true } });
      setState({ busy: false, ref: d.ref, error: null });
    } catch (x) {
      if (x instanceof ApiError && x.code === 'validation') setErrors(x.fields);
      setState({ busy: false, ref: null, error: x });
    }
  };

  if (state.ref) return (
    <PublicShell><div className="narrow">
      <div className="alert alert-ok" role="status">Enquiry received.</div>
      <h1 style={{ fontSize: '2.2rem' }}>Thank you, {f.name.split(' ')[0]}</h1>
      <p>Your reference is <strong>{state.ref}</strong>. Our events team will reply to {f.contact} with a proposal. We aim to respond within 30 minutes during working hours.</p>
      <div><Link className="btn" to="/">Back to the estate</Link></div>
    </div></PublicShell>
  );

  return (
    <PublicShell>
      <div className="wrap">
        <div className="page-title"><h1 style={{ fontSize: 'clamp(2rem,4.5vw,3.2rem)' }}>Weddings &amp; events</h1><p className="muted" style={{ maxWidth: '55ch' }}>The more you tell us, the better our first reply. Everything except your contact details is optional.</p></div>
        <div className="split" style={{ alignItems: 'start' }}>
          <form className="stack" noValidate onSubmit={submit}>
            {state.error && <div className="alert alert-error" role="alert">{state.error.message}</div>}
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="field-label" style={{ marginBottom: '.4rem' }}>What are you planning?</legend>
              <div className="seg" role="group">{TYPES.map(([v, l]) => <button type="button" key={v} aria-pressed={f.eventType === v} onClick={() => setF({ ...f, eventType: v })}>{l}</button>)}</div>
            </fieldset>
            <div className="row row-2">
              <Field label="Expected guests" error={err('guests')}><input type="number" inputMode="numeric" min="10" max="2000" value={f.guests} onChange={set('guests')} /></Field>
              <Field label="Nights of stay" hint="Optional"><input type="number" inputMode="numeric" min="1" max="10" value={f.nights} onChange={set('nights')} /></Field>
            </div>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="field-label" style={{ marginBottom: '.4rem' }}>When?</legend>
              <div className="seg" role="group"><button type="button" aria-pressed={f.mode === 'flexible'} onClick={() => setF({ ...f, mode: 'flexible' })}>I’m flexible</button><button type="button" aria-pressed={f.mode === 'dates'} onClick={() => setF({ ...f, mode: 'dates' })}>I have dates</button></div>
            </fieldset>
            {f.mode === 'flexible'
              ? <Field label="Preferred month" error={err('month') || err('flexibleMonth')}><input type="month" min={today.slice(0, 7)} value={f.month} onChange={set('month')} /></Field>
              : <div className="row row-2"><Field label="Start" error={err('startDate')}><input type="date" min={today} value={f.startDate} onChange={set('startDate')} /></Field><Field label="End"><input type="date" min={f.startDate || today} value={f.endDate} onChange={set('endDate')} /></Field></div>}
            <div className="row row-2">
              <Field label="Rooms needed" hint="Optional"><input type="number" inputMode="numeric" min="0" max="76" value={f.rooms} onChange={set('rooms')} /></Field>
              <Field label="Budget (₹ lakh)" hint="Optional, a rough figure helps"><input type="number" inputMode="decimal" min="0" step="0.5" value={f.budgetLakh} onChange={set('budgetLakh')} /></Field>
            </div>
            <Field label="Anything else?" hint="Catering, décor, venue preferences, dates you must avoid."><textarea value={f.notes} maxLength={1500} onChange={set('notes')} /></Field>
            <div className="row row-2">
              <Field label="Your name" error={err('name')}><input value={f.name} onChange={set('name')} autoComplete="name" /></Field>
              <Field label="Email or phone" error={err('contact')}><input value={f.contact} onChange={set('contact')} autoComplete="email" /></Field>
            </div>
            <div>
              <label className="check"><input type="checkbox" checked={f.consent} onChange={set('consent')} /><span>I agree that Mistridge Estate may use these details to respond to my enquiry, as described in the privacy notice under the DPDP Act, 2023.</span></label>
              {(errors.consent) && <span className="field-error" role="alert">{errors.consent}</span>}
            </div>
            {Object.keys(errors).length > 0 && <div id="form-errors" className="alert alert-error" role="alert">Please fix before sending: {Object.values(errors).join(' ')}</div>}
            <div><button className="btn" disabled={state.busy}>{state.busy ? <><Spinner /> Sending…</> : 'Send enquiry'}</button></div>
          </form>
          <Photo src="/photos/events.svg" alt="Wedding lawn with a flower-draped arch" ratio="4 / 5" />
        </div>
      </div>
    </PublicShell>
  );
}
