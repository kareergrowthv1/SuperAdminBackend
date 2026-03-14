/**
 * In-memory OTP store for candidate registration (email/phone verification).
 * Key: normalized email or phone; Value: { otp, expiresAt }.
 * TTL 5 minutes. For production, consider Redis.
 */
const logger = require('./logger');

const TTL_MS = 5 * 60 * 1000; // 5 minutes
const store = new Map();

function normalizeKey(input) {
  if (!input || typeof input !== 'string') return '';
  return input.trim().toLowerCase().replace(/\s+/g, '');
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function set(key, otp, ttlMs = TTL_MS) {
  const k = normalizeKey(key);
  if (!k) return null;
  const expiresAt = Date.now() + ttlMs;
  store.set(k, { otp: String(otp), expiresAt });
  return otp;
}

function get(key) {
  const k = normalizeKey(key);
  if (!k) return null;
  const entry = store.get(k);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(k);
    return null;
  }
  return entry.otp;
}

function verify(key, otp) {
  const k = normalizeKey(key);
  if (!k || !otp) return false;
  const stored = get(k);
  const ok = stored !== null && String(otp).trim() === stored;
  if (ok) store.delete(k);
  return ok;
}

function sendAndStore(key) {
  const k = normalizeKey(key);
  if (!k) return null;
  const otp = generateOtp();
  set(k, otp);
  // In dev, log OTP; in production integrate with email/SMS provider
  logger.info('OTP generated for candidate verification', { key: k.replace(/(?<=.{2})./g, '*'), otp: process.env.NODE_ENV === 'production' ? '***' : otp });
  return otp;
}

module.exports = {
  set,
  get,
  verify,
  sendAndStore,
  normalizeKey,
  TTL_MS
};
