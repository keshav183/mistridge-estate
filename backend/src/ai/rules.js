import { addDays, isValidISODate } from '../lib/dates.js';

// Deterministic first-pass classifier + field extractor. It is the fallback when no LLM key is
// configured (or the LLM fails), and a cross-check on the LLM when it is.

const LEXICON = {
  wedding: { wedding: 3, marriage: 3, reception: 2, sangeet: 2, mehendi: 2, mehndi: 2, haldi: 2, engagement: 2, baraat: 2, bride: 2, groom: 2, mandap: 2, pheras: 2, venue: 1, lawn: 1, lawns: 1, decor: 1 },
  offsite: { offsite: 3, 'off-site': 3, 'off site': 3, conference: 2, corporate: 2, retreat: 2, workshop: 2, seminar: 2, delegates: 2, 'team building': 2, 'board meeting': 2, team: 1, training: 1, company: 1, meeting: 1 },
  room: { villa: 2, availability: 2, room: 1, rooms: 1, suite: 1, stay: 1, free: 1, available: 1, 'check-in': 1, 'check in': 1, tariff: 1, rate: 1, rates: 1, book: 1, booking: 1, adults: 1, child: 1, kids: 1 },
  complaint: { complaint: 3, complain: 3, unacceptable: 3, 'never again': 3, overcharged: 3, 'bad experience': 3, 'legal action': 3, 'consumer court': 3, disappointed: 2, refund: 2, dirty: 2, filthy: 2, rude: 2, worst: 2, terrible: 2, horrible: 2, unhappy: 2, 'not working': 1, 'cold water': 1, poor: 1, noisy: 1, broken: 1, 'no response': 1 },
};

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PATTERNS = Object.fromEntries(
  Object.entries(LEXICON).map(([cat, words]) => [
    cat,
    Object.entries(words).map(([w, weight]) => ({ w, weight, re: new RegExp(`(?<![a-z])${esc(w)}(?![a-z])`, 'i') })),
  ]),
);

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const monthIndex = (m) => MONTHS.indexOf(m.slice(0, 3).toLowerCase());
const WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const num = (s) => (/^\d+$/.test(s) ? Number(s) : WORDS[s?.toLowerCase()] ?? null);
const pad = (n) => String(n).padStart(2, '0');

function resolveYear(month, day, today, explicit) {
  if (explicit) return Number(explicit);
  const y = Number(today.slice(0, 4));
  return `${y}-${pad(month + 1)}-${pad(day)}` < today ? y + 1 : y;
}

export function extractDates(text, today) {
  const out = { checkIn: null, checkOut: null, monthHint: null };
  // "14-16 Nov", "14 to 16 November 2026"
  let m = text.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:-|–|to|till|until)\\s*(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_RE}(?:\\s*,?\\s*(\\d{4}))?`, 'i'));
  if (m) {
    const mo = monthIndex(m[3]);
    const y = resolveYear(mo, Number(m[1]), today, m[4]);
    const a = `${y}-${pad(mo + 1)}-${pad(m[1])}`;
    const b = `${y}-${pad(mo + 1)}-${pad(m[2])}`;
    if (isValidISODate(a) && isValidISODate(b) && b > a) return { ...out, checkIn: a, checkOut: b };
  }
  // "30 Dec - 2 Jan"
  m = text.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_RE}\\s*(?:-|–|to|till|until)\\s*(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_RE}(?:\\s*,?\\s*(\\d{4}))?`, 'i'));
  if (m) {
    const m1 = monthIndex(m[2]);
    const m2 = monthIndex(m[4]);
    const y1 = resolveYear(m1, Number(m[1]), today, m[5]);
    const y2 = m2 < m1 ? y1 + 1 : y1;
    const a = `${y1}-${pad(m1 + 1)}-${pad(m[1])}`;
    const b = `${y2}-${pad(m2 + 1)}-${pad(m[3])}`;
    if (isValidISODate(a) && isValidISODate(b) && b > a) return { ...out, checkIn: a, checkOut: b };
  }
  // "Feb 2027", "in January" (bare "may" needs a preposition or a year to avoid the verb)
  m = text.match(new RegExp(`\\b${MONTH_RE}\\b(?:\\s*,?\\s*(\\d{4}))?`, 'i'));
  if (m) {
    const mo = monthIndex(m[1]);
    const isMay = m[1].toLowerCase() === 'may';
    const hasLead = new RegExp(`\\b(?:in|of|for|during|by|from|this|next)\\s+${m[1]}\\b`, 'i').test(text);
    if (!isMay || m[2] || hasLead) {
      const y = m[2] ? Number(m[2]) : resolveYear(mo, 28, today);
      out.monthHint = `${y}-${pad(mo + 1)}`;
    }
  }
  return out;
}

export function extractParty(text) {
  const out = { adults: null, children: null, guests: null };
  const adults = text.match(/(\d{1,3})\s*adults?/i);
  if (adults) out.adults = Number(adults[1]);
  const kids = text.match(/\b(\d{1,2}|a|an|one|two|three|four)\s*(?:kids?|child(?:ren)?)\b/i);
  if (kids) out.children = num(kids[1]);
  if (out.adults !== null) out.guests = out.adults + (out.children || 0);
  if (out.guests === null) {
    const g = text.match(/(\d{1,4})\s*\+?\s*(?:guests?|people|pax|persons?|delegates?|members?|attendees?|employees?|staff|folks)\b/i)
      || text.match(/\b(?:team|group|party|batch)\s+of\s+(\d{1,4})\b/i);
    if (g) out.guests = Number(g[1]);
  }
  return out;
}

export function extractNights(text) {
  const m = text.match(/\b(\d{1,2}|one|two|three|four|five|six|seven)\s*nights?\b/i);
  return m ? num(m[1]) : null;
}

export function extractBudget(text) {
  const m =
    text.match(/(?:budget|₹|rs\.?|inr)\s*(?:of|is|around|about|upto|up to|:)?\s*(?:₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d+)?)\s*(lakhs?|lacs?|crores?|cr|l|k)?\b/i)
    || text.match(/\b(\d+(?:\.\d+)?)\s*(lakhs?|lacs?|crores?)\b/i);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  const unit = (m[2] || '').toLowerCase();
  const mult = /^cr/.test(unit) ? 1e7 : /^(l|lac|lakh)/.test(unit) ? 1e5 : unit === 'k' ? 1e3 : 1;
  const v = Math.round(n * mult);
  return v >= 1000 ? v : null;
}

export function classifyByRules(message, today) {
  const scores = {};
  const signals = [];
  for (const [cat, pats] of Object.entries(PATTERNS)) {
    scores[cat] = 0;
    for (const p of pats) if (p.re.test(message)) { scores[cat] += p.weight; signals.push(p.w); }
  }
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topCat, top] = ranked[0];
  const second = ranked[1][1];

  let category = null;
  let confidence = 0.15;
  if (top > 0) {
    category = topCat;
    const margin = (top - second) / (top + second);
    const evidence = Math.min(1, top / 3);
    confidence = Math.min(0.95, (0.45 + 0.5 * margin) * (0.6 + 0.4 * evidence));
  }

  const party = extractParty(message);
  const nights = extractNights(message);
  const dates = extractDates(message, today);
  const nightsFromDates = dates.checkIn && dates.checkOut ? Math.round((Date.parse(dates.checkOut) - Date.parse(dates.checkIn)) / 864e5) : null;
  return {
    category,
    confidence: Math.round(confidence * 100) / 100,
    complaintSignals: scores.complaint,
    signals,
    summary: '',
    extracted: { ...dates, ...party, nights: nights ?? nightsFromDates, budgetInr: extractBudget(message) },
  };
}

export { addDays };
