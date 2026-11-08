import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PublicShell } from '../App';
import { useAuth } from '../auth';
import { Field, Spinner } from '../ui';

const DEMO = [['General Manager', 'gm@mistridge.test'], ['Reservations', 'reservations@mistridge.test'], ['Sales', 'sales@mistridge.test']];

// Staff sign-in. Guests never need an account: they book with an email and look the booking up with its reference.
export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const from = useLocation().state?.from;
  const [f, setF] = useState({ email: '', password: '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault(); setErr(null); setBusy(true);
    try { await login(f.email.trim(), f.password); nav(from?.startsWith('/admin') ? from : '/admin/inbox', { replace: true }); }
    catch (x) { setErr(x); setBusy(false); }
  };

  return (
    <PublicShell>
      <form className="narrow" onSubmit={submit} noValidate>
        <h1 style={{ fontSize: '2.2rem' }}>Staff sign in</h1>
        <p className="muted">Reservations, sales and the General Manager.</p>
        {err && <div className="alert alert-error" role="alert">{err.message}</div>}
        <Field label="Email"><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" /></Field>
        <Field label="Password"><input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="current-password" /></Field>
        <button className="btn" disabled={busy || !f.email || !f.password}>{busy ? <Spinner /> : 'Sign in'}</button>
        <details className="alert">
          <summary>Reviewer demo accounts</summary>
          <p className="small" style={{ margin: '.6rem 0' }}>Seeded sample users; the password is in deployment.md.</p>
          <div className="chips">{DEMO.map(([l, e]) => <button type="button" key={e} className="tab" onClick={() => setF({ ...f, email: e })}>{l}</button>)}</div>
        </details>
      </form>
    </PublicShell>
  );
}
