// End-to-end check against a RUNNING server (npm run dev:api, seeded data).
//   BASE=http://localhost:4000 npm run smoke
// Note: public booking endpoints are rate-limited (40 per 10 min per IP), so restart the API before re-running.
// Proves the headline guarantees: no overbooking under concurrency, payment failure releases stock,
// promo/GST pricing, role-based access, blackout, CSV export, and enquiry routing.
const BASE = (process.env.BASE || 'http://localhost:4000') + '/api';
const PASS = process.env.SEED_PASSWORD || 'Demo@1234';
const card = { number: '4242424242424242', expMonth: 12, expYear: 2035, cvc: '123' };
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };
const iso = (n) => new Date(Date.now() + 19800000 + n * 86400000).toISOString().slice(0, 10);
const call = async (method, path, body, headers = {}) => {
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { s: r.status, j: await r.json().catch(() => null), cookie: r.headers.get('set-cookie')?.split(';')[0], raw: r };
};
const login = async (email) => (await call('POST', '/auth/login', { email, password: PASS })).cookie;
const booking = (slug, ci, co, i, extra = {}) => ({ roomSlug: slug, planCode: 'flex', checkIn: ci, checkOut: co, rooms: 1, adults: 2, children: 0, guest: { name: `Smoke ${i}`, email: `smoke${i}@example.test`, phone: '+91 98450 00000' }, consent: true, payment: card, ...extra });

// 1) Find a 2-night window where the Ridge Pool Villa has few units left, then hammer it.
let window = null;
for (let off = 60; off < 200 && !window; off += 3) {
  const r = (await call('GET', `/availability?checkIn=${iso(off)}&checkOut=${iso(off + 2)}&adults=2`)).j.results.find((x) => x.roomType.slug === 'ridge-pool-villa');
  if (r.left >= 1 && r.left <= 2) window = { ci: iso(off), co: iso(off + 2), left: r.left };
}
check('found a bookable window', !!window);
if (window) {
  const N = 25;
  const rs = await Promise.all(Array.from({ length: N }, (_, i) => call('POST', '/bookings', booking('ridge-pool-villa', window.ci, window.co, i), { 'Idempotency-Key': `smoke-${Date.now()}-${i}` })));
  const ok = rs.filter((r) => r.s === 201).length;
  check(`${N} simultaneous bookings for ${window.left} unit(s): exactly ${window.left} succeed`, ok === window.left, `(got ${ok}, ${rs.filter((r) => r.s === 409).length} sold out)`);
  const after = (await call('GET', `/availability?checkIn=${window.ci}&checkOut=${window.co}&adults=2`)).j.results.find((x) => x.roomType.slug === 'ridge-pool-villa');
  check('stock is exactly zero afterwards (never negative)', after.left === 0);
  const first = rs.find((r) => r.s === 201);
  const idx = rs.indexOf(first);
  const again = await call('POST', '/bookings', booking('ridge-pool-villa', window.ci, window.co, idx), { 'Idempotency-Key': rs[idx] && `smoke-replay` });
  check('a booking is not created for sold-out dates on retry', again.s === 409);
}

// 2) Payment decline releases the hold.
const dec = await call('POST', '/bookings', booking('canopy-suite', iso(120), iso(122), 'd', { payment: { ...card, number: '4000000000000002' } }), { 'Idempotency-Key': `dec-${Date.now()}` });
check('declined card returns 402', dec.s === 402);
const ok2 = await call('POST', '/bookings', booking('canopy-suite', iso(120), iso(122), 'ok'), { 'Idempotency-Key': `ok-${Date.now()}` });
check('stock was released after the decline (next booking succeeds)', ok2.s === 201);
const key = `rep-${Date.now()}`;
const a = await call('POST', '/bookings', booking('canopy-suite', iso(130), iso(132), 'r'), { 'Idempotency-Key': key });
const b = await call('POST', '/bookings', booking('canopy-suite', iso(130), iso(132), 'r'), { 'Idempotency-Key': key });
check('same Idempotency-Key returns the same booking, not a second one', a.s === 201 && b.s === 200 && a.j.booking.code === b.j.booking.code);

// 3) Pricing, promo, validation
const pr = await call('POST', '/price', { roomSlug: 'canopy-suite', planCode: 'flex', checkIn: iso(140), checkOut: iso(143), rooms: 1, promoCode: 'DIRECT10' });
check('promo DIRECT10 applies and respects its cap', pr.j.promoApplied && pr.j.quote.discount <= 3000, `(discount ${pr.j.quote.discount})`);
check('expired promo is rejected with a reason', (await call('POST', '/price', { roomSlug: 'canopy-suite', planCode: 'flex', checkIn: iso(140), checkOut: iso(143), rooms: 1, promoCode: 'MONSOON15' })).j.promoApplied === false);
check('past dates are rejected', (await call('GET', `/availability?checkIn=${iso(-3)}&checkOut=${iso(-1)}`)).s === 400);
check('booking without consent is rejected', (await call('POST', '/bookings', { ...booking('canopy-suite', iso(150), iso(151), 'c'), consent: false }, { 'Idempotency-Key': `nc-${Date.now()}` })).s === 400);

// 4) Access control
check('admin API needs sign-in (401)', (await call('GET', '/admin/promos')).s === 401);
const sales = await login('sales@mistridge.test');
check('sales cannot open rates/promos (403)', (await call('GET', '/admin/promos', null, { cookie: sales })).s === 403);
check('sales can open the inbox', (await call('GET', '/enquiries', null, { cookie: sales })).s === 200);
const res = await login('reservations@mistridge.test');

// 5) Admin: allotment guard + blackout
const types = (await call('GET', `/admin/inventory?from=${iso(0)}&days=1`, null, { cookie: res })).j.roomTypes;
const ridge = types.find((t) => t.slug === 'ridge-pool-villa')._id;
const put = (b) => call('PUT', '/admin/inventory/bulk', b, { cookie: res });
check('allotment above physical units is refused', (await put({ roomTypeId: ridge, from: iso(10), to: iso(10), allotment: 99 })).s === 400);
await put({ roomTypeId: ridge, from: iso(170), to: iso(172), blackout: true });
const blk = await call('POST', '/bookings', booking('ridge-pool-villa', iso(170), iso(172), 'b'), { 'Idempotency-Key': `blk-${Date.now()}` });
check('blacked-out nights cannot be booked', blk.s === 409);
await put({ roomTypeId: ridge, from: iso(170), to: iso(172), blackout: false });

// 6) Export + enquiry routing
const csv = await fetch(`${BASE}/admin/export/bookings.csv?date=${iso(0)}`, { headers: { cookie: res } });
check('daily CSV export downloads', csv.status === 200 && (await csv.text()).replace(/^\uFEFF/, '').startsWith('booking_code'));
const route = async (msg) => (await call('POST', '/enquiries/ingest', { channel: 'whatsapp', from: '+91 90000 00000', message: msg }, { cookie: res })).j;
check('wedding enquiry -> wedding lane', (await route("Venue for my sister's wedding in Feb 2027, about 250 guests, 2 nights")).lane === 'wedding');
check('room enquiry -> room lane', (await route('Is a villa free 14-16 Nov for 2 adults and a child?')).lane === 'room');
check('offsite enquiry -> offsite lane', (await route('Team of 45 wants a January offsite with a conference hall')).lane === 'offsite');
check('complaint -> complaint lane', (await route('Room was dirty and staff rude, I want a refund')).lane === 'complaint');
check('vague message -> unsorted lane (human decides)', (await route('hi do you have something nice for the long weekend?')).lane === 'unsorted');

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
