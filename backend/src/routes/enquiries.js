import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { ROLE_FOR_LANE } from '../ai/assign.js';
import { config } from '../config.js';
import { badRequest, HttpError, notFound } from '../lib/errors.js';
import { requireRole, STAFF } from '../middleware/auth.js';
import { wrap } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { Enquiry, User } from '../models/index.js';
import { assignOwner, redraft, routeEnquiry } from '../services/enquiryRouter.js';
import { ingestBody, webEnquiry } from './schemas.js';
import crypto from 'node:crypto';

const r = Router();
const staff = requireRole(...STAFF);
const publicLimiter = rateLimit({ windowMs: 10 * 60_000, limit: 15, standardHeaders: true, legacyHeaders: false, message: { error: { code: 'rate_limited', message: 'Too many enquiries from this connection. Please call us instead.' } } });
const LANES = ['room', 'wedding', 'offsite', 'complaint', 'unsorted'];
const view = (e, full = false) => ({
  id: e._id, ref: e.ref, channel: e.channel, name: e.name, contact: e.contact, lane: e.lane, status: e.status,
  gmAlert: e.gmAlert, owner: e.owner ? { id: e.owner._id, name: e.owner.name, role: e.owner.role } : null,
  preview: e.message.slice(0, 140), createdAt: e.createdAt, confidence: e.ai?.confidence, summary: e.ai?.summary, firstReplyAt: e.firstReplyAt,
  ...(full ? { message: e.message, form: e.form, ai: e.ai, replies: e.replies, history: e.history } : {}),
});

// Public: website contact form + structured event form. Rate limited, validated, consent required.
r.post('/web', publicLimiter, validate(webEnquiry), wrap(async (req, res) => {
  const { name, contact, form, consent } = req.body;
  const message = req.body.message || (form ? `${form.eventType} for ${form.guests} guests${form.notes ? `. ${form.notes}` : ''}` : '');
  const doc = await routeEnquiry({ channel: form ? 'event_form' : 'web', name, contact, message, form, consent });
  res.status(201).json({ ref: doc.ref });
}));

// Simulated inbound channel: a forwarded email or a WhatsApp webhook. Staff session OR shared-secret header.
r.post('/ingest', validate(ingestBody), wrap(async (req, res) => {
  const key = req.get('x-ingest-key');
  const keyOk = config.ingestKey && key && key.length === config.ingestKey.length && crypto.timingSafeEqual(Buffer.from(key), Buffer.from(config.ingestKey));
  if (!keyOk && !(req.user && STAFF.includes(req.user.role))) throw new HttpError(401, 'Not allowed.', 'unauthenticated');
  const { channel, from, message } = req.body;
  const doc = await routeEnquiry({ channel, name: from, contact: from, message, consent: false });
  res.status(201).json({ ref: doc.ref, lane: doc.lane });
}));

r.get('/', staff, validate(z.object({ lane: z.enum(LANES).optional(), status: z.enum(['new', 'replied', 'closed']).optional() }), 'query'), wrap(async (req, res) => {
  const f = {};
  if (req.query.lane) f.lane = req.query.lane;
  if (req.query.status) f.status = req.query.status;
  const items = await Enquiry.find(f).sort({ createdAt: -1 }).limit(200).populate('owner', 'name role').lean();
  const replied = items.filter((e) => e.firstReplyAt).map((e) => (e.firstReplyAt - e.createdAt) / 60000).sort((a, b) => a - b);
  const median = replied.length ? Math.round(replied[Math.floor(replied.length / 2)]) : null;
  res.json({
    enquiries: items.map((e) => view(e)),
    stats: { open: items.filter((e) => e.status === 'new').length, unsorted: items.filter((e) => e.lane === 'unsorted' && e.status === 'new').length, medianFirstReplyMinutes: median },
  });
}));

r.get('/staff', staff, wrap(async (_req, res) => res.json({ staff: await User.find({ role: { $in: STAFF } }).select('name role').lean() })));

r.get('/:id', staff, wrap(async (req, res) => {
  const e = await Enquiry.findById(req.params.id).populate('owner', 'name role').lean();
  if (!e) throw notFound();
  res.json({ enquiry: view(e, true) });
}));

// One-click re-route: change the lane (and optionally the owner). Drafts are regenerated from templates + rate table.
r.patch('/:id', staff, validate(z.object({ lane: z.enum(LANES).optional(), ownerId: z.string().regex(/^[a-f0-9]{24}$/).optional(), status: z.enum(['new', 'closed']).optional() })), wrap(async (req, res) => {
  const e = await Enquiry.findById(req.params.id);
  if (!e) throw notFound();
  const { lane, ownerId, status } = req.body;
  const note = [];
  if (lane && lane !== e.lane) {
    note.push(`lane ${e.lane} → ${lane}`);
    e.lane = lane;
    if (!ownerId) e.owner = (await assignOwner(lane))?._id;
    if (lane !== 'unsorted') {
      const d = await redraft(e, lane);
      e.ai.draft = d.body;
      e.ai.category = lane;
      e.ai.warnings = (e.ai.warnings || []).filter((w) => w !== 'low_confidence');
    }
    if (lane === 'complaint') e.gmAlert = true;
  }
  if (ownerId) {
    const u = await User.findOne({ _id: ownerId, role: { $in: STAFF } }).lean();
    if (!u) throw badRequest('Pick a staff member.');
    e.owner = u._id;
    note.push(`owner → ${u.name}`);
  }
  if (status) { e.status = status; note.push(`status → ${status}`); }
  if (!note.length) return res.json({ enquiry: view(await Enquiry.findById(e._id).populate('owner', 'name role').lean(), true) });
  e.history.push({ at: new Date(), by: req.user.name, action: 'updated', note: note.join(', ') });
  await e.save();
  res.json({ enquiry: view(await Enquiry.findById(e._id).populate('owner', 'name role').lean(), true) });
}));

// A human approves and "sends" the reply. In this build the send is simulated (stored, not delivered).
r.post('/:id/reply', staff, validate(z.object({ body: z.string().trim().min(5).max(4000) })), wrap(async (req, res) => {
  const e = await Enquiry.findById(req.params.id);
  if (!e) throw notFound();
  const now = new Date();
  e.replies.push({ body: req.body.body, by: req.user._id, sentAt: now, simulated: true });
  if (!e.firstReplyAt) e.firstReplyAt = now;
  e.status = 'replied';
  e.history.push({ at: now, by: req.user.name, action: 'replied', note: `via ${e.channel} (simulated)` });
  await e.save();
  res.json({ ok: true });
}));

export { ROLE_FOR_LANE };
export default r;
