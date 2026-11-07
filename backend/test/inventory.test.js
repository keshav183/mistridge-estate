import assert from 'node:assert/strict';
import test from 'node:test';
import { availableUnits, minAvailable, releaseNights, reserveNights } from '../src/lib/inventory.js';
import { memoryStore } from './helpers.js';

const R = 'villa';
const nights = ['2026-12-01', '2026-12-02', '2026-12-03'];
const rows = (allotment, extra = {}) => nights.map((date) => ({ roomType: R, date, allotment, sold: 0, blackout: false, ...extra }));

test('50 simultaneous bookings for 3 units: exactly 3 succeed, never an overbooking', async () => {
  const store = memoryStore(rows(3));
  const results = await Promise.all(Array.from({ length: 50 }, () => reserveNights(store, R, nights, 1)));
  assert.equal(results.filter((r) => r.ok).length, 3);
  for (const d of nights) assert.equal(store.sold(R, d), 3);
});

test('a multi-night hold that fails on the last night releases the earlier nights', async () => {
  const data = rows(2);
  data[2].sold = 2; // last night is full
  const store = memoryStore(data);
  const res = await reserveNights(store, R, nights, 1);
  assert.deepEqual([res.ok, res.soldOutOn], [false, '2026-12-03']);
  assert.equal(store.sold(R, '2026-12-01'), 0);
  assert.equal(store.sold(R, '2026-12-02'), 0);
});

test('concurrent overlapping stays never exceed allotment on any night', async () => {
  const store = memoryStore(rows(4));
  const stays = [nights, nights.slice(0, 2), nights.slice(1), nights.slice(0, 1)];
  await Promise.all(Array.from({ length: 60 }, (_, i) => reserveNights(store, R, stays[i % 4], 1)));
  for (const d of nights) assert.ok(store.sold(R, d) <= 4, `${d} sold ${store.sold(R, d)}`);
});

test('blacked-out and missing nights cannot be held', async () => {
  const store = memoryStore(rows(5, { blackout: true }));
  assert.equal((await reserveNights(store, R, nights, 1)).ok, false);
  assert.equal((await reserveNights(memoryStore([]), R, nights, 1)).ok, false);
});

test('holding several rooms at once respects the allotment', async () => {
  const store = memoryStore(rows(3));
  assert.equal((await reserveNights(store, R, nights, 2)).ok, true);
  assert.equal((await reserveNights(store, R, nights, 2)).ok, false); // only 1 left
  await releaseNights(store, R, nights, 2);
  assert.equal(store.sold(R, nights[0]), 0);
});

test('availability helpers', () => {
  assert.equal(availableUnits({ allotment: 5, sold: 2, blackout: false }), 3);
  assert.equal(availableUnits({ allotment: 5, sold: 2, blackout: true }), 0);
  assert.equal(availableUnits(undefined), 0);
  const r = rows(5); r[1].sold = 4;
  assert.equal(minAvailable(r, nights), 1);
  assert.equal(minAvailable(r, [...nights, '2026-12-04']), 0); // missing night
});
