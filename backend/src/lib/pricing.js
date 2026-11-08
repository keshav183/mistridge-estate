// GST on hotel accommodation is decided per room per night by the value charged that night:
//   up to ₹7,500 -> 5% (no ITC)      above ₹7,500 -> 18%
// (effective 22 Sep 2025). Rates live here, in one place, so a notification change is a one-line edit.
export const GST_THRESHOLD = 7500;
export const gstRateFor = (nightlyValue) => (nightlyValue <= 0 ? 0 : nightlyValue <= GST_THRESHOLD ? 5 : 18);

/** Price of one night on a rate plan: percentage adjustment, then a flat per-night add-on (e.g. breakfast). */
export const planNightly = (baseRate, plan = {}) =>
  Math.round(baseRate * (1 + (plan.adjustPct || 0) / 100) + (plan.addPerNight || 0));

/**
 * Prices a stay. `nights` = [{ date, rate }] base rates from the rate table.
 * A promo discount is spread proportionally over the nights BEFORE tax, so the GST slab
 * is chosen from what the guest actually pays per night.
 */
export function quoteStay({ nights, plan, rooms = 1, discount = 0 }) {
  const priced = nights.map((n) => ({ date: n.date, base: n.rate, price: planNightly(n.rate, plan) }));
  const subtotal = priced.reduce((s, n) => s + n.price, 0) * rooms;
  const ratio = subtotal > 0 ? Math.min(1, Math.max(0, discount) / subtotal) : 0;

  const nets = priced.map((n) => Math.round(n.price * (1 - ratio)));
  // Rounding per night can drift a rupee from the exact discount; the last night absorbs it.
  const wanted = (subtotal - Math.min(Math.max(discount, 0), subtotal)) / rooms;
  if (Number.isInteger(wanted)) nets[nets.length - 1] += wanted - nets.reduce((a, b) => a + b, 0);
  const lines = priced.map((n, i) => {
    const net = nets[i];
    const gstRate = gstRateFor(net);
    return { ...n, net, gstRate, gst: Math.round((net * gstRate) / 100) };
  });

  const taxable = lines.reduce((s, l) => s + l.net, 0) * rooms;
  const gst = lines.reduce((s, l) => s + l.gst, 0) * rooms;
  const breakdown = {};
  for (const l of lines) breakdown[l.gstRate] = (breakdown[l.gstRate] || 0) + l.gst * rooms;

  return {
    rooms,
    nights: lines,
    subtotal,
    discount: subtotal - taxable,
    taxable,
    gst,
    gstBreakdown: Object.entries(breakdown).map(([rate, amount]) => ({ rate: Number(rate), amount })),
    total: taxable + gst,
  };
}

export function evaluatePromo(promo, { subtotal, nights, today }) {
  const no = (reason) => ({ ok: false, reason, discount: 0 });
  if (!promo || !promo.active) return no('That code is not valid.');
  if (promo.validFrom && today < promo.validFrom) return no('That code is not active yet.');
  if (promo.validTo && today > promo.validTo) return no('That code has expired.');
  if (promo.maxUses && promo.used >= promo.maxUses) return no('That code has been fully redeemed.');
  if (promo.minNights && nights < promo.minNights) return no(`That code needs a stay of ${promo.minNights}+ nights.`);
  let discount = promo.type === 'percent' ? Math.round((subtotal * promo.value) / 100) : promo.value;
  if (promo.maxDiscount) discount = Math.min(discount, promo.maxDiscount);
  discount = Math.min(discount, subtotal);
  return { ok: true, discount };
}
