import { classifyEnquiry } from '../ai/classify.js';
import { buildDraft, missingFields } from '../ai/draft.js';
import { pickOwner, ROLE_FOR_LANE } from '../ai/assign.js';
import { config } from '../config.js';
import { eachNight, todayIST, validateStay } from '../lib/dates.js';
import { Counter, Enquiry, Notification, User } from '../models/index.js';
import { searchStay } from './availability.js';

const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
const fmt = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Real availability + prices for the draft — straight from the rate table, never from the model. */
export async function buildQuoteText(extracted) {
  const { checkIn, checkOut } = extracted;
  if (!checkIn || !checkOut || !validateStay(checkIn, checkOut).ok) return null;
  const adults = extracted.adults || Math.max(1, (extracted.guests || 2) - (extracted.children || 0));
  const res = await searchStay({ checkIn, checkOut, adults, children: extracted.children || 0, rooms: 1 });
  const open = res.filter((r) => r.left > 0 && r.plans.length);
  const n = eachNight(checkIn, checkOut).length;
  if (!open.length) {
    return `I checked ${fmt(checkIn)}–${fmt(checkOut)} and our website allotment is full for your party. I will ask reservations to look at what else we can release and come back to you today.`;
  }
  const lines = open.map((r) => {
    const q = (r.plans.find((p) => p.code === 'flex') || r.plans[0]).quote;
    return `• ${r.roomType.name}: ${inr(q.total)} for ${n} night${n > 1 ? 's' : ''} including GST (${r.left > 3 ? 'available' : `only ${r.left} left`})`;
  });
  return `For ${fmt(checkIn)}–${fmt(checkOut)} we currently have:\n${lines.join('\n')}\nThese are our flexible-rate prices; breakfast and advance-saver rates are shown when you book on the website.`;
}

async function nextRef() {
  const c = await Counter.findOneAndUpdate({ _id: 'enquiry' }, { $inc: { seq: 1 } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  return `ENQ-${4409 + c.seq}`;
}

export async function assignOwner(lane) {
  const users = await User.find({ role: ROLE_FOR_LANE[lane] }).lean();
  const counts = {};
  const agg = await Enquiry.aggregate([{ $match: { status: 'new', owner: { $in: users.map((u) => u._id) } } }, { $group: { _id: '$owner', n: { $sum: 1 } } }]);
  for (const a of agg) counts[a._id] = a.n;
  return pickOwner(users, counts);
}

async function alertGm(enquiry, text) {
  const gms = await User.find({ role: 'gm' }).lean();
  await Notification.insertMany(gms.map((g) => ({ user: g._id, enquiry: enquiry._id, type: 'complaint_alert', text })));
  console.log(`[alert→GM, simulated WhatsApp/SMS] ${text}`);
}

/**
 * The router. channel: web | event_form | email | whatsapp.
 * form (optional) = structured event details, which fix the category with full confidence.
 */
export async function routeEnquiry({ channel, name, contact, message, form, consent = true }, { now = Date.now() } = {}) {
  const today = todayIST(now);
  const ai = await classifyEnquiry({ message, today });
  let category = ai.category;
  let confidence = ai.confidence;
  const warnings = [...ai.warnings];

  if (form?.eventType) {
    // Structured form: the guest told us what it is. Trust that over text inference.
    category = form.eventType === 'wedding' ? 'wedding' : 'offsite';
    confidence = 1;
    ai.extracted = {
      ...ai.extracted,
      guests: form.guests ?? ai.extracted.guests,
      nights: form.nights ?? ai.extracted.nights,
      budgetInr: form.budgetInr ?? ai.extracted.budgetInr,
      checkIn: form.startDate || ai.extracted.checkIn,
      checkOut: form.endDate || ai.extracted.checkOut,
      monthHint: form.startDate ? null : (form.flexibleMonth || ai.extracted.monthHint),
    };
  }

  const lane = category && confidence >= config.confidenceThreshold ? category : 'unsorted';
  const gmAlert = lane === 'complaint' || ai.complaintSignals >= 1;
  const owner = await assignOwner(lane);

  const quoteText = category === 'room' ? await buildQuoteText(ai.extracted) : null;
  const draft = buildDraft({ category: category || 'other', name, extracted: ai.extracted, quoteText, llmBody: ai.draftBody });
  warnings.push(...draft.warnings);
  if (lane === 'unsorted') warnings.push('low_confidence');

  const doc = await Enquiry.create({
    ref: await nextRef(), channel, name, contact, message, form, lane, owner: owner?._id, gmAlert,
    consentAt: consent ? new Date() : undefined,
    ai: { category, confidence, source: ai.source, summary: ai.summary || summarise(category, ai.extracted), signals: ai.signals, extracted: ai.extracted, warnings, draft: draft.body, draftUsedModelText: draft.usedModelText },
    history: [{ at: new Date(), by: 'router', action: 'routed', note: `${lane} (${Math.round(confidence * 100)}%, ${ai.source})${owner ? ` → ${owner.name}` : ''}` }],
  });
  if (gmAlert) await alertGm(doc, `${doc.ref}: possible complaint — ${message.slice(0, 90)}`);
  return doc;
}

function summarise(category, ex) {
  const bits = [];
  if (ex.guests) bits.push(`${ex.guests} guests`);
  if (ex.checkIn && ex.checkOut) bits.push(`${fmt(ex.checkIn)}–${fmt(ex.checkOut)}`);
  else if (ex.monthHint) bits.push(ex.monthHint);
  if (ex.nights) bits.push(`${ex.nights} nights`);
  if (ex.budgetInr) bits.push(`budget ${inr(ex.budgetInr)}`);
  return `${category || 'Unclear'} enquiry${bits.length ? ': ' + bits.join(', ') : ''}.`;
}

/** Re-draft for a (possibly new) category without the model: used after a one-click re-route. */
export async function redraft(enquiry, category) {
  const ex = enquiry.ai?.extracted || {};
  const quoteText = category === 'room' ? await buildQuoteText(ex) : null;
  return buildDraft({ category, name: enquiry.name, extracted: ex, quoteText });
}
export { missingFields };
