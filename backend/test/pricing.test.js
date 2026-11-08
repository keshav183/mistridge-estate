import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluatePromo, gstRateFor, planNightly, quoteStay } from '../src/lib/pricing.js';

test('GST slab: 5% up to ₹7,500 a night, 18% above', () => {
  assert.equal(gstRateFor(7500), 5);
  assert.equal(gstRateFor(7501), 18);
  assert.equal(gstRateFor(6200), 5);
  assert.equal(gstRateFor(19500), 18);
});

test('rate plans adjust price: breakfast add-on and non-refundable discount', () => {
  assert.equal(planNightly(6200, { addPerNight: 1200 }), 7400);
  assert.equal(planNightly(10000, { adjustPct: -10 }), 9000);
});

test('quote: slab is chosen per night, so a peak weekend can tip into 18%', () => {
  const q = quoteStay({ nights: [{ date: 'a', rate: 6200 }, { date: 'b', rate: 7150 }], plan: { addPerNight: 1200 } });
  // night a: 7400 -> 5% = 370; night b: 8350 -> 18% = 1503
  assert.equal(q.subtotal, 15750);
  assert.equal(q.gst, 370 + 1503);
  assert.equal(q.total, 15750 + 1873);
  assert.deepEqual(q.gstBreakdown.map((b) => b.rate).sort((a, b) => a - b), [5, 18]);
});

test('promo is applied before tax and can move a night into the lower slab', () => {
  const q = quoteStay({ nights: [{ date: 'a', rate: 8000 }], plan: {}, discount: 1000 }); // pays 7000 -> 5%
  assert.equal(q.taxable, 7000);
  assert.equal(q.gst, 350);
  assert.equal(q.discount, 1000);
});

test('the discount applied is exactly the promo amount, even after per-night rounding', () => {
  const q = quoteStay({ nights: [{ date: 'a', rate: 9333 }, { date: 'b', rate: 9333 }, { date: 'c', rate: 9333 }], plan: {}, discount: 2800 });
  assert.equal(q.discount, 2800);
});

test('multiple rooms multiply every figure', () => {
  const one = quoteStay({ nights: [{ date: 'a', rate: 9000 }], plan: {} });
  const two = quoteStay({ nights: [{ date: 'a', rate: 9000 }], plan: {}, rooms: 2 });
  assert.equal(two.total, one.total * 2);
});

test('promo rules', () => {
  const base = { active: true, type: 'percent', value: 10, maxDiscount: 3000, minNights: 2, used: 0 };
  const ctx = { subtotal: 50000, nights: 3, today: '2026-11-07' };
  assert.deepEqual(evaluatePromo(base, ctx), { ok: true, discount: 3000 });           // capped
  assert.equal(evaluatePromo(base, { ...ctx, nights: 1 }).ok, false);                  // min nights
  assert.equal(evaluatePromo({ ...base, validTo: '2026-11-01' }, ctx).ok, false);      // expired
  assert.equal(evaluatePromo({ ...base, maxUses: 5, used: 5 }, ctx).ok, false);        // redeemed
  assert.equal(evaluatePromo({ ...base, active: false }, ctx).ok, false);
  assert.equal(evaluatePromo(null, ctx).ok, false);
  assert.equal(evaluatePromo({ active: true, type: 'flat', value: 99999, used: 0 }, { ...ctx, subtotal: 5000 }).discount, 5000); // never exceeds subtotal
});
