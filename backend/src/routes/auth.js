import bcrypt from 'bcryptjs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { HttpError } from '../lib/errors.js';
import { clearSession, setSession } from '../middleware/auth.js';
import { wrap } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { User } from '../models/index.js';
import { email } from './schemas.js';

// Sign-in is for staff only. Guests book without an account.
const r = Router();
const limiter = rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: { code: 'rate_limited', message: 'Too many attempts. Try again in a few minutes.' } } });
const view = (u) => ({ id: String(u._id), name: u.name, email: u.email, role: u.role });

r.post('/login', limiter, validate(z.object({ email, password: z.string().min(1).max(100) })), wrap(async (req, res) => {
  const user = await User.findOne({ email: req.body.email }).select('+passwordHash');
  const ok = user && (await bcrypt.compare(req.body.password, user.passwordHash));
  if (!ok) throw new HttpError(401, 'Email or password is incorrect.', 'bad_credentials');
  setSession(res, user);
  res.json({ user: view(user) });
}));
r.post('/logout', (_req, res) => { clearSession(res); res.json({ ok: true }); });
r.get('/me', (req, res) => res.json({ user: req.user ? { id: req.user._id, name: req.user.name, email: req.user.email, role: req.user.role } : null }));
export default r;
