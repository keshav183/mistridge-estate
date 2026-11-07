import { eachNight, validateStay } from '../lib/dates.js';
import { availableUnits, minAvailable } from '../lib/inventory.js';
import { quoteStay } from '../lib/pricing.js';
import { Inventory, RatePlan, RoomType } from '../models/index.js';
import { badRequest } from '../lib/errors.js';

export const fitsParty = (room, { adults, children, rooms }) =>
  adults <= room.maxAdults * rooms && adults + children <= room.maxGuests * rooms && adults >= rooms;

export async function loadStayRows(roomTypeIds, checkIn, checkOut) {
  return Inventory.find({ roomType: { $in: roomTypeIds }, date: { $gte: checkIn, $lt: checkOut } }).lean();
}

/** Availability + priced rate plans for every room type for one stay. */
export async function searchStay({ checkIn, checkOut, adults = 2, children = 0, rooms = 1 }) {
  const v = validateStay(checkIn, checkOut);
  if (!v.ok) throw badRequest(v.error, 'bad_dates');
  const dates = eachNight(checkIn, checkOut);
  const [types, plans] = await Promise.all([
    RoomType.find({ active: true }).sort({ order: 1 }).lean(),
    RatePlan.find({ active: true }).sort({ order: 1 }).lean(),
  ]);
  const rows = await loadStayRows(types.map((t) => t._id), checkIn, checkOut);

  return types.map((t) => {
    const mine = rows.filter((r) => String(r.roomType) === String(t._id));
    const byDate = new Map(mine.map((r) => [r.date, r]));
    const complete = dates.every((d) => byDate.has(d));
    const left = complete ? minAvailable(mine, dates) : 0;
    const fits = fitsParty(t, { adults, children, rooms });
    const sellable = fits && left >= rooms;
    const nightsRates = dates.map((d) => ({ date: d, rate: byDate.get(d)?.rate ?? 0 }));
    return {
      roomType: t,
      nights: v.nights,
      left: sellable ? left : 0,
      soldOut: complete && left === 0,
      fits,
      plans: sellable
        ? plans.map((p) => ({ code: p.code, name: p.name, description: p.description, refundable: p.refundable, cancellation: p.cancellation, quote: quoteStay({ nights: nightsRates, plan: p, rooms }) }))
        : [],
    };
  });
}

/** Per-day calendar for a room page: from-rate and what is left (only exposes small counts). */
export async function roomCalendar(slug, from, to) {
  const type = await RoomType.findOne({ slug, active: true }).lean();
  if (!type) return null;
  const rows = await Inventory.find({ roomType: type._id, date: { $gte: from, $lte: to } }).sort({ date: 1 }).lean();
  return rows.map((r) => {
    const n = availableUnits(r);
    return { date: r.date, rate: r.rate, available: n > 0, left: n > 0 && n <= 3 ? n : null, blackout: r.blackout };
  });
}
