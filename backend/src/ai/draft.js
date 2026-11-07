import { config } from '../config.js';

// Drafts are NEVER sent automatically, and PRICES NEVER COME FROM THE MODEL.
// The model may write the prose and a {{QUOTE}} token; the server fills the token from the rate table.
// If the model's text contains anything that looks like a price, the whole model draft is discarded
// and the deterministic template below is used instead.
const PRICE_LIKE = /(₹|\brs\.?\s*\d|\binr\b|\busd\b|\$\s*\d|\b\d[\d,.]*\s*(?:lakhs?|lacs?|crores?|k\b)|\b\d{1,3}(?:,\d{2,3})+\b|\b\d{4,}\s*(?:\/-|per night|a night))/i;

export const containsPrice = (text) => PRICE_LIKE.test(text.replace(/\{\{QUOTE\}\}/g, ''));

const fmtDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const first = (name) => (name || '').trim().split(/\s+/)[0] || 'there';
const SIGN = `Warm regards,\nReservations Desk\n${config.brand}`;

export function missingFields(category, ex) {
  const miss = [];
  const hasDates = (ex.checkIn && ex.checkOut) || ex.monthHint;
  if (!hasDates) miss.push('your preferred dates');
  if (!ex.guests && !ex.adults) miss.push(category === 'room' ? 'the number of adults and children' : 'the expected number of guests');
  if (category === 'wedding' || category === 'offsite') {
    if (!ex.nights) miss.push('how many nights you would like to stay');
    if (!ex.budgetInr) miss.push('a rough budget, if you have one in mind');
  }
  return miss;
}

const askLine = (miss) => (miss.length ? `To prepare a proper proposal, could you share ${miss.join(', ').replace(/, ([^,]*)$/, ' and $1')}?` : '');

export function templateDraft({ category, name, extracted, quoteText }) {
  const hi = `Dear ${first(name)},`;
  const miss = missingFields(category, extracted || {});
  switch (category) {
    case 'room':
      return [hi, '', 'Thank you for writing to us.', '', quoteText || 'Share your dates and the number of guests and I will check what is open on our website allotment right away.', '', askLine(miss), '', 'You can book instantly on our website with the rate plan you prefer.', '', SIGN].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
    case 'wedding':
      return [hi, '', 'Congratulations, and thank you for considering the estate for your wedding. Our lawns and villas suit intimate celebrations as well as larger gatherings.', '', askLine(miss), '', 'Our events team will call you to understand your plans and prepare a tailored proposal with venue, stay and catering options.', '', SIGN].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
    case 'offsite':
      return [hi, '', 'Thank you for thinking of us for your team offsite. We host groups with a conference hall, stays across rooms and villas, and outdoor sessions on the estate.', '', askLine(miss), '', 'Our events team will follow up with a proposal covering the hall, accommodation and meals.', '', SIGN].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
    case 'complaint':
      return [hi, '', 'I am sorry that your experience with us fell short. This matters to us and I would like to put it right.', '', 'Our General Manager has been told about your message and will call you personally. If there is a time that suits you best, please reply and we will plan around it.', '', SIGN].join('\n');
    default:
      return [hi, '', 'Thank you for writing to us. Could you tell us a little more about what you are planning (dates, number of guests and the kind of stay or event) so we can point you to the right person?', '', SIGN].join('\n');
  }
}

/** Builds the final draft. quoteText comes from the rate table; llmBody (optional) may only supply prose. */
export function buildDraft({ category, name, extracted, quoteText, llmBody }) {
  const warnings = [];
  if (llmBody) {
    if (containsPrice(llmBody)) {
      warnings.push('ai_draft_had_price_discarded');
    } else if (llmBody.includes('{{QUOTE}}') && !quoteText && category === 'room') {
      // Token present but we have no real quote: remove it rather than invent one.
      return { body: llmBody.replace(/\{\{QUOTE\}\}\s*/g, ''), warnings, usedModelText: true };
    } else {
      return { body: llmBody.replace(/\{\{QUOTE\}\}/g, quoteText || ''), warnings, usedModelText: true };
    }
  }
  return { body: templateDraft({ category, name, extracted, quoteText }), warnings, usedModelText: false };
}
