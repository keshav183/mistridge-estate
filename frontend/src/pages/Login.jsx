import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PublicShell } from '../App';
import { useAuth, STAFF } from '../auth';
import { Field, Spinner } from '../ui';

const DEMO = [['General Manager', 'gm@mistridge.test'], ['Reservations', 'reservations@mistridge.test'], ['Sales', 'sales@mistridge.test'], ['Guest', 'guest@mistridge.test']];

export default function Login() {
  const { login, register } = useAuth();
  const nav = useNavigate();
  const from = useLocation().state?.from;
  const [mode, setMode] = useState('in');
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault(); setErr(null); setBusy(true);
    try {
      const u = mode === 'in' ? await login(f.email.trim(), f.password) : await register(f.name.trim(), f.email.trim(), f.password);
      nav(STAFF.includes(u.role) ? (from?.startsWith('/admin') ? from : '/admin/inbox') : '/account', { replace: true });
    } catch (x) { setErr(x); setBusy(false); }
  };

  return (
    <PublicShell>
      <form className="narrow" onSubmit={submit} noValidate>
        <h1 style={{ fontSize: '2.2rem' }}>{mode === 'in' ? 'Sign in' : 'Create an account'}</h1>
        <p className="muted">{mode === 'in' ? 'Guests see their stays. Staff go straight to the desk.' : 'An account lets you see your bookings in one place. You can also book without one.'}</p>
        {err && <div className="alert alert-error" role="alert">{err.message}{err.fields?.password ? ` ${err.fields.password}` : ''}</div>}
        {mode === 'up' && <Field label="Full name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" /></Field>}
        <Field label="Email"><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" /></Field>
        <Field label="Password" hint={mode === 'up' ? 'At least 8 characters.' : undefined}><input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} /></Field>
        <button className="btn" disabled={busy || !f.email || !f.password}>{busy ? <Spinner /> : mode === 'in' ? 'Sign in' : 'Create account'}</button>
        <button type="button" className="btn btn-quiet" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setErr(null); }}>{mode === 'in' ? 'New here? Create an account' : 'Have an account? Sign in'}</button>
        <details className="alert alert-warn">
          <summary>Reviewer demo accounts</summary>
          <p className="small" style={{ margin: '.6rem 0' }}>Seeded sample users. Password is shown in deployment.md.</p>
          <div className="chips">{DEMO.map(([l, e]) => <button type="button" key={e} className="tab" onClick={() => { setMode('in'); setF({ ...f, email: e }); }}>{l}</button>)}</div>
        </details>
      </form>
    </PublicShell>
  );
}
