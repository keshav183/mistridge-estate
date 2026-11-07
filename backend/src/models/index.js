import mongoose from 'mongoose';
const { Schema, model, models } = mongoose;
const ref = (name) => ({ type: Schema.Types.ObjectId, ref: name });
const def = (name, schema) => models[name] || model(name, schema);

export const User = def('User', new Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['guest', 'reservations', 'sales', 'gm'], default: 'guest', index: true },
}, { timestamps: true }));

export const RoomType = def('RoomType', new Schema({
  slug: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  kind: { type: String, enum: ['room', 'villa'], required: true },
  tagline: String,
  description: String,
  units: { type: Number, required: true },        // physical inventory
  maxAdults: { type: Number, required: true },
  maxGuests: { type: Number, required: true },    // adults + children per unit
  sizeSqft: Number,
  bed: String,
  amenities: [String],
  photos: [{ url: String, alt: String }],
  order: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
}));

export const RatePlan = def('RatePlan', new Schema({
  code: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: String,
  adjustPct: { type: Number, default: 0 },
  addPerNight: { type: Number, default: 0 },
  refundable: { type: Boolean, default: true },
  cancellation: String,
  order: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
}));

const inventorySchema = new Schema({
  roomType: { ...ref('RoomType'), required: true },
  date: { type: String, required: true },          // YYYY-MM-DD
  rate: { type: Number, required: true, min: 0 },  // base nightly rate (before plan, before tax)
  allotment: { type: Number, required: true, min: 0 }, // units released to the website
  sold: { type: Number, default: 0, min: 0 },
  blackout: { type: Boolean, default: false },
});
inventorySchema.index({ roomType: 1, date: 1 }, { unique: true });
export const Inventory = def('Inventory', inventorySchema);

export const PromoCode = def('PromoCode', new Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  description: String,
  type: { type: String, enum: ['percent', 'flat'], required: true },
  value: { type: Number, required: true, min: 1 },
  maxDiscount: Number,
  minNights: Number,
  validFrom: String,
  validTo: String,
  maxUses: Number,
  used: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
}, { timestamps: true }));

export const Booking = def('Booking', new Schema({
  code: { type: String, required: true, unique: true },
  idempotencyKey: { type: String, unique: true, sparse: true },
  user: ref('User'),
  roomType: { ...ref('RoomType'), required: true },
  roomName: String,
  ratePlan: { code: String, name: String, refundable: Boolean },
  checkIn: { type: String, required: true, index: true },
  checkOut: { type: String, required: true },
  nights: Number,
  rooms: { type: Number, default: 1 },
  adults: Number,
  children: Number,
  guest: { name: String, email: { type: String, index: true }, phone: String },
  specialRequests: String,
  pricing: Schema.Types.Mixed,
  promoCode: String,
  payment: { status: String, reference: String, last4: String, mode: { type: String, default: 'test' } },
  consentAt: Date,
  status: { type: String, enum: ['confirmed', 'cancelled'], default: 'confirmed', index: true },
  cancelledAt: Date,
  createdDay: { type: String, index: true },       // YYYY-MM-DD (IST) — drives the daily export
}, { timestamps: true }));

const enquirySchema = new Schema({
  ref: { type: String, required: true, unique: true },
  channel: { type: String, enum: ['web', 'event_form', 'email', 'whatsapp'], required: true },
  name: String,
  contact: String,
  message: { type: String, required: true, maxlength: 4000 },
  form: Schema.Types.Mixed,
  consentAt: Date,
  lane: { type: String, enum: ['room', 'wedding', 'offsite', 'complaint', 'unsorted'], required: true, index: true },
  owner: ref('User'),
  status: { type: String, enum: ['new', 'replied', 'closed'], default: 'new', index: true },
  gmAlert: { type: Boolean, default: false },
  ai: {
    category: String,
    confidence: Number,
    source: String,
    summary: String,
    signals: [String],
    extracted: Schema.Types.Mixed,
    warnings: [String],
    draft: String,
    draftUsedModelText: Boolean,
  },
  replies: [{ body: String, by: ref('User'), sentAt: Date, simulated: { type: Boolean, default: true } }],
  history: [{ at: Date, by: String, action: String, note: String }],
  firstReplyAt: Date,
}, { timestamps: true });
export const Enquiry = def('Enquiry', enquirySchema);

export const Counter = def('Counter', new Schema({ _id: String, seq: Number }));

export const Notification = def('Notification', new Schema({
  user: { ...ref('User'), index: true },
  enquiry: ref('Enquiry'),
  type: String,
  text: String,
  readAt: Date,
}, { timestamps: true }));
