import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, qs } from '../api';
import { PublicShell, SiteFooter, SiteHeader } from '../App';
import { addDays, fmtRange, inr, nightsBetween, plural, todayISO } from '../format';
import RangeCalendar from '../RangeCalendar';
import { Empty, ErrorState, Field, Photo, Skeleton, useFetch } from '../ui';

export function stayParams(sp) {
  return { checkIn: sp.get('checkIn') || '', checkOut: sp.get('checkOut') || '', adults: Number(sp.get('adults')) || 2, children: Number(sp.get('children')) || 0, rooms: Number(sp.get('rooms')) || 1 };
}

function SearchBar({ value, onSearch }) {
  const [v, setV] = useState(value);
  const [open, setOpen] = useState(false);
  const ready = v.checkIn && v.checkOut;
  return (
    <form className="searchbar" onSubmit={(e) => { e.preventDefault(); if (ready) onSearch(v); else setOpen(true); }}>
      <div className="searchbar-row">
        <div className="field"><span className="field-label">Dates</span>
          <button type="button" className="date-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {ready ? <span>{fmtRange(v.checkIn, v.checkOut)} · {plural(nightsBetween(v.checkIn, v.checkOut), 'night')}</span> : <span className="ph">Choose check-in and check-out</span>}
            <span aria-hidden="true">▾</span>
          </button>
        </div>
        <Field label="Adults"><select value={v.adults} onChange={(e) => setV({ ...v, adults: Number(e.target.value) })}>{[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}</select></Field>
        <Field label="Children"><select value={v.children} onChange={(e) => setV({ ...v, children: Number(e.target.value) })}>{[0, 1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}</select></Field>
        <button className="btn" type="submit">Check availability</button>
      </div>
      {open && (
        <div className="pop">
          <RangeCalendar checkIn={v.checkIn} checkOut={v.checkOut} showPrices={false} onChange={(a, b) => { setV({ ...v, checkIn: a, checkOut: b }); if (b) setOpen(false); }} />
        </div>
      )}
    </form>
  );
}

function RoomCard({ r, stay }) {
  const room = r.roomType;
  const hasDates = stay.checkIn && stay.checkOut;
  const flex = r.plans.find((p) => p.code === 'flex') || r.plans[0];
  const to = `/rooms/${room.slug}?${qs(hasDates ? stay : { adults: stay.adults, children: stay.children })}`;
  const unavailable = hasDates && r.left === 0;
  return (
    <article className={`room-card ${unavailable ? 'soldout' : ''}`}>
      <Photo src={room.photos[0]?.url} alt={room.photos[0]?.alt || room.name} />
      <div className="body">
        <div><h3><Link to={to} style={{ textDecoration: 'none' }}>{room.name}</Link></h3><p className="muted">{room.tagline}</p></div>
        <div className="facts"><span>{room.sizeSqft} sq ft</span><span>{room.bed}</span><span>Sleeps {room.maxGuests}</span></div>
        {hasDates ? (
          unavailable ? (
            <div><span className="badge badge-red">{r.fits ? 'Sold out for these dates' : `Too small for ${stay.adults + stay.children} guests`}</span>
              <p className="muted small" style={{ marginTop: '.5rem' }}>{r.fits ? 'Try nearby dates, or send us an enquiry.' : 'Try a larger room type or add a second room.'}</p></div>
          ) : (
            <div className="price-line">
              <span className="price">{inr(flex.quote.total)}</span>
              <span className="muted small">for {plural(r.nights, 'night')}, incl. GST</span>
              {r.left <= 3 && <span className="badge">Only {r.left} left</span>}
            </div>
          )
        ) : <p className="muted small">Choose dates to see prices and availability.</p>}
        <div><Link className={`btn ${unavailable ? 'btn-quiet' : ''}`} to={to}>{hasDates && !unavailable ? 'Choose this room' : 'View room'}</Link></div>
      </div>
    </article>
  );
}

export default function Home() {
  const [sp, setSp] = useSearchParams();
  const stay = stayParams(sp);
  const hasDates = Boolean(stay.checkIn && stay.checkOut);

  const rooms = useFetch(async (signal) => {
    if (hasDates) return (await api(`/availability?${qs(stay)}`, { signal })).results;
    const d = await api('/rooms', { signal });
    return d.rooms.map((roomType) => ({ roomType, plans: [], left: 1, nights: 0, fits: true }));
  }, [stay.checkIn, stay.checkOut, stay.adults, stay.children, stay.rooms]);

  useEffect(() => { document.title = 'Mistridge Estate · Coffee-estate resort, Chikkamagaluru'; }, []);
  const search = (v) => { const p = new URLSearchParams(qs(v)); setSp(p, { replace: false }); setTimeout(() => document.getElementById('rooms')?.scrollIntoView({ behavior: 'smooth' }), 50); };

  return (
    <>
      <SiteHeader />
      <main>
        <section className="hero">
          <img src="/photos/hero.svg" alt="" width="1600" height="1000" fetchpriority="high" />
          <div className="wrap">
            <h1>Wake among the coffee estates</h1>
            <p>Rooms and villas on a working Chikkamagaluru plantation. Book direct for the clearest prices, GST included.</p>
          </div>
        </section>
        <div className="wrap"><SearchBar value={{ ...stay, checkIn: stay.checkIn, checkOut: stay.checkOut }} onSearch={search} /></div>

        <section className="section wrap" id="rooms">
          <div className="section-head">
            <h2>{hasDates ? `Available ${fmtRange(stay.checkIn, stay.checkOut)}` : 'Rooms & villas'}</h2>
            {hasDates && <button className="btn btn-quiet btn-sm" onClick={() => setSp({})}>Clear dates</button>}
          </div>
          <div className="stack">
            {rooms.loading && [0, 1].map((i) => <div key={i} className="room-card"><Skeleton h={260} r={8} /><div className="body"><Skeleton h={28} w="60%" /><Skeleton h={16} /><Skeleton h={16} w="40%" /></div></div>)}
            {rooms.error && <ErrorState error={rooms.error} onRetry={rooms.reload} />}
            {rooms.data && !rooms.data.length && <Empty title="No rooms to show">Please try again shortly.</Empty>}
            {rooms.data && rooms.data.every((r) => hasDates && r.left === 0) && <div className="alert alert-warn">Nothing is open online for those dates. Try nearby dates, or <Link to="/events">send us an enquiry</Link> and our team will check for you.</div>}
            {rooms.data?.map((r) => <RoomCard key={r.roomType._id} r={r} stay={stay} />)}
          </div>
        </section>

        <section className="section wrap">
          <div className="split">
            <Photo src="/photos/events.svg" alt="Wedding lawn with a flower-draped arch, ridges beyond" ratio="4 / 3" />
            <div className="stack">
              <h2>Weddings, offsites and gatherings</h2>
              <p className="muted">Lawns that hold 400, a conference hall, and 76 keys on site. Tell us what you have in mind and the right person on our events team replies with a proposal.</p>
              <div><Link className="btn" to="/events">Plan an event</Link></div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
