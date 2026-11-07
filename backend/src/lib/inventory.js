// Allotment control — the "never overbook" core.
//
// One Inventory row exists per room type per night: { allotment, sold, blackout, rate }.
// `allotment` is the stock the admin has released to the website (not total rooms).
// A hold is ONE atomic conditional update ("sold + qty <= allotment AND not blacked out").
// There is no read-then-write anywhere, so two simultaneous guests cannot both take the last unit.
// A multi-night stay holds night by night; if any night fails, nights already held are released.

export const availableUnits = (row) => (!row || row.blackout ? 0 : Math.max(0, row.allotment - row.sold));

export async function reserveNights(store, roomTypeId, dates, qty) {
  const held = [];
  for (const date of dates) {
    const ok = await store.tryHold(roomTypeId, date, qty);
    if (!ok) {
      await releaseNights(store, roomTypeId, held, qty);
      return { ok: false, soldOutOn: date };
    }
    held.push(date);
  }
  return { ok: true, dates: held };
}

export async function releaseNights(store, roomTypeId, dates, qty) {
  await Promise.all(dates.map((d) => store.release(roomTypeId, d, qty)));
}

/** Units left across a stay = the scarcest night. Missing rows count as unavailable. */
export function minAvailable(rows, dates) {
  const byDate = new Map(rows.map((r) => [r.date, r]));
  return dates.reduce((min, d) => Math.min(min, availableUnits(byDate.get(d))), Infinity);
}

/** MongoDB-backed store. `Inventory` is the mongoose model. */
export const mongoStore = (Inventory) => ({
  async tryHold(roomType, date, qty) {
    const r = await Inventory.updateOne(
      { roomType, date, blackout: false, $expr: { $lte: [{ $add: ['$sold', qty] }, '$allotment'] } },
      { $inc: { sold: qty } },
    );
    return r.modifiedCount === 1;
  },
  async release(roomType, date, qty) {
    await Inventory.updateOne({ roomType, date, sold: { $gte: qty } }, { $inc: { sold: -qty } });
  },
});
