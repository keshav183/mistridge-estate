import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { Router } from 'express';
import { config } from '../config.js';
import { z } from 'zod';
import { addDays, diffDays, isValidISODate, todayIST, weekday } from '../lib/dates.js';
import { toCsv } from '../lib/csv.js';
import { badRequest, notFound } from '../lib/errors.js';
import { requireRole } from '../middleware/auth.js';
import { wrap } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { Booking, Inventory, Notification, PromoCode, RoomType } from '../models/index.js';
import { cancelBooking } from '../services/booking.js';
import { isoDate } from './schemas.js';

const r = Router();
const inventoryRoles = requireRole('reservations', 'gm');

// ---- Rates, allotment, blackout ------------------------------------------------------------
r.get('/inventory', inventoryRoles, validate(z.object({ from: isoDate, days: z.coerce.number().int().min(1).max(62).default(14) }), 'query'), wrap(async (req, res) => {
  const to = addDays(req.query.from, req.query.days - 1);
  const [types, rows] = await Promise.all([
    RoomType.find({ active: true }).sort({ order: 1 }).select('name slug units kind').lean(),
    Inventory.find({ date: { $gte: req.query.from, $lte: to } }).lean(),
  ]);
  res.json({ from: req.query.from, to, roomTypes: types, rows: rows.map((x) => ({ roomType: x.roomType, date: x.date, rate: x.rate, allotment: x.allotment, sold: x.sold, blackout: x.blackout })) });
}));

const bulk = z.object({
  roomTypeId: z.string().regex(/^[a-f0-9]{24}$/),
  from: isoDate,
  to: isoDate,
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(), // 0 = Sunday
  rate: z.number().int().min(500).max(500000).optional(),
  allotment: z.number().int().min(0).max(200).optional(),
  blackout: z.boolean().optional(),
}).refine((d) => d.rate !== undefined || d.allotment !== undefined || d.blackout !== undefined, { message: 'Change at least one of rate, allotment or blackout.' });

r.put('/inventory/bulk', inventoryRoles, validate(bulk), wrap(async (req, res) => {
  const { roomTypeId, from, to, weekdays, rate, allotment, blackout } = req.body;
  if (to < from) throw badRequest('The end date is before the start date.');
  if (diffDays(from, to) > 400) throw badRequest('Change at most 400 days at a time.');
  const type = await RoomType.findById(roomTypeId).lean();
  if (!type) throw notFound('Room type not found');
  if (allotment !== undefined && allotment > type.units) throw badRequest(`Allotment cannot exceed the ${type.units} ${type.name} units the property has.`);

  const dates = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (!weekdays?.length || weekdays.includes(weekday(d))) dates.push(d);
  if (!dates.length) throw badRequest('No dates match that range and weekday selection.');

  // Make sure a row exists for every date (new dates default to a closed, zero-allotment night at the given rate).
  await Inventory.bulkWrite(dates.map((date) => ({ updateOne: { filter: { roomType: roomTypeId, date }, update: { $setOnInsert: { rate: rate ?? 0, allotment: 0, sold: 0, blackout: false } }, upsert: true } })));

  const set = {};
  if (rate !== undefined) set.rate = rate;
  if (blackout !== undefined) set.blackout = blackout;
  let skipped = 0;
  let modified = 0;
  if (allotment !== undefined) {
    // Never drop allotment below what is already sold.
    const ok = await Inventory.updateMany({ roomType: roomTypeId, date: { $in: dates }, sold: { $lte: allotment } }, { $set: { ...set, allotment } });
    modified = ok.modifiedCount;
    skipped = dates.length - (await Inventory.countDocuments({ roomType: roomTypeId, date: { $in: dates }, allotment }));
    if (Object.keys(set).length) {
      await Inventory.updateMany({ roomType: roomTypeId, date: { $in: dates }, sold: { $gt: allotment } }, { $set: set });
    }
  } else {
    modified = (await Inventory.updateMany({ roomType: roomTypeId, date: { $in: dates } }, { $set: set })).modifiedCount;
  }
  res.json({ dates: dates.length, modified, skippedBelowSold: Math.max(0, skipped) });
}));

// ---- Room photos ---------------------------------------------------------------------------
// Staff upload JPEG/PNG/WebP (the browser shrinks them to <=1600px first, so pages stay light on slow networks).
// The file type is checked from its first bytes, never from the file name or the header the client sends.
const uploadDir = path.resolve(config.uploadDir);
const MAX_PHOTOS = 8;
const sniff = (b) => (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff ? '.jpg' : b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) ? '.png' : b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' ? '.webp' : null);
const roomById = async (id) => { const room = await RoomType.findById(id); if (!room) throw notFound('Room type not found'); return room; };

r.get('/rooms', inventoryRoles, wrap(async (_req, res) => res.json({ rooms: await RoomType.find().sort({ order: 1 }).select('name slug photos').lean() })));

r.post('/rooms/:id/photos', inventoryRoles, express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '4mb' }), wrap(async (req, res) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw badRequest('Choose a JPEG, PNG or WebP image (up to 4 MB).');
  const ext = sniff(req.body);
  if (!ext) throw badRequest('That file is not a JPEG, PNG or WebP image.');
  const room = await roomById(req.params.id);
  if (room.photos.length >= MAX_PHOTOS) throw badRequest(`A room can have at most ${MAX_PHOTOS} photos. Delete one first.`);
  fs.mkdirSync(uploadDir, { recursive: true });
  const name = `${crypto.randomUUID()}${ext}`;
  fs.writeFileSync(path.join(uploadDir, name), req.body);
  const alt = String(req.query.alt || '').trim().slice(0, 120) || `${room.name}, photo ${room.photos.length + 1}`;
  room.photos.push({ url: `/uploads/${name}`, alt });
  await room.save();
  res.status(201).json({ photos: room.photos });
}));

r.patch('/rooms/:id/photos/:index/cover', inventoryRoles, wrap(async (req, res) => {
  const room = await roomById(req.params.id);
  const i = Number(req.params.index);
  if (!Number.isInteger(i) || i < 0 || i >= room.photos.length) throw notFound('Photo not found');
  const [p] = room.photos.splice(i, 1);
  room.photos.unshift(p);
  await room.save();
  res.json({ photos: room.photos });
}));

r.delete('/rooms/:id/photos/:index', inventoryRoles, wrap(async (req, res) => {
  const room = await roomById(req.params.id);
  const i = Number(req.params.index);
  if (!Number.isInteger(i) || i < 0 || i >= room.photos.length) throw notFound('Photo not found');
  const [p] = room.photos.splice(i, 1);
  await room.save();
  if (p.url?.startsWith('/uploads/')) fs.rm(path.join(uploadDir, path.basename(p.url)), { force: true }, () => {});
  res.json({ photos: room.photos });
}));

// ---- Promo codes ---------------------------------------------------------------------------
const promoBody = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{3,20}$/, 'Use 3–20 letters or digits.'),
  description: z.string().trim().max(120).optional(),
  type: z.enum(['percent', 'flat']),
  value: z.number().int().min(1).max(100000),
  maxDiscount: z.number().int().min(1).optional(),
  minNights: z.number().int().min(1).max(14).optional(),
  validFrom: isoDate.optional(),
  validTo: isoDate.optional(),
  maxUses: z.number().int().min(1).optional(),
}).refine((p) => p.type !== 'percent' || p.value <= 90, { path: ['value'], message: 'A percentage code can be at most 90%.' });

r.get('/promos', inventoryRoles, wrap(async (_req, res) => res.json({ promos: await PromoCode.find().sort({ createdAt: -1 }).lean() })));
r.post('/promos', inventoryRoles, validate(promoBody), wrap(async (req, res) => res.status(201).json({ promo: await PromoCode.create(req.body) })));
r.patch('/promos/:id', inventoryRoles, validate(z.object({ active: z.boolean() })), wrap(async (req, res) => {
  const p = await PromoCode.findByIdAndUpdate(req.params.id, { active: req.body.active }, { new: true }).lean();
  if (!p) throw notFound();
  res.json({ promo: p });
}));

// ---- Bookings + daily export ---------------------------------------------------------------
r.get('/bookings', inventoryRoles, validate(z.object({ status: z.enum(['confirmed', 'cancelled']).optional(), q: z.string().trim().max(60).optional() }), 'query'), wrap(async (req, res) => {
  const f = {};
  if (req.query.status) f.status = req.query.status;
  if (req.query.q) {
    const q = req.query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    f.$or = [{ code: new RegExp(q, 'i') }, { 'guest.name': new RegExp(q, 'i') }, { 'guest.email': new RegExp(q, 'i') }];
  }
  const items = await Booking.find(f).sort({ createdAt: -1 }).limit(100).lean();
  res.json({ bookings: items.map((b) => ({ id: b._id, code: b.code, status: b.status, roomName: b.roomName, plan: b.ratePlan?.name, checkIn: b.checkIn, checkOut: b.checkOut, rooms: b.rooms, guest: b.guest, total: b.pricing?.total, createdAt: b.createdAt })) });
}));
r.post('/bookings/:id/cancel', inventoryRoles, wrap(async (req, res) => { await cancelBooking(req.params.id); res.json({ ok: true }); }));

// One row per booking created (or cancelled) on the chosen day, in a flat layout a reservation system can import.
r.get('/export/bookings.csv', inventoryRoles, validate(z.object({ date: isoDate.default(() => todayIST()) }), 'query'), wrap(async (req, res) => {
  const d = req.query.date;
  const items = await Booking.find({ createdDay: d }).sort({ createdAt: 1 }).lean();
  const header = ['booking_code', 'status', 'created_date', 'check_in', 'check_out', 'nights', 'room_type', 'rate_plan', 'rooms', 'adults', 'children', 'guest_name', 'guest_email', 'guest_phone', 'room_revenue_inr', 'discount_inr', 'gst_inr', 'total_inr', 'promo_code', 'payment_status', 'special_requests'];
  const rows = items.map((b) => [b.code, b.status, b.createdDay, b.checkIn, b.checkOut, b.nights, b.roomName, b.ratePlan?.code, b.rooms, b.adults, b.children, b.guest?.name, b.guest?.email, b.guest?.phone, b.pricing?.taxable, b.pricing?.discount, b.pricing?.gst, b.pricing?.total, b.promoCode, b.payment?.status, b.specialRequests]);
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="mistridge-bookings-${d}.csv"` });
  res.send('\uFEFF' + toCsv(header, rows));
}));

// ---- Notifications (GM alerts) -------------------------------------------------------------
r.get('/notifications', requireRole('reservations', 'sales', 'gm'), wrap(async (req, res) => {
  const items = await Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(20).populate('enquiry', 'ref').lean();
  res.json({ notifications: items.map((n) => ({ id: n._id, text: n.text, enquiryId: n.enquiry?._id, ref: n.enquiry?.ref, read: Boolean(n.readAt), at: n.createdAt })) });
}));
r.post('/notifications/read', requireRole('reservations', 'sales', 'gm'), wrap(async (req, res) => {
  await Notification.updateMany({ user: req.user._id, readAt: null }, { readAt: new Date() });
  res.json({ ok: true });
}));

export default r;
