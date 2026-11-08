// Seeds demo data relative to TODAY so the demo always has future availability.
// WARNING: wipes users, rooms, inventory, bookings and enquiries in the target database.
import bcrypt from 'bcryptjs';
import { connectDb } from '../db.js';
import { config } from '../config.js';
import { addDays, todayIST, weekday } from '../lib/dates.js';
import { Booking, Counter, Enquiry, Inventory, Notification, PromoCode, RatePlan, RoomType, User } from '../models/index.js';
import { createBooking } from '../services/booking.js';
import { routeEnquiry } from '../services/enquiryRouter.js';

const HORIZON = 400;
const TYPES = [
  { slug: 'valley-deluxe', name: 'Valley Deluxe Room', kind: 'room', units: 40, maxAdults: 2, maxGuests: 3, sizeSqft: 380, bed: 'King or twin', base: 6200, allot: 22, tagline: 'Balcony over the coffee terraces',
    description: 'A calm room with a private balcony facing the shade-grown coffee slopes. Wake to birdsong, not traffic.', amenities: ['Balcony', 'Rain shower', 'Filter coffee kit', 'Wi-Fi', 'Daily estate walk'] },
  { slug: 'canopy-suite', name: 'Canopy Suite', kind: 'room', units: 24, maxAdults: 3, maxGuests: 4, sizeSqft: 560, bed: 'King + sofa bed', base: 8900, allot: 12, tagline: 'Sitting room under the silver oaks',
    description: 'A separate sitting area, deep bathtub and a deck set among the shade trees. Suited to families and longer stays.', amenities: ['Private deck', 'Bathtub', 'Sitting room', 'Wi-Fi', 'Daily estate walk'] },
  { slug: 'planters-villa', name: "Planter's Villa", kind: 'villa', units: 8, maxAdults: 4, maxGuests: 5, sizeSqft: 1100, bed: 'King + twin', base: 13500, allot: 4, tagline: 'A restored bungalow with its own garden',
    description: 'Two bedrooms, a verandah and a private garden. Built in the style of the old planters’ bungalows, with a modern kitchenette.', amenities: ['Two bedrooms', 'Verandah', 'Private garden', 'Kitchenette', 'Wi-Fi'] },
  { slug: 'ridge-pool-villa', name: 'Ridge Pool Villa', kind: 'villa', units: 4, maxAdults: 4, maxGuests: 6, sizeSqft: 1600, bed: 'Two kings + sofa bed', base: 19500, allot: 2, tagline: 'Plunge pool on the ridge line',
    description: 'The most private stay on the estate: two bedrooms, a plunge pool and uninterrupted views along the Baba Budan range.', amenities: ['Plunge pool', 'Two bedrooms', 'Butler on call', 'Fire pit', 'Wi-Fi'] },
];
const PLANS = [
  { code: 'flex', name: 'Flexible', description: 'Room only. Free cancellation up to 3 days before arrival.', adjustPct: 0, addPerNight: 0, refundable: true, cancellation: 'Free cancellation up to 3 days before arrival', order: 1 },
  { code: 'bb', name: 'With breakfast', description: 'Breakfast for two on the verandah. Free cancellation up to 3 days before arrival.', adjustPct: 0, addPerNight: 1200, refundable: true, cancellation: 'Free cancellation up to 3 days before arrival', order: 2 },
  { code: 'saver', name: 'Advance saver', description: '10% off. Non-refundable.', adjustPct: -10, addPerNight: 0, refundable: false, cancellation: 'Non-refundable', order: 3 },
];

const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const round50 = (n) => Math.round(n / 50) * 50;
function seasonal(base, date) {
  const m = Number(date.slice(5, 7));
  const season = [10, 11, 12, 1, 2].includes(m) ? 1.2 : [6, 7, 8, 9].includes(m) ? 0.85 : 1.05;
  const wk = [5, 6].includes(weekday(date)) ? 1.15 : 1;
  return round50(base * season * wk);
}

export async function seedDatabase() {
  const savedKey = config.geminiKey;
  config.geminiKey = ''; // deterministic seed: rules engine only
  await Promise.all([User, RoomType, RatePlan, Inventory, Booking, Enquiry, PromoCode, Counter, Notification].map((M) => M.deleteMany({})));
  await Promise.all([User, RoomType, RatePlan, Inventory, Booking, Enquiry, PromoCode].map((M) => M.syncIndexes()));

  const hash = await bcrypt.hash(config.seedPassword, 11);
  await User.insertMany([
    { name: 'Anita Rao', email: 'gm@mistridge.test', role: 'gm' },
    { name: 'Rohan Gowda', email: 'reservations@mistridge.test', role: 'reservations' },
    { name: 'Meera Nair', email: 'reservations2@mistridge.test', role: 'reservations' },
    { name: 'Karthik Hegde', email: 'sales@mistridge.test', role: 'sales' },
    { name: 'Divya Shetty', email: 'sales2@mistridge.test', role: 'sales' },
  ].map((u) => ({ ...u, passwordHash: hash })));

  await RatePlan.insertMany(PLANS);
  const types = await RoomType.insertMany(TYPES.map(({ base, allot, ...t }, i) => ({
    ...t, order: i,
    photos: [1, 2, 3].map((n) => ({ url: `/photos/${t.slug}-${n}.svg`, alt: `${t.name}, view ${n}` })),
  })));

  const today = todayIST();
  const rand = rng(42);
  const rows = [];
  types.forEach((t, ti) => {
    const { base, allot } = TYPES[ti];
    for (let i = 0; i < HORIZON; i++) {
      const date = addDays(today, i);
      const wknd = [5, 6].includes(weekday(date));
      const load = (i < 120 ? (wknd ? 0.85 : 0.5) : 0.12) * (0.7 + rand() * 0.6);
      let sold = Math.min(allot, Math.round(allot * load));
      if (wknd && i < 60 && rand() < 0.12) sold = allot; // a few sold-out weekends to show that state
      const privateFunction = ti >= 2 && i >= 30 && i <= 32; // villas blacked out for a private function
      rows.push({ roomType: t._id, date, rate: seasonal(base, date), allotment: allot, sold, blackout: privateFunction });
    }
  });
  // Keep the brief's sample question (villa free 14–16 Nov) answerable.
  for (const r of rows) if (String(r.roomType) === String(types[2]._id) && r.date >= '2026-11-14' && r.date <= '2026-11-16') { r.sold = 1; r.blackout = false; }
  await Inventory.insertMany(rows);

  await PromoCode.insertMany([
    { code: 'DIRECT10', description: '10% off direct bookings, 2+ nights', type: 'percent', value: 10, maxDiscount: 3000, minNights: 2, validTo: addDays(today, 365) },
    { code: 'FLAT1000', description: '₹1,000 off any stay of 3+ nights', type: 'flat', value: 1000, minNights: 3, validTo: addDays(today, 365) },
    { code: 'MONSOON15', description: 'Monsoon offer (expired)', type: 'percent', value: 15, validTo: addDays(today, -30) },
  ]);

  // A few real bookings through the production code path (hold -> mock payment -> confirm).
  const card = { number: '4242 4242 4242 4242', expMonth: 12, expYear: 2031, cvc: '123' };
  const mk = async (slug, plan, off, nights, name, extra = {}) => {
    const t = types.find((x) => x.slug === slug); // make sure the sample stay is sellable
    await Inventory.updateMany({ roomType: t._id, date: { $gte: addDays(today, off), $lt: addDays(today, off + nights) } }, { sold: 0, blackout: false });
    return createBooking({
    roomSlug: slug, planCode: plan, checkIn: addDays(today, off), checkOut: addDays(today, off + nights), rooms: 1, adults: 2, children: 0,
    guest: { name, email: `${name.split(' ')[0].toLowerCase()}@example.test`, phone: '+91 98450 00000' }, consent: true, payment: card, ...extra,
  }, { idempotencyKey: `seed-${name}-${off}` }).catch((e) => console.warn(`  skipped sample booking for ${name}: ${e.message}`));
  };
  await mk('valley-deluxe', 'bb', 9, 2, 'Asha Pillai');
  await mk('canopy-suite', 'flex', 16, 3, 'Imran Sheikh', { promoCode: 'DIRECT10' });
  await mk('planters-villa', 'saver', 45, 2, 'Neha Kulkarni', { adults: 4 });

  // Enquiries: the three from the brief, plus a complaint, a vague one and a WhatsApp message.
  const inbox = [
    ['web', 'Priya Menon', 'priya.menon@example.test', "Venue for my sister's wedding in Feb 2027, about 250 guests, 2 nights"],
    ['web', 'Arjun Das', 'arjun.das@example.test', 'Is a villa free 14-16 Nov for 2 adults and a child?'],
    ['email', 'hr@northwind-labs.example.test', 'hr@northwind-labs.example.test', 'Team of 45 wants a January offsite with a conference hall'],
    ['whatsapp', '+91 90000 11122', '+91 90000 11122', 'The room was dirty and the water was cold the whole stay. I want a refund. Very disappointed.'],
    ['whatsapp', '+91 90000 33344', '+91 90000 33344', 'hi do you have something nice for the long weekend?'],
    ['web', 'Sunil Rao', 'sunil.rao@example.test', 'Looking at 20-22 Dec for 2 adults, which suite is available and what is the tariff?'],
  ];
  for (const [channel, name, contact, message] of inbox) await routeEnquiry({ channel, name, contact, message, consent: channel === 'web' });

  // Give the dashboard a realistic first-reply time: enquiry 4411 was answered after 14 minutes.
  const e = await Enquiry.findOne({ ref: 'ENQ-4411' });
  const created = new Date(Date.now() - 3 * 3600_000);
  await Enquiry.collection.updateOne({ _id: e._id }, { $set: { createdAt: created, firstReplyAt: new Date(created.getTime() + 14 * 60_000), status: 'replied', replies: [{ body: e.ai.draft, sentAt: new Date(created.getTime() + 14 * 60_000), simulated: true }] } });

  console.log('Seeded. Demo logins (password from SEED_PASSWORD, default Demo@1234):');
  console.log('  gm@mistridge.test  reservations@mistridge.test  sales@mistridge.test');
  config.geminiKey = savedKey;
}

// `npm run seed` (wipes and reloads the demo data)
if (process.argv[1]?.endsWith('seed.js')) {
  const db = await connectDb();
  await seedDatabase();
  await db.close();
}
