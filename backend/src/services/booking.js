import crypto from 'node:crypto';
import { badRequest, conflict, HttpError, notFound } from '../lib/errors.js';
import { eachNight, todayIST, validateStay } from '../lib/dates.js';
import { mongoStore, releaseNights, reserveNights } from '../lib/inventory.js';
import { chargeTestCard } from '../lib/payments.js';
import { evaluatePromo, quoteStay } from '../lib/pricing.js';
import { Booking, Inventory, PromoCode, RatePlan, RoomType } from '../models/index.js';
import { fitsParty } from './availability.js';

const store = mongoStore(Inventory);
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no look-alikes (0/O, 1/I/L)
const newCode = () => 'MR-' + Array.from(crypto.randomBytes(6), (b) => ALPHABET[b % ALPHABET.length]).join('');

async function claimPromo(code) {
  const r = await PromoCode.updateOne(
    { code, active: true, $or: [{ maxUses: null }, { maxUses: { $exists: false } }, { $expr: { $lt: ['$used', '$maxUses'] } }] },
    { $inc: { used: 1 } },
  );
  return r.modifiedCount === 1;
}
const unclaimPromo = (code) => PromoCode.updateOne({ code, used: { $gt: 0 } }, { $inc: { used: -1 } });

/** Price a stay for the booking flow (also powers promo preview). Pure reads, no holds. */
export async function priceStay({ roomSlug, planCode, checkIn, checkOut, rooms, promoCode }) {
  const v = validateStay(checkIn, checkOut);
  if (!v.ok) throw badRequest(v.error, 'bad_dates');
  const [type, plan] = await Promise.all([RoomType.findOne({ slug: roomSlug, active: true }).lean(), RatePlan.findOne({ code: planCode, active: true }).lean()]);
  if (!type) throw notFound('That room is not available.');
  if (!plan) throw badRequest('Choose a rate plan.', 'bad_plan');
  const dates = eachNight(checkIn, checkOut);
  const rows = await Inventory.find({ roomType: type._id, date: { $in: dates } }).lean();
  if (rows.length !== dates.length) throw conflict('Those dates are not open for booking.', 'not_open');
  const nights = dates.map((d) => ({ date: d, rate: rows.find((r) => r.date === d).rate }));

  let promo = null;
  let discount = 0;
  let promoMessage = null;
  if (promoCode) {
    promo = await PromoCode.findOne({ code: promoCode.toUpperCase().trim() }).lean();
    const base = quoteStay({ nights, plan, rooms });
    const res = evaluatePromo(promo, { subtotal: base.subtotal, nights: v.nights, today: todayIST() });
    if (res.ok) discount = res.discount; else { promoMessage = res.reason; promo = null; }
  }
  return { type, plan, dates, quote: quoteStay({ nights, plan, rooms, discount }), promo, promoMessage, nightsCount: v.nights };
}

export async function createBooking(input, { userId, idempotencyKey }) {
  if (idempotencyKey) {
    const existing = await Booking.findOne({ idempotencyKey }).lean();
    if (existing) return { booking: existing, replayed: true };
  }
  const priced = await priceStay(input);
  const { type, plan, dates, quote, promo } = priced;
  if (input.promoCode && !promo) throw badRequest(priced.promoMessage || 'That code is not valid.', 'bad_promo');
  if (!fitsParty(type, input)) throw badRequest('That room cannot sleep your party. Add a room or pick a larger type.', 'party_too_big');

  // 1) Hold stock atomically (the overbooking guard).
  const hold = await reserveNights(store, type._id, dates, input.rooms);
  if (!hold.ok) throw new HttpError(409, 'Sorry — the last room for your dates was just taken. Please choose different dates or room.', 'sold_out');

  let promoClaimed = false;
  const undo = async () => {
    await releaseNights(store, type._id, dates, input.rooms);
    if (promoClaimed) await unclaimPromo(promo.code);
  };
  try {
    if (promo) {
      promoClaimed = await claimPromo(promo.code);
      if (!promoClaimed) throw badRequest('That code has just been fully redeemed.', 'bad_promo');
    }
    // 2) Take payment (mock). Failure releases the hold.
    const pay = await chargeTestCard({ ...input.payment, amount: quote.total });
    if (!pay.ok) throw new HttpError(402, pay.reason, 'payment_failed');

    // 3) Persist.
    const booking = await Booking.create({
      code: newCode(), idempotencyKey, user: userId, roomType: type._id, roomName: type.name,
      ratePlan: { code: plan.code, name: plan.name, refundable: plan.refundable },
      checkIn: input.checkIn, checkOut: input.checkOut, nights: dates.length, rooms: input.rooms,
      adults: input.adults, children: input.children,
      guest: input.guest, specialRequests: input.specialRequests,
      pricing: quote, promoCode: promo?.code,
      payment: { status: 'paid', reference: pay.reference, last4: pay.last4, mode: 'test' },
      consentAt: new Date(), createdDay: todayIST(),
    });
    return { booking: booking.toObject(), replayed: false };
  } catch (err) {
    await undo();
    throw err;
  }
}

export async function cancelBooking(id) {
  const b = await Booking.findOneAndUpdate({ _id: id, status: 'confirmed' }, { status: 'cancelled', cancelledAt: new Date() }, { new: true }).lean();
  if (!b) throw conflict('That booking is already cancelled or does not exist.');
  await releaseNights(store, b.roomType, eachNight(b.checkIn, b.checkOut), b.rooms);
  if (b.promoCode) await unclaimPromo(b.promoCode);
  return b;
}

/** Guest-safe view (never includes payment reference or internal ids beyond the code). */
export const publicBooking = (b) => ({
  code: b.code, status: b.status, roomName: b.roomName, ratePlan: b.ratePlan,
  checkIn: b.checkIn, checkOut: b.checkOut, nights: b.nights, rooms: b.rooms, adults: b.adults, children: b.children,
  guest: { name: b.guest?.name, email: b.guest?.email }, pricing: b.pricing, promoCode: b.promoCode,
  payment: { status: b.payment?.status, last4: b.payment?.last4, mode: b.payment?.mode }, createdAt: b.createdAt,
});
