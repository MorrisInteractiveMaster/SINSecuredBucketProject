import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { normalizeEmail } from './csv.mjs';
export const DATABASE_ID = 'mi-sin-portal';
export const DEMO_PROJECT = 'demo-mi-sin-portal';
export const SYNTHETIC_VALUES = Object.freeze(['000000018', '000000026']);
export class PortalError extends Error {
  constructor(code = 'permission-denied', reason = 'Access is not available.', stage) {
    super(reason);
    this.code = code;
    this.stage = stage;
  }
}
export function deny(code = 'permission-denied', reason, stage) {
  throw new PortalError(code, reason, stage);
}
export const emailKey = (email) =>
  createHash('sha256').update(normalizeEmail(email)).digest('hex');
export function checkProvider(provider) {
  if (!['google.com', 'microsoft.com'].includes(provider)) deny();
}
export function trustsEmail(provider, email, verified) {
  const domain = normalizeEmail(email).split('@')[1];
  return (
    verified === true &&
    ((provider === 'google.com' && domain === 'gmail.com') ||
      (provider === 'microsoft.com' &&
        ['outlook.com', 'hotmail.com'].includes(domain)))
  );
}
export function normalizeSin(value) {
  if (
    typeof value !== 'string' ||
    value.length > 24 ||
    !/^[0-9 -]+$/.test(value)
  )
    deny('invalid-argument', 'Check the nine-digit number.');
  const v = value.replace(/[ -]/g, '');
  const sum = [...v].reduce((sum, c, i) => {
    let n = Number(c) * (i % 2 === 1 ? 2 : 1);
    return sum + (n > 9 ? n - 9 : n);
  }, 0);
  if (!/^\d{9}$/.test(v) || /^0+$/.test(v) || sum % 10 !== 0)
    deny('invalid-argument', 'Check the nine-digit number.');
  return v;
}
export const challengeHash = (pepper, uid, provider, nonce, code) =>
  createHmac('sha256', pepper)
    .update(JSON.stringify([uid, provider, nonce, code]))
    .digest('hex');
export function sameDigest(a, b) {
  if (
    typeof a !== 'string' ||
    typeof b !== 'string' ||
    a.length !== 64 ||
    b.length !== 64
  )
    return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}
export function assertSynthetic(value) {
  const v = normalizeSin(value);
  if (!SYNTHETIC_VALUES.includes(v))
    deny(
      'invalid-argument',
      'Only the documented synthetic fixtures are enabled.',
    );
  return v;
}
export function checkFresh(authTime, now, maxAge = 1800) {
  if (
    !Number.isFinite(authTime) ||
    now / 1000 - authTime > maxAge ||
    authTime > now / 1000 + 30
  )
    deny('unauthenticated', 'Please sign in again.');
}
