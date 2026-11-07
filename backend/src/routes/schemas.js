import { z } from 'zod';
import { isValidISODate } from '../lib/dates.js';

export const isoDate = z.string().refine(isValidISODate, 'Use a valid date (YYYY-MM-DD).');
const text = (max) => z.string().trim().max(max);
export const phone = z.string().trim().regex(/^\+?[0-9 ()-]{8,16}$/, 'Enter a valid phone number.');
export const email = z.string().trim().toLowerCase().email('Enter a valid email address.').max(120);

export const stayQuery = z.object({
  checkIn: isoDate,
  checkOut: isoDate,
  adults: z.coerce.number().int().min(1).max(8).default(2),
  children: z.coerce.number().int().min(0).max(6).default(0),
  rooms: z.coerce.number().int().min(1).max(3).default(1),
});

export const priceBody = z.object({
  roomSlug: z.string().min(1).max(60),
  planCode: z.string().min(1).max(30),
  checkIn: isoDate,
  checkOut: isoDate,
  rooms: z.coerce.number().int().min(1).max(3).default(1),
  promoCode: z.string().trim().max(20).optional().or(z.literal('').transform(() => undefined)),
});

export const bookingBody = priceBody.extend({
  adults: z.number().int().min(1).max(8),
  children: z.number().int().min(0).max(6).default(0),
  guest: z.object({ name: text(80).min(2, 'Enter the guest name.'), email, phone }),
  specialRequests: text(500).optional(),
  consent: z.literal(true, { errorMap: () => ({ message: 'Please accept the privacy notice to continue.' }) }),
  payment: z.object({
    number: z.string().trim().max(23),
    expMonth: z.number().int().min(1).max(12),
    expYear: z.number().int().min(0).max(2100),
    cvc: z.string().trim().regex(/^\d{3,4}$/, 'Enter the security code.'),
  }),
});

export const eventForm = z.object({
  eventType: z.enum(['wedding', 'offsite', 'celebration']),
  guests: z.number().int().min(10).max(2000),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  flexibleMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  nights: z.number().int().min(1).max(10).optional(),
  roomsNeeded: z.number().int().min(0).max(76).optional(),
  budgetInr: z.number().int().min(0).max(1e9).optional(),
  notes: text(1500).optional(),
});

export const webEnquiry = z.object({
  name: text(80).min(2, 'Enter your name.'),
  contact: z.string().trim().min(5, 'Enter an email or phone number.').max(120),
  message: text(2000).optional().default(''),
  form: eventForm.optional(),
  consent: z.literal(true, { errorMap: () => ({ message: 'Please accept the privacy notice to continue.' }) }),
}).refine((d) => d.message.length >= 5 || d.form, { path: ['message'], message: 'Tell us a little about what you need.' });

export const ingestBody = z.object({
  channel: z.enum(['email', 'whatsapp']),
  from: text(120).min(2),
  message: text(4000).min(5),
});
