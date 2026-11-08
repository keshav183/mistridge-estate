import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { addDays, isValidISODate, todayIST } from '../lib/dates.js';
import { notFound } from '../lib/errors.js';
import { wrap } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { Booking, RatePlan, RoomType } from '../models/index.js';
import { roomCalendar, searchStay } from '../services/availability.js';
import { createBooking, priceStay, publicBooking } from '../services/booking.js';
import { bookingBody, email, isoDate, priceBody, stayQuery } from './schemas.js';

const r = Router();
const strict = rateLimit({ windowMs: 10 * 60_000, limit: 40, standardHeaders: true, legacyHeaders: false, message: { error: { code: 'rate_limited', message: 'Too many requests. Please wait a moment.' } } });

r.get('/rooms', wrap(async (_req, res) => {
  const rooms = await RoomType.find({ active: true }).sort({ order: 1 }).select('-__v').lean();
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ rooms });
}));
r.get('/rooms/:slug', wrap(async (req, res) => {
  const room = await RoomType.findOne({ slug: req.params.slug, active: true }).select('-__v').lean();
  if (!room) throw notFound('Room not found');
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ room });
}));
r.get('/rateplans', wrap(async (_req, res) => res.json({ plans: await RatePlan.find({ active: true }).sort({ order: 1 }).select('-__v').lean() })));

r.get('/availability', validate(stayQuery, 'query'), wrap(async (req, res) => res.json({ results: await searchStay(req.query) })));

r.get('/availability/calendar', validate(z.object({ room: z.string().max(60), from: isoDate.optional() }), 'query'), wrap(async (req, res) => {
  const from = req.query.from && req.query.from >= todayIST() ? req.query.from : todayIST();
  const days = await roomCalendar(req.query.room, from, addDays(from, 92));
  if (!days) throw notFound('Room not found');
  res.json({ days });
}));

r.post('/price', validate(priceBody), wrap(async (req, res) => {
  const p = await priceStay(req.body);
  res.json({ quote: p.quote, promoApplied: Boolean(p.promo), promoMessage: p.promoMessage });
}));

r.post('/bookings', strict, validate(bookingBody), wrap(async (req, res) => {
  const key = String(req.get('Idempotency-Key') || '').slice(0, 80) || undefined;
  const { booking, replayed } = await createBooking(req.body, { idempotencyKey: key });
  res.status(replayed ? 200 : 201).json({ booking: publicBooking(booking) });
}));

// Lookup needs BOTH the code and the email, so codes cannot be enumerated to read personal data.
r.get('/bookings/lookup', strict, validate(z.object({ code: z.string().trim().toUpperCase().max(20), email }), 'query'), wrap(async (req, res) => {
  const b = await Booking.findOne({ code: req.query.code, 'guest.email': req.query.email }).lean();
  if (!b) throw notFound('We could not find a booking with those details.');
  res.json({ booking: publicBooking(b) });
}));

export default r;
