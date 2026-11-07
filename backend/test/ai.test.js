import assert from 'node:assert/strict';
import test from 'node:test';
import { pickOwner } from '../src/ai/assign.js';
import { classifyEnquiry } from '../src/ai/classify.js';
import { buildDraft, containsPrice } from '../src/ai/draft.js';
import { classifyByRules } from '../src/ai/rules.js';

const today = '2026-11-07';
const threshold = 0.6;
const lane = (c) => (c.category && c.confidence >= threshold ? c.category : 'unsorted');

test('the three sample enquiries from the brief route to the expected category', () => {
  const a = classifyByRules("Venue for my sister's wedding in Feb 2027, about 250 guests, 2 nights", today);
  assert.equal(lane(a), 'wedding');
  assert.deepEqual([a.extracted.guests, a.extracted.nights, a.extracted.monthHint], [250, 2, '2027-02']);

  const b = classifyByRules('Is a villa free 14-16 Nov for 2 adults and a child?', today);
  assert.equal(lane(b), 'room');
  assert.deepEqual([b.extracted.checkIn, b.extracted.checkOut, b.extracted.adults, b.extracted.children], ['2026-11-14', '2026-11-16', 2, 1]);

  const c = classifyByRules('Team of 45 wants a January offsite with a conference hall', today);
  assert.equal(lane(c), 'offsite');
  assert.deepEqual([c.extracted.guests, c.extracted.monthHint], [45, '2027-01']);
});

test('vague messages go to the Unsorted lane, never a guess', () => {
  const v = classifyByRules('hi do you have something nice for the long weekend?', today);
  assert.equal(lane(v), 'unsorted');
  assert.ok(v.confidence < threshold);
});

test('complaints are detected and flagged even when the category is uncertain', () => {
  const c = classifyByRules('The room was dirty and staff were rude. I want a refund.', today);
  assert.equal(c.category, 'complaint');
  const weak = classifyByRules('Need a refund for the booking', today);
  assert.ok(weak.complaintSignals >= 1);          // GM alert still fires
  assert.equal(lane(weak), 'unsorted');           // …while the lane stays unsorted
});

test('budget and date extraction handle Indian formats', () => {
  const r = classifyByRules('Budget ₹3.5 lakh for 120 guests, reception 12-14 Dec', today);
  assert.equal(r.extracted.budgetInr, 350000);
  assert.equal(r.extracted.checkIn, '2026-12-12');
  assert.equal(classifyByRules('rooms on 30 Dec - 2 Jan', today).extracted.checkOut, '2027-01-02');
  assert.equal(classifyByRules('may I ask about rooms', today).extracted.monthHint, null); // "may" the verb
});

const fakeLlm = (obj) => async () => (typeof obj === 'string' ? obj : JSON.stringify(obj));
const good = { category: 'room', confidence: 0.9, summary: 'Villa for 14–16 Nov.', extracted: { checkIn: '2026-11-14', checkOut: '2026-11-16', adults: 2, children: 1 }, draftBody: 'Hello! {{QUOTE}} Happy to help.' };

test('LLM result is used when valid', async () => {
  const r = await classifyEnquiry({ message: 'Is a villa free 14-16 Nov for 2 adults and a child?', today, llm: fakeLlm(good), useLlm: true });
  assert.equal(r.source, 'llm');
  assert.equal(r.category, 'room');
});

test('malformed or failing LLM falls back to rules', async () => {
  for (const llm of [fakeLlm('not json at all'), fakeLlm({ category: 'banana', confidence: 5 }), async () => { throw new Error('timeout'); }]) {
    const r = await classifyEnquiry({ message: 'Is a villa free 14-16 Nov for 2 adults and a child?', today, llm, useLlm: true });
    assert.equal(r.source, 'rules');
    assert.ok(r.warnings.includes('llm_unavailable'));
    assert.equal(r.category, 'room');
  }
});

test('when the LLM contradicts a confident rules match, confidence is capped (-> Unsorted)', async () => {
  const r = await classifyEnquiry({ message: 'Team of 45 wants a January offsite with a conference hall', today, llm: fakeLlm({ ...good, category: 'wedding', confidence: 0.95 }), useLlm: true });
  assert.ok(r.confidence < threshold);
  assert.ok(r.warnings.includes('llm_rules_disagree'));
});

test('LLM dates in the past or invalid are discarded', async () => {
  const r = await classifyEnquiry({ message: 'villa please', today, llm: fakeLlm({ ...good, extracted: { checkIn: '2020-01-01', checkOut: '2020-01-03' } }), useLlm: true });
  assert.equal(r.extracted.checkIn, null);
});

test('price detector', () => {
  for (const t of ['The rate is ₹9,500', 'Rs. 12000 per night', 'about 3 lakh in total', '$200', 'only 9,500 a night', 'INR 5000']) assert.ok(containsPrice(t), t);
  for (const t of ['We have 2 villas for 3 nights', 'Call us on weekdays', '{{QUOTE}} see you soon']) assert.equal(containsPrice(t), false, t);
});

test('drafts: model prose is kept, but any model-written price discards the whole model draft', () => {
  const quote = '• Planter’s Villa: ₹31,860 for 2 nights including GST';
  const ok = buildDraft({ category: 'room', name: 'Arjun Das', extracted: {}, quoteText: quote, llmBody: 'Hello Arjun!\n{{QUOTE}}\nWarm regards' });
  assert.ok(ok.usedModelText && ok.body.includes(quote));
  const bad = buildDraft({ category: 'room', name: 'Arjun Das', extracted: {}, quoteText: quote, llmBody: 'Hello Arjun! A villa costs ₹9,999 a night.' });
  assert.equal(bad.usedModelText, false);
  assert.ok(bad.warnings.includes('ai_draft_had_price_discarded'));
  assert.ok(!bad.body.includes('9,999'));
});

test('event and complaint templates never contain prices; complaints promise nothing specific', () => {
  for (const category of ['wedding', 'offsite', 'complaint']) {
    const d = buildDraft({ category, name: 'Priya', extracted: {} });
    assert.equal(containsPrice(d.body), false);
  }
  assert.match(buildDraft({ category: 'complaint', name: 'X', extracted: {} }).body, /General Manager/);
});

test('owner assignment picks the least-loaded person, ties broken by name', () => {
  const users = [{ _id: 'a', name: 'Meera' }, { _id: 'b', name: 'Rohan' }];
  assert.equal(pickOwner(users, { a: 3, b: 1 })._id, 'b');
  assert.equal(pickOwner(users, {})._id, 'a');
  assert.equal(pickOwner([], {}), null);
});
