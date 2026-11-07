import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { HttpError } from '../lib/errors.js';
import { User } from '../models/index.js';

export const STAFF = ['reservations', 'sales', 'gm'];
const COOKIE = 'mr_session';

export function setSession(res, user) {
  const token = jwt.sign({ sub: String(user._id), role: user.role }, config.jwtSecret, { expiresIn: '7d' });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.env === 'production',
    maxAge: 7 * 24 * 3600 * 1000,
  });
}
export const clearSession = (res) => res.clearCookie(COOKIE);

/** Attaches req.user if a valid session exists; never blocks. */
export async function loadUser(req, _res, next) {
  try {
    const token = req.cookies?.[COOKIE];
    if (token) {
      const { sub } = jwt.verify(token, config.jwtSecret);
      const user = await User.findById(sub).lean();
      if (user) req.user = { _id: String(user._id), name: user.name, email: user.email, role: user.role };
    }
  } catch { /* invalid/expired token => treated as signed out */ }
  next();
}

export const requireAuth = (req, _res, next) =>
  req.user ? next() : next(new HttpError(401, 'Please sign in.', 'unauthenticated'));

export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user) return next(new HttpError(401, 'Please sign in.', 'unauthenticated'));
  if (!roles.includes(req.user.role)) return next(new HttpError(403, 'You do not have access to this.', 'forbidden'));
  next();
};
