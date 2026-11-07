import crypto from 'node:crypto';

// MOCK gateway. Behaves like a hosted-checkout sandbox: Luhn-valid numbers succeed,
// documented test numbers decline. Full card numbers / CVC are never stored or logged.
const DECLINES = {
  '4000000000000002': 'Your card was declined.',
  '4000000000009995': 'Insufficient funds.',
};

export const luhn = (num) => {
  let sum = 0;
  let alt = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let n = Number(num[i]);
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
    alt = !alt;
  }
  return num.length >= 12 && sum % 10 === 0;
};

export async function chargeTestCard({ number, expMonth, expYear, cvc, amount }, now = new Date()) {
  const digits = String(number).replace(/[\s-]/g, '');
  if (!/^\d{12,19}$/.test(digits) || !luhn(digits)) return { ok: false, reason: 'Enter a valid card number.' };
  if (!/^\d{3,4}$/.test(String(cvc))) return { ok: false, reason: 'Enter the 3 or 4 digit security code.' };
  const y = expYear < 100 ? 2000 + expYear : expYear;
  if (expMonth < 1 || expMonth > 12 || y < now.getFullYear() || (y === now.getFullYear() && expMonth < now.getMonth() + 1)) {
    return { ok: false, reason: 'This card has expired.' };
  }
  if (!(amount > 0)) return { ok: false, reason: 'Invalid amount.' };
  if (DECLINES[digits]) return { ok: false, reason: DECLINES[digits] };
  return { ok: true, reference: `test_${crypto.randomBytes(8).toString('hex')}`, last4: digits.slice(-4) };
}
