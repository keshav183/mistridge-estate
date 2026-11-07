import assert from 'node:assert/strict';
import test from 'node:test';
import { csvCell, toCsv } from '../src/lib/csv.js';
import { diffDays, eachNight, todayIST, validateStay } from '../src/lib/dates.js';
import { chargeTestCard, luhn } from '../src/lib/payments.js';

test('stay validation', () => {
  const today = '2026-11-07';
  assert.equal(validateStay('2026-11-14', '2026-11-16', { today }).nights, 2);
  assert.equal(validateStay('2026-11-06', '2026-11-08', { today }).ok, false);   // past
  assert.equal(validateStay('2026-11-10', '2026-11-10', { today }).ok, false);   // zero nights
  assert.equal(validateStay('2026-02-30', '2026-03-02', { today }).ok, false);   // impossible date
  assert.equal(validateStay('2026-12-01', '2026-12-20', { today }).ok, false);   // too long
  assert.equal(validateStay('2028-01-01', '2028-01-02', { today }).ok, false);   // beyond horizon
});

test('nights exclude the check-out day; IST rolls over before UTC', () => {
  assert.deepEqual(eachNight('2026-12-30', '2027-01-02'), ['2026-12-30', '2026-12-31', '2027-01-01']);
  assert.equal(diffDays('2026-02-27', '2026-03-01'), 2);
  assert.equal(todayIST(Date.parse('2026-11-07T20:00:00Z')), '2026-11-08');
});

test('mock gateway: success, declines, bad input', async () => {
  const ok = { number: '4242 4242 4242 4242', expMonth: 12, expYear: 2031, cvc: '123', amount: 100 };
  const res = await chargeTestCard(ok);
  assert.ok(res.ok && res.last4 === '4242' && res.reference.startsWith('test_'));
  assert.equal((await chargeTestCard({ ...ok, number: '4000 0000 0000 0002' })).ok, false);
  assert.equal((await chargeTestCard({ ...ok, number: '4242 4242 4242 4241' })).ok, false); // fails Luhn
  assert.equal((await chargeTestCard({ ...ok, expYear: 2020 })).ok, false);
  assert.equal((await chargeTestCard({ ...ok, cvc: '12' })).ok, false);
  assert.ok(luhn('4242424242424242'));
});

test('CSV quoting and formula-injection guard', () => {
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell('+91 98450 00000'), "'+91 98450 00000");
  assert.equal(csvCell(null), '');
  assert.equal(toCsv(['a', 'b'], [[1, 'x\ny']]), 'a,b\r\n1,"x\ny"\r\n');
});
