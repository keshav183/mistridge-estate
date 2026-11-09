import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { PublicShell } from '../App';
import { Field, Spinner } from '../ui';

// A plain-language enquiry. The message is read by the AI router (Gemini, with a rules fallback):
// it is classified, its details extracted, an owner assigned and a reply drafted for staff to approve.
export default function Enquiry() {
  const [f, setF] = useState({ name: '', contact: '', message: '', consent: false });
  const [errors, setErrors] = useState({});
  const [state, setState] = useState({ busy: false, ref: null, error: null });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const submit = async (ev) => {
    ev.preventDefault();
    const e = {};
    if (f.name.trim().length < 2) e.name = 'Enter your name.';
    if (f.contact.trim().length < 5) e.contact = 'Enter an email address or phone number.';
    if (f.message.trim().length < 10) e.message = 'Tell us a little more (at least a sentence).';
    if (!f.consent) e.consent = 'Please tick the privacy notice box to continue.';
    setErrors(e);
    if (Object.keys(e).length) { setTimeout(() => document.getElementById('form-errors')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 0); return; }
    setState({ busy: true, ref: null, error: null });
    try {
      const d = await api('/enquiries/web', { method: 'POST', body: { name: f.name.trim(), contact: f.contact.trim(), message: f.message.trim(), consent: true } });
      setState({ busy: false, ref: d.ref, error: null });
    } catch (x) {
      if (x instanceof ApiError && x.code === 'validation') setErrors(x.fields);
      setState({ busy: false, ref: null, error: x });
    }
  };

  if (state.ref) return (
    <PublicShell><div className="narrow">
      <div className="alert alert-ok" role="status">Enquiry received.</div>
      <h1 style={{ fontSize: '2.2rem' }}>Thank you, {f.name.trim().split(' ')[0]}</h1>
      <p>Your reference is <strong>{state.ref}</strong>. It has gone straight to the right person on our team, who will reply to {f.contact}. We aim to respond within 30 minutes during working hours.</p>
      <div><Link className="btn" to="/">Back to the estate</Link></div>
    </div></PublicShell>
  );

  return (
    <PublicShell>
      <form className="narrow" noValidate onSubmit={submit}>
        <h1 style={{ fontSize: 'clamp(2rem,4.5vw,3rem)' }}>Send us an enquiry</h1>
        <p className="muted">Rooms, villas, weddings, offsites or feedback: write it in your own words, with dates and guest numbers if you have them. We route it to the right person.</p>
        {state.error && <div className="alert alert-error" role="alert">{state.error.message}</div>}
        <Field label="Your message" error={errors.message}><textarea style={{ minHeight: 150 }} value={f.message} maxLength={2000} onChange={set('message')} placeholder="e.g. Is a villa free 14-16 Nov for 2 adults and a child?" /></Field>
        <div className="row row-2">
          <Field label="Your name" error={errors.name}><input value={f.name} onChange={set('name')} autoComplete="name" /></Field>
          <Field label="Email or phone" error={errors.contact}><input value={f.contact} onChange={set('contact')} autoComplete="email" /></Field>
        </div>
        <label className="check"><input type="checkbox" checked={f.consent} onChange={set('consent')} /><span>I agree that Mistridge Estate may use these details to respond to my enquiry, as described in the privacy notice under the DPDP Act, 2023.</span></label>
        {Object.keys(errors).length > 0 && <div id="form-errors" className="alert alert-error" role="alert">Please fix before sending: {Object.values(errors).join(' ')}</div>}
        <div><button className="btn" disabled={state.busy}>{state.busy ? <><Spinner /> Sending…</> : 'Send enquiry'}</button></div>
        <p className="muted small">Planning a wedding or offsite? The <Link to="/events">events form</Link> lets you share more detail.</p>
      </form>
    </PublicShell>
  );
}
