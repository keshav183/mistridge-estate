import { useState } from 'react';
import { api } from '../api';
import { fmtDate, inr } from '../format';
import { Empty, ErrorState, Field, Skeleton, Spinner, useFetch, useToast } from '../ui';

const blank = { code: '', type: 'percent', value: '', maxDiscount: '', minNights: '', validTo: '', maxUses: '', description: '' };

export default function Promos() {
  const toast = useToast();
  const list = useFetch((signal) => api('/admin/promos', { signal }), []);
  const [f, setF] = useState(blank);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const num = (v) => (v === '' ? undefined : Number(v));

  const create = async (e) => {
    e.preventDefault(); setErr(null); setBusy(true);
    try {
      await api('/admin/promos', { method: 'POST', body: { code: f.code, type: f.type, value: Number(f.value), maxDiscount: num(f.maxDiscount), minNights: num(f.minNights), maxUses: num(f.maxUses), validTo: f.validTo || undefined, description: f.description || undefined } });
      toast(`Code ${f.code.toUpperCase()} created.`); setF(blank); list.reload();
    } catch (x) { setErr(x); } finally { setBusy(false); }
  };
  const toggle = async (p) => { try { await api(`/admin/promos/${p._id}`, { method: 'PATCH', body: { active: !p.active } }); toast(`${p.code} ${p.active ? 'paused' : 'activated'}.`); list.reload(); } catch (x) { toast(x.message, 'error'); } };

  return (
    <div className="stack" style={{ gap: '1.2rem' }}>
      <div><h1 style={{ fontSize: '2rem' }}>Promo codes</h1><p className="muted small">Discounts apply before GST, so the tax slab follows what the guest actually pays per night.</p></div>
      <form className="panel" onSubmit={create} noValidate style={{ maxWidth: 820 }}>
        <h3>New code</h3>
        {err && <div className="alert alert-error" role="alert">{err.message} {Object.values(err.fields || {}).join(' ')}</div>}
        <div className="row row-3">
          <Field label="Code"><input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} maxLength={20} /></Field>
          <Field label="Type"><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="percent">Percent off</option><option value="flat">Flat ₹ off</option></select></Field>
          <Field label={f.type === 'percent' ? 'Percent (1–90)' : 'Amount (₹)'}><input type="number" inputMode="numeric" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /></Field>
        </div>
        <div className="row row-3">
          <Field label="Max discount (₹)" hint="Optional"><input type="number" value={f.maxDiscount} onChange={(e) => setF({ ...f, maxDiscount: e.target.value })} /></Field>
          <Field label="Minimum nights" hint="Optional"><input type="number" value={f.minNights} onChange={(e) => setF({ ...f, minNights: e.target.value })} /></Field>
          <Field label="Total uses" hint="Optional"><input type="number" value={f.maxUses} onChange={(e) => setF({ ...f, maxUses: e.target.value })} /></Field>
        </div>
        <div className="row row-2"><Field label="Valid until" hint="Optional"><input type="date" value={f.validTo} onChange={(e) => setF({ ...f, validTo: e.target.value })} /></Field><Field label="Note for staff" hint="Optional"><input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={120} /></Field></div>
        <div><button className="btn" disabled={busy || !f.code || !f.value}>{busy ? <Spinner /> : 'Create code'}</button></div>
      </form>
      {list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : list.loading && !list.data ? <Skeleton h={160} r={8} /> : !list.data.promos.length ? <Empty title="No promo codes yet">Create one above.</Empty> : (
        <div className="tablewrap"><table>
          <thead><tr><th>Code</th><th>Offer</th><th>Rules</th><th>Used</th><th>Status</th><th /></tr></thead>
          <tbody>{list.data.promos.map((p) => {
            const expired = p.validTo && p.validTo < new Date().toISOString().slice(0, 10);
            return (<tr key={p._id}><td><strong>{p.code}</strong><br /><span className="muted small">{p.description}</span></td>
              <td>{p.type === 'percent' ? `${p.value}% off${p.maxDiscount ? `, up to ${inr(p.maxDiscount)}` : ''}` : `${inr(p.value)} off`}</td>
              <td className="small">{[p.minNights && `${p.minNights}+ nights`, p.validTo && `until ${fmtDate(p.validTo, { day: 'numeric', month: 'short', year: 'numeric' })}`].filter(Boolean).join(' · ') || '—'}</td>
              <td>{p.used}{p.maxUses ? ` / ${p.maxUses}` : ''}</td>
              <td>{expired ? <span className="badge badge-grey">Expired</span> : <span className={`badge ${p.active ? 'badge-ok' : 'badge-grey'}`}>{p.active ? 'Active' : 'Paused'}</span>}</td>
              <td><button className="btn btn-quiet btn-sm" onClick={() => toggle(p)}>{p.active ? 'Pause' : 'Activate'}</button></td></tr>);
          })}</tbody>
        </table></div>
      )}
    </div>
  );
}
