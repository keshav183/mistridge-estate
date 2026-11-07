import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError, qs } from '../api';
import { PublicShell } from '../App';
import { fmtRange, inr, nightsBetween, plural, uuid } from '../format';
import { PriceLines } from '../Price';
import { ErrorState, Field, Photo, Skeleton, Spinner, useFetch } from '../ui';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^\+?[0-9 ()-]{8,16}$/;
const STEPS = ['Your stay', 'Guest details', 'Payment'];

export default function Book() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const slug = sp.get('room');
  const stay = { checkIn: sp.get('checkIn') || '', checkOut: sp.get('checkOut') || '', adults: Number(sp.get('adults')) || 2, children: Number(sp.get('children')) || 0, rooms: Number(sp.get('rooms')) || 1 };
  const [step, setStep] = useState(0);
  const [planCode, setPlanCode] = useState(sp.get('plan') || 'flex');
  const [promoInput, setPromoInput] = useState('');
  const [promo, setPromo] = useState(null); // { code, message }
  const [guest, setGuest] = useState({ name: '', email: '', phone: '' });
  const [special, setSpecial] = useState('');
  const [consent, setConsent] = useState(false);
  const [card, setCard] = useState({ number: '', exp: '', cvc: '' });
  const [errors, setErrors] = useState({});
  const [fatal, setFatal] = useState(null);
  const [paying, setPaying] = useState(false);
  const key = useRef(uuid()); // one idempotency key per checkout: a double-click can never create two bookings

  const avail = useFetch(async (signal) => {
    if (!slug || !stay.checkIn || !stay.checkOut) return null;
    const res = (await api(`/availability?${qs(stay)}`, { signal })).results;
    return res.find((r) => r.roomType.slug === slug) || null;
  }, [slug, stay.checkIn, stay.checkOut, stay.adults, stay.children, stay.rooms]);

  const priced = useFetch(async (signal) => {
    if (!avail.data?.plans?.length) return null;
    return api('/price', { method: 'POST', signal, body: { roomSlug: slug, planCode, checkIn: stay.checkIn, checkOut: stay.checkOut, rooms: stay.rooms, promoCode: promo?.code } });
  }, [avail.data, planCode, promo?.code]);

  useEffect(() => { document.title = 'Reserve · Mistridge Estate'; window.scrollTo(0, 0); }, [step]);
  useEffect(() => { const p = avail.data?.plans; if (p?.length && !p.some((x) => x.code === planCode)) setPlanCode(p[0].code); }, [avail.data, planCode]);

  const quote = priced.data?.quote;
  const room = avail.data?.roomType;

  if (!slug || !stay.checkIn || !stay.checkOut) return <PublicShell><div className="narrow"><h1>Choose your stay first</h1><p className="muted">Pick a room and dates, then come back to reserve.</p><Link className="btn" to="/">See rooms</Link></div></PublicShell>;

  const applyPromo = async () => {
    const code = promoInput.trim().toUpperCase();
    if (!code) return;
    try {
      const d = await api('/price', { method: 'POST', body: { roomSlug: slug, planCode, checkIn: stay.checkIn, checkOut: stay.checkOut, rooms: stay.rooms, promoCode: code } });
      setPromo(d.promoApplied ? { code } : null);
      setErrors((e) => ({ ...e, promo: d.promoApplied ? undefined : d.promoMessage }));
    } catch (e) { setErrors((x) => ({ ...x, promo: e.message })); }
  };

  const validateGuest = () => {
    const e = {};
    if (guest.name.trim().length < 2) e.name = 'Enter the name of the lead guest.';
    if (!EMAIL.test(guest.email.trim())) e.email = 'Enter a valid email address.';
    if (!PHONE.test(guest.phone.trim())) e.phone = 'Enter a phone number with 8–16 digits.';
    if (!consent) e.consent = 'Please accept the privacy notice to continue.';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const pay = async (ev) => {
    ev.preventDefault();
    const e = {};
    const digits = card.number.replace(/\D/g, '');
    const m = card.exp.match(/^(\d{1,2})\s*\/\s*(\d{2}|\d{4})$/);
    if (digits.length < 12) e.number = 'Enter the card number.';
    if (!m) e.exp = 'Use MM/YY.';
    if (!/^\d{3,4}$/.test(card.cvc)) e.cvc = '3 or 4 digits.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setPaying(true); setFatal(null);
    try {
      const { booking } = await api('/bookings', {
        method: 'POST', headers: { 'Idempotency-Key': key.current },
        body: {
          roomSlug: slug, planCode, ...stay, promoCode: promo?.code, guest: { name: guest.name.trim(), email: guest.email.trim(), phone: guest.phone.trim() },
          specialRequests: special.trim() || undefined, consent: true,
          payment: { number: digits, expMonth: Number(m[1]), expYear: Number(m[2]), cvc: card.cvc },
        },
      });
      nav('/booking', { state: { booking, isNew: true }, replace: true });
    } catch (err) {
      setPaying(false);
      if (err instanceof ApiError && err.code === 'validation') { setErrors(err.fields); setFatal({ message: 'Some details need a second look.' }); }
      else if (err.code === 'payment_failed') setErrors({ number: err.message });
      else setFatal(err);
    }
  };

  const fmtCard = (v) => v.replace(/\D/g, '').slice(0, 19).replace(/(.{4})/g, '$1 ').trim();
  const fmtExp = (v) => { const d = v.replace(/\D/g, '').slice(0, 4); return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d; };

  return (
    <PublicShell>
      <div className="wrap">
        <ol className="steps" aria-label="Booking steps" style={{ padding: 0 }}>
          {STEPS.map((s, i) => <li key={s} className={i === step ? 'on' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}><b>{i < step ? '✓' : i + 1}</b>{s}</li>)}
        </ol>

        {avail.error && <ErrorState error={avail.error} onRetry={avail.reload} />}
        {avail.data === null && !avail.loading && !avail.error && <div className="alert alert-warn">That room is no longer available for these dates. <Link to={`/rooms/${slug}`}>Choose other dates</Link></div>}
        {avail.data && !avail.data.plans.length && <div className="alert alert-warn">Sorry, this room just sold out for your dates. <Link to={`/rooms/${slug}?${qs(stay)}`}>Choose other dates or a different room</Link></div>}

        {avail.data?.plans.length > 0 && (
          <div className="flow">
            <div className="stack">
              {fatal && <div className="alert alert-error" role="alert">{fatal.message} {fatal.code === 'sold_out' && <Link to={`/rooms/${slug}`}>Choose different dates</Link>}</div>}

              {step === 0 && (
                <section className="stack">
                  <h2>Your stay</h2>
                  <div className="stack" style={{ gap: '.6rem' }} role="radiogroup" aria-label="Rate plan">
                    {avail.data.plans.map((p) => (
                      <label key={p.code} className={`plan ${p.code === planCode ? 'sel' : ''}`}>
                        <input type="radio" name="plan" checked={p.code === planCode} onChange={() => setPlanCode(p.code)} />
                        <span><strong>{p.name}</strong><span className="muted small">{p.description}</span></span>
                        <span className="amt">{inr(p.quote.total)}</span>
                      </label>
                    ))}
                  </div>
                  <div className="row" style={{ gridTemplateColumns: '1fr auto', alignItems: 'end' }}>
                    <Field label="Promo code" error={errors.promo} hint={promo ? `Applied: ${promo.code}` : 'Optional'}>
                      <input value={promoInput} onChange={(e) => setPromoInput(e.target.value)} autoCapitalize="characters" placeholder="e.g. DIRECT10" maxLength={20} />
                    </Field>
                    <button type="button" className="btn btn-quiet" onClick={applyPromo} disabled={!promoInput.trim()}>Apply</button>
                  </div>
                  <div><button className="btn" onClick={() => setStep(1)} disabled={priced.loading || !quote}>Continue to guest details</button></div>
                </section>
              )}

              {step === 1 && (
                <form className="stack" noValidate onSubmit={(e) => { e.preventDefault(); if (validateGuest()) setStep(2); }}>
                  <h2>Guest details</h2>
                  <Field label="Full name" error={errors['guest.name'] || errors.name}><input value={guest.name} onChange={(e) => setGuest({ ...guest, name: e.target.value })} autoComplete="name" /></Field>
                  <div className="row row-2">
                    <Field label="Email" error={errors['guest.email'] || errors.email} hint="Your confirmation is shown here and on this email."><input type="email" value={guest.email} onChange={(e) => setGuest({ ...guest, email: e.target.value })} autoComplete="email" /></Field>
                    <Field label="Phone" error={errors['guest.phone'] || errors.phone}><input type="tel" value={guest.phone} onChange={(e) => setGuest({ ...guest, phone: e.target.value })} autoComplete="tel" /></Field>
                  </div>
                  <Field label="Special requests" hint="Optional. We pass these to the front desk; we cannot guarantee them."><textarea value={special} maxLength={500} onChange={(e) => setSpecial(e.target.value)} /></Field>
                  <p className="muted small">Passport details for foreign guests (Form C) are taken at check-in, not online. Please do not enter them here.</p>
                  <div>
                    <label className="check"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                      <span>I agree that Mistridge Estate may use these details to manage my booking, as described in the privacy notice under the DPDP Act, 2023.</span></label>
                    {(errors.consent || errors['consent']) && <span className="field-error" role="alert">{errors.consent || errors['consent']}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: '.8rem' }}><button type="button" className="btn btn-quiet" onClick={() => setStep(0)}>Back</button><button className="btn" type="submit">Continue to payment</button></div>
                </form>
              )}

              {step === 2 && (
                <form className="stack" noValidate onSubmit={pay}>
                  <h2>Payment</h2>
                  <div className="alert alert-warn"><strong>Test mode.</strong> No real money moves. Use card 4242 4242 4242 4242, any future expiry, any 3 digits. Card 4000 0000 0000 0002 shows a decline.</div>
                  <Field label="Card number" error={errors.number || errors['payment.number']}><input inputMode="numeric" autoComplete="cc-number" value={card.number} onChange={(e) => setCard({ ...card, number: fmtCard(e.target.value) })} placeholder="4242 4242 4242 4242" /></Field>
                  <div className="row row-2">
                    <Field label="Expiry" error={errors.exp}><input inputMode="numeric" autoComplete="cc-exp" placeholder="MM/YY" value={card.exp} onChange={(e) => setCard({ ...card, exp: fmtExp(e.target.value) })} /></Field>
                    <Field label="Security code" error={errors.cvc || errors['payment.cvc']}><input inputMode="numeric" autoComplete="cc-csc" maxLength={4} value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value.replace(/\D/g, '') })} /></Field>
                  </div>
                  <div style={{ display: 'flex', gap: '.8rem', alignItems: 'center' }}>
                    <button type="button" className="btn btn-quiet" onClick={() => setStep(1)} disabled={paying}>Back</button>
                    <button className="btn" type="submit" disabled={paying || !quote}>{paying ? <><Spinner label="Processing payment" /> Confirming…</> : `Pay ${inr(quote?.total)}`}</button>
                  </div>
                </form>
              )}
            </div>

            <aside className="panel sticky" aria-label="Booking summary">
              <div className="mini"><Photo src={room.photos[0].url} alt="" ratio="1 / 1" /><div><strong>{room.name}</strong><p className="muted small">{fmtRange(stay.checkIn, stay.checkOut)}<br />{plural(nightsBetween(stay.checkIn, stay.checkOut), 'night')} · {plural(stay.adults, 'adult')}{stay.children ? `, ${plural(stay.children, 'child')}` : ''}</p></div></div>
              {priced.loading && !quote ? <Skeleton h={110} r={8} /> : quote && <PriceLines quote={quote} promoCode={promo?.code} />}
              {priced.error && <ErrorState error={priced.error} onRetry={priced.reload} />}
              <p className="muted small">{avail.data.plans.find((p) => p.code === planCode)?.cancellation}. GST is charged at the rate for each night’s tariff.</p>
            </aside>
          </div>
        )}
        {avail.loading && <Skeleton h={300} r={8} />}
      </div>
    </PublicShell>
  );
}
