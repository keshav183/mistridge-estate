import { Fragment, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { ago, fmtTime, inr } from '../format';
import { Empty, ErrorState, Field, Skeleton, Spinner, useFetch, useToast } from '../ui';

const LANES = [['unsorted', 'Unsorted'], ['room', 'Room'], ['wedding', 'Wedding'], ['offsite', 'Offsite'], ['complaint', 'Complaint']];
const LANE_NAME = Object.fromEntries(LANES);
const CHANNEL = { web: 'Website', event_form: 'Event form', email: 'Email', whatsapp: 'WhatsApp' };
const WARN = {
  low_confidence: 'The AI was not sure about this one. Please check the category.',
  llm_rules_disagree: 'Two independent checks disagreed on the category, so this was held back for review.',
  llm_unavailable: 'The AI model was unavailable; the built-in rules read this message.',
  ai_draft_had_price_discarded: 'The AI draft contained prices, so it was replaced with a safe template. Prices come only from the rate table.',
};
const SAMPLES = [
  ['whatsapp', '+91 98450 12345', "Venue for my sister's wedding in Feb 2027, about 250 guests, 2 nights"],
  ['whatsapp', '+91 98860 54321', 'Is a villa free 14-16 Nov for 2 adults and a child?'],
  ['email', 'events@acme-corp.example', 'Team of 45 wants a January offsite with a conference hall'],
  ['whatsapp', '+91 90000 99887', 'AC did not work for two nights and nobody responded. Very disappointed, want a refund.'],
];
const FIELDS = [['guests', 'Guests'], ['adults', 'Adults'], ['children', 'Children'], ['nights', 'Nights'], ['checkIn', 'Check-in'], ['checkOut', 'Check-out'], ['monthHint', 'Month'], ['budgetInr', 'Budget']];

function Simulate({ onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ channel: 'whatsapp', from: '', message: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const send = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { const r = await api('/enquiries/ingest', { method: 'POST', body: f }); toast(`${r.ref} routed to ${LANE_NAME[r.lane]}.`); setF({ ...f, message: '' }); onDone(); }
    catch (x) { setErr(x); } finally { setBusy(false); }
  };
  return (
    <form className="panel" onSubmit={send} noValidate>
      <h3>Simulate an inbound message</h3>
      <p className="muted small">In production the email forwarder and WhatsApp webhook call this same endpoint. Try a sample:</p>
      <div className="chips">{SAMPLES.map(([c, fr, m]) => <button type="button" key={m} className="tab" onClick={() => setF({ channel: c, from: fr, message: m })}>{m.slice(0, 34)}…</button>)}</div>
      {err && <div className="alert alert-error" role="alert">{err.message}</div>}
      <div className="row row-2"><Field label="Channel"><select value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })}><option value="whatsapp">WhatsApp</option><option value="email">Forwarded email</option></select></Field><Field label="From"><input value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field></div>
      <Field label="Message"><textarea value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} /></Field>
      <div><button className="btn" disabled={busy || f.message.trim().length < 5 || f.from.trim().length < 2}>{busy ? <Spinner /> : 'Route message'}</button></div>
    </form>
  );
}

function Detail({ id, staff, onChanged, onBack }) {
  const toast = useToast();
  const q = useFetch((signal) => api(`/enquiries/${id}`, { signal }).then((d) => d.enquiry), [id]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const e = q.data;
  useEffect(() => { if (e) setDraft(e.ai?.draft || ''); }, [e?.id, e?.ai?.draft]);

  const patch = async (body, msg) => { setBusy(true); try { await api(`/enquiries/${id}`, { method: 'PATCH', body }); toast(msg); q.reload(); onChanged(); } catch (x) { toast(x.message, 'error'); } finally { setBusy(false); } };
  const send = async () => { setBusy(true); try { await api(`/enquiries/${id}/reply`, { method: 'POST', body: { body: draft } }); toast('Reply sent (simulated, nothing was delivered).'); q.reload(); onChanged(); } catch (x) { toast(x.message, 'error'); } finally { setBusy(false); } };

  if (q.loading && !e) return <div className="detail"><Skeleton h={24} w="50%" /><Skeleton h={90} /><Skeleton h={160} /></div>;
  if (q.error) return <div className="detail"><ErrorState error={q.error} onRetry={q.reload} /></div>;
  const ai = e.ai || {};
  const conf = Math.round((ai.confidence || 0) * 100);
  const ex = ai.extracted || {};

  return (
    <div className="detail">
      <button className="btn btn-quiet btn-sm" style={{ justifySelf: 'start' }} onClick={onBack} id="back-btn">← All enquiries</button>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div><h2 style={{ fontSize: '1.6rem' }}>{e.ref} · {e.name}</h2><p className="muted small">{CHANNEL[e.channel]} · {e.contact} · {fmtTime(e.createdAt)}</p></div>
        <div className="chips">{e.status === 'replied' && <span className="badge badge-ok">Replied</span>}{e.gmAlert && <span className="badge badge-red">GM alerted</span>}</div>
      </div>
      {e.lane === 'complaint' || e.gmAlert ? <div className="alert alert-error">This looks like a complaint. The General Manager has been alerted and should call the guest.</div> : null}
      <p className="quote">{e.message}</p>

      <section className="ai" aria-label="AI reading">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <strong>AI reading: {ai.category ? LANE_NAME[ai.category] || ai.category : 'Unclear'}</strong>
          <span className="muted small">{conf}% confident · {ai.source === 'llm' ? 'Claude, cross-checked' : 'built-in rules'}</span>
        </div>
        <div className={`bar ${conf < 60 ? 'low' : ''}`} role="img" aria-label={`${conf}% confidence`}><i style={{ width: `${conf}%` }} /></div>
        {ai.summary && <p className="small">{ai.summary}</p>}
        {(ai.warnings || []).filter((w) => WARN[w]).map((w) => <div key={w} className="alert alert-warn small">{WARN[w]}</div>)}
        <dl className="kv" style={{ gridTemplateColumns: '7rem 1fr' }}>
          {FIELDS.filter(([k]) => ex[k] !== null && ex[k] !== undefined).map(([k, l]) => <Fragment key={k}><dt>{l}</dt><dd>{k === 'budgetInr' ? inr(ex[k]) : ex[k]}</dd></Fragment>)}
          {!FIELDS.some(([k]) => ex[k] !== null && ex[k] !== undefined) && <><dt>Details</dt><dd className="muted">Nothing could be extracted.</dd></>}
        </dl>
      </section>

      <section className="stack" style={{ gap: '.8rem' }} aria-label="Routing">
        <div className="field"><span className="field-label">Lane <span className="muted">(one click to re-route)</span></span>
          <div className="seg" role="group" aria-label="Lane">{LANES.map(([k, l]) => <button key={k} type="button" aria-pressed={e.lane === k} disabled={busy} onClick={() => e.lane !== k && patch({ lane: k }, `Moved to ${l}.`)}>{l}</button>)}</div></div>
        <Field label="Owner"><select value={e.owner?.id || ''} disabled={busy} onChange={(ev) => ev.target.value && patch({ ownerId: ev.target.value }, 'Owner changed.')}>
          {!e.owner && <option value="">Unassigned</option>}
          {staff.map((s) => <option key={s._id} value={s._id}>{s.name} ({s.role})</option>)}</select></Field>
      </section>

      <section className="stack" style={{ gap: '.6rem' }} aria-label="Reply">
        <Field label="Reply draft" hint="Drafts are never sent automatically. Read, edit, then send. Prices come from the rate table, not from the AI."><textarea style={{ minHeight: 240 }} value={draft} onChange={(ev) => setDraft(ev.target.value)} /></Field>
        <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
          <button className="btn" onClick={send} disabled={busy || draft.trim().length < 5}>{busy ? <Spinner /> : 'Send reply'}</button>
          <button className="btn btn-quiet" onClick={() => setDraft(ai.draft || '')} disabled={draft === ai.draft}>Reset draft</button>
          {e.status !== 'closed' && <button className="btn btn-quiet" onClick={() => patch({ status: 'closed' }, 'Closed.')} disabled={busy}>Close enquiry</button>}
        </div>
        <p className="muted small">Replies are simulated in this build: they are saved to the enquiry, not delivered by email or WhatsApp.</p>
      </section>

      {e.replies?.length > 0 && <section><h4 style={{ fontFamily: 'var(--sans)', fontWeight: 600, fontSize: '.95rem', marginBottom: '.4rem' }}>Sent</h4>{e.replies.map((r, i) => <div key={i} className="quote small" style={{ marginBottom: '.6rem' }}><span className="muted">{fmtTime(r.sentAt)} (simulated)</span><br />{r.body}</div>)}</section>}
      <section><h4 style={{ fontFamily: 'var(--sans)', fontWeight: 600, fontSize: '.95rem', marginBottom: '.4rem' }}>History</h4>
        <ul className="timeline">{[...e.history].reverse().map((h, i) => <li key={i}>{fmtTime(h.at)} · {h.by} · {h.note || h.action}</li>)}</ul></section>
    </div>
  );
}

export default function Inbox() {
  const { user } = useAuth();
  const loc = useLocation();
  const [lane, setLane] = useState('unsorted');
  const [sel, setSel] = useState(loc.state?.open || null);
  const [sim, setSim] = useState(false);
  const list = useFetch((signal) => api('/enquiries', { signal }), []);
  const staffQ = useFetch((signal) => api('/enquiries/staff', { signal }).then((d) => d.staff), []);

  useEffect(() => { const t = setInterval(list.reload, 30_000); return () => clearInterval(t); }, []); // eslint-disable-line
  const all = list.data?.enquiries || [];
  const counts = Object.fromEntries(LANES.map(([k]) => [k, all.filter((e) => e.lane === k && e.status === 'new').length]));
  const shown = all.filter((e) => e.lane === lane);
  const stats = list.data?.stats;

  return (
    <div className="stack" style={{ gap: '1.2rem' }}>
      <div className="topbar" style={{ marginBottom: 0 }}>
        <div><h1 style={{ fontSize: '2rem' }}>Enquiry inbox</h1><p className="muted small">Web form, event form, forwarded email and WhatsApp land here, already read and routed.</p></div>
        <button className="btn btn-quiet" onClick={() => setSim((s) => !s)}>{sim ? 'Close simulator' : 'Simulate inbound message'}</button>
      </div>
      {sim && <Simulate onDone={list.reload} />}
      <div className="stats">
        <div className="stat"><b>{stats?.open ?? '–'}</b><span>Open enquiries</span></div>
        <div className="stat"><b style={{ color: stats?.unsorted ? 'var(--amber)' : undefined }}>{stats?.unsorted ?? '–'}</b><span>Unsorted, needs a human</span></div>
        <div className="stat"><b>{stats?.medianFirstReplyMinutes ?? '–'}{stats?.medianFirstReplyMinutes != null && <small style={{ fontSize: '1rem' }}> min</small>}</b><span>Median first reply (target under 30)</span></div>
      </div>
      <div className="tabs" role="tablist" aria-label="Lanes">
        {LANES.map(([k, l]) => <button key={k} role="tab" className={`tab ${k === 'unsorted' && counts.unsorted ? 'unsorted' : ''}`} aria-selected={lane === k} onClick={() => { setLane(k); setSel(null); }}>{l}<span className="n">{counts[k]}</span></button>)}
      </div>
      {list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : (
        <div className={`inbox ${sel ? 'has-sel' : ''}`}>
          <div className="list">
            {list.loading && !list.data && [0, 1, 2].map((i) => <Skeleton key={i} h={86} r={8} />)}
            {list.data && !shown.length && <Empty title={lane === 'unsorted' ? 'Nothing unsorted' : 'No enquiries here'}>{lane === 'unsorted' ? 'Enquiries the AI is unsure about will wait here for a person.' : 'New enquiries in this lane appear automatically.'}</Empty>}
            {shown.map((e) => (
              <button key={e.id} className="item" aria-current={sel === e.id} onClick={() => setSel(e.id)}>
                <div className="top"><span>{e.ref} · {CHANNEL[e.channel]}</span><span>{ago(e.createdAt)}</span></div>
                <div className="pv">{e.preview}</div>
                <div className="meta">
                  <strong>{e.name}</strong>
                  {e.gmAlert && <span className="badge badge-red">GM alerted</span>}
                  {e.status === 'replied' && <span className="badge badge-ok">Replied</span>}
                  {e.lane === 'unsorted' && <span className="badge">{Math.round((e.confidence || 0) * 100)}% sure</span>}
                  <span className="muted">→ {e.owner?.name || 'Unassigned'}</span>
                </div>
              </button>
            ))}
          </div>
          {sel ? <Detail key={sel} id={sel} staff={staffQ.data || []} onChanged={list.reload} onBack={() => setSel(null)} /> : <div className="detail muted" style={{ display: 'grid', placeItems: 'center', minHeight: 240 }}>Select an enquiry to read it.</div>}
        </div>
      )}
      <p className="muted small">Signed in as {user.name}. Unsorted enquiries are owned by the General Manager until re-routed.</p>
    </div>
  );
}
