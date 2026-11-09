import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, qs } from '../api';
import { PublicShell } from '../App';
import { coverOf, fmtRange, inr, nightsBetween, plural } from '../format';
import RangeCalendar from '../RangeCalendar';
import { ErrorState, Field, Lightbox, Photo, Skeleton, useFetch } from '../ui';
import { stayParams } from './Home';

export default function Room() {
  const { slug } = useParams();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const stay = stayParams(sp);
  const [photo, setPhoto] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [plan, setPlan] = useState('flex');
  const hasDates = Boolean(stay.checkIn && stay.checkOut);

  const room = useFetch((signal) => api(`/rooms/${slug}`, { signal }).then((d) => d.room), [slug]);
  const cal = useFetch((signal) => api(`/availability/calendar?room=${slug}`, { signal }).then((d) => Object.fromEntries(d.days.map((x) => [x.date, x]))), [slug]);
  const quote = useFetch(async (signal) => {
    if (!hasDates) return null;
    const res = (await api(`/availability?${qs(stay)}`, { signal })).results;
    return res.find((r) => r.roomType.slug === slug) || null;
  }, [slug, stay.checkIn, stay.checkOut, stay.adults, stay.children, stay.rooms]);

  useEffect(() => { if (room.data) document.title = `${room.data.name} · Mistridge Estate`; }, [room.data]);
  const set = (patch) => setSp(new URLSearchParams(qs({ ...stay, ...patch })), { replace: true });
  const plans = quote.data?.plans || [];
  useEffect(() => { if (plans.length && !plans.some((p) => p.code === plan)) setPlan(plans[0].code); }, [plans, plan]);
  const chosen = plans.find((p) => p.code === plan);

  if (room.error) return <PublicShell><div className="wrap" style={{ paddingTop: '3rem' }}><ErrorState error={room.error} onRetry={room.reload} /></div></PublicShell>;
  const r = room.data;
  const gallery = r ? (r.photos?.length ? r.photos : [{ url: coverOf(r), alt: r.name }]) : [];

  return (
    <PublicShell>
      <div className="wrap">
        <div className="crumb"><Link to="/">Rooms &amp; villas</Link> / {r?.name || '…'}</div>
        <div className="room-layout">
          <div className="stack">
            {!r ? <Skeleton h={420} r={8} /> : (
              <>
                <div className="gallery">
                  <button type="button" className="zoomable" onClick={() => setZoom(true)} aria-label="Enlarge photo"><Photo src={gallery[photo].url} alt={gallery[photo].alt} ratio="16 / 10" eager /></button>
                  <div className="thumbs">{gallery.length > 1 && gallery.map((p, i) => <button key={p.url} className="thumb" aria-current={i === photo} aria-label={`Show photo ${i + 1}`} onClick={() => setPhoto(i)}><Photo src={p.url} alt="" ratio="3 / 2" /></button>)}</div>
                </div>
                <div className="stack" style={{ gap: '1rem' }}>
                  <h1 style={{ fontSize: 'clamp(2rem,4vw,2.8rem)' }}>{r.name}</h1>
                  <p className="muted">{r.tagline}</p>
                  <div className="facts"><span>{r.sizeSqft} sq ft</span><span>{r.bed}</span><span>Up to {r.maxAdults} adults, {r.maxGuests} guests</span></div>
                  <p style={{ maxWidth: '62ch' }}>{r.description}</p>
                  <ul className="amenities">{r.amenities.map((a) => <li key={a}>{a}</li>)}</ul>
                </div>
              </>
            )}
          </div>

          <aside className="panel sticky" aria-label="Dates and prices">
            <div>
              <h3 style={{ marginBottom: '.2rem' }}>Choose your dates</h3>
              <p className="muted small">Prices are per night before tax. Crossed-out nights are not available online.</p>
            </div>
            {cal.error ? <ErrorState error={cal.error} onRetry={cal.reload} /> : cal.loading ? <Skeleton h={260} r={8} /> : (
              <RangeCalendar days={cal.data} checkIn={stay.checkIn} checkOut={stay.checkOut} onChange={(a, b) => set({ checkIn: a, checkOut: b })} />
            )}
            <div className="row row-2">
              <Field label="Adults"><select value={stay.adults} onChange={(e) => set({ adults: e.target.value })}>{[1, 2, 3, 4, 5, 6].map((n) => <option key={n}>{n}</option>)}</select></Field>
              <Field label="Children"><select value={stay.children} onChange={(e) => set({ children: e.target.value })}>{[0, 1, 2, 3, 4].map((n) => <option key={n}>{n}</option>)}</select></Field>
            </div>

            {!hasDates && <p className="muted small">Pick a check-in and check-out date to see the price.</p>}
            {hasDates && quote.loading && <Skeleton h={140} r={8} />}
            {hasDates && quote.error && <ErrorState error={quote.error} onRetry={quote.reload} />}
            {hasDates && quote.data && !plans.length && (
              <div className="alert alert-warn">{quote.data.fits ? 'This room is not available for those nights. Try different dates.' : `This room sleeps ${r?.maxGuests} guests. Try a larger room.`}</div>
            )}
            {hasDates && !quote.loading && !quote.error && !quote.data && <div className="alert alert-warn">This room is not available for those dates.</div>}
            {plans.length > 0 && (
              <>
                <div className="stack" style={{ gap: '.6rem' }} role="radiogroup" aria-label="Rate plan">
                  {plans.map((p) => (
                    <label key={p.code} className={`plan ${p.code === plan ? 'sel' : ''}`}>
                      <input type="radio" name="plan" checked={p.code === plan} onChange={() => setPlan(p.code)} />
                      <span><strong>{p.name}</strong><span className="muted small">{p.cancellation}</span></span>
                      <span className="amt">{inr(p.quote.total)}</span>
                    </label>
                  ))}
                </div>
                <p className="muted small">{plural(nightsBetween(stay.checkIn, stay.checkOut), 'night')}, {fmtRange(stay.checkIn, stay.checkOut)}. Total includes GST ({chosen.quote.gstBreakdown.map((g) => `${g.rate}%`).join(' and ')} on the nightly tariff).{quote.data.left <= 3 && ` Only ${quote.data.left} left.`}</p>
                <button className="btn btn-block" onClick={() => nav(`/book?${qs({ room: slug, plan, ...stay })}`)}>Reserve</button>
              </>
            )}
          </aside>
        </div>
      </div>
      {zoom && gallery.length > 0 && <Lightbox photos={gallery} index={photo} onClose={() => setZoom(false)} onIndex={setPhoto} />}
    </PublicShell>
  );
}
