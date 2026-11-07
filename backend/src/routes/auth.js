import bcrypt from 'bcryptjs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { HttpError } from '../lib/errors.js';
import { clearSession, requireAuth, setSession } from '../middleware/auth.js';
import { wrap } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { User } from '../models/index.js';
import { email } from './schemas.js';

const r = Router();
const limiter = rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: { code: 'rate_limited', message: 'Too many attempts. Try again in a few minutes.' } } });
const password = z.string().min(8, 'Use at least 8 characters.').max(100);
const view = (u) => ({ id: String(u._id), name: u.name, email: u.email, role: u.role });

r.post('/register', limiter, validate(z.object({ name: z.string().trim().min(2).max(80), email, password })), wrap(async (req, res) => {
  const { name, email: mail, password: pw } = req.body;
  if (await User.exists({ email: mail })) throw new HttpError(409, 'An account with this email already exists.', 'duplicate');
  const user = await User.create({ name, email: mail, passwordHash: await bcrypt.hash(pw, 11), role: 'guest' }); // public sign-up can only ever create guests
  setSession(res, user);
  res.status(201).json({ user: view(user) });
}));

r.post('/login', limiter, validate(z.object({ email, password: z.string().min(1).max(100) })), wrap(async (req, res) => {
  const user = await User.findOne({ email: req.body.email }).select('+passwordHash');
  const ok = user && (await bcrypt.compare(req.body.password, user.passwordHash));
  if (!ok) throw new HttpError(401, 'Email or password is incorrect.', 'bad_credentials');
  setSession(res, user);
  res.json({ user: view(user) });
}));

r.post('/logout', (_req, res) => { clearSession(res); res.json({ ok: true }); });
r.get('/me', (req, res) => res.json({ user: req.user ? { id: req.user._id, name: req.user.name, email: req.user.email, role: req.user.role } : null }));
r.get('/me/bookings', requireAuth, wrap(async (req, res) => {
  const { Booking } = await import('../models/index.js');
  const { publicBooking } = await import('../services/booking.js');
  const items = await Booking.find({ $or: [{ user: req.user._id }, { 'guest.email': req.user.email }] }).sort({ createdAt: -1 }).limit(50).lean();
  res.json({ bookings: items.map(publicBooking) });
}));
export default r;
