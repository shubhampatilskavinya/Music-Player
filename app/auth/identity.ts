import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export type Role = 'host' | 'guest';
export type Identity = { role: Role; id: string; name: string };
export class AuthConfigError extends Error { status = 503; }
export const IDENTITY_COOKIE = 'mirc_identity';
export const HOST_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
export const GUEST_MAX_AGE = 60 * 60 * 24; // 1 day

export function authConfigured() {
  return !!(process.env.MIRC_HOST_PIN && process.env.MIRC_SESSION_SECRET && process.env.MIRC_PARTY_CODE);
}
function secret(): string {
  const value = process.env.MIRC_SESSION_SECRET;
  if (!value) throw new AuthConfigError('Login is not configured. Set MIRC_HOST_PIN, MIRC_SESSION_SECRET and MIRC_PARTY_CODE in the server environment, then redeploy.');
  return value;
}
function sign(body: string) { return createHmac('sha256', secret()).update(body).digest('base64url'); }

export function encodeIdentity(identity: Identity, maxAgeSeconds: number): string {
  const body = Buffer.from(JSON.stringify({ ...identity, exp: Math.floor(Date.now() / 1000) + maxAgeSeconds })).toString('base64url');
  return `${body}.${sign(body)}`;
}
export function decodeIdentity(cookieValue?: string | null): Identity | null {
  if (!cookieValue) return null;
  const [body, mac] = cookieValue.split('.');
  if (!body || !mac) return null;
  let expected: string;
  try { expected = sign(body); } catch { return null; }
  const a = Buffer.from(mac), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (parsed.role !== 'host' && parsed.role !== 'guest') return null;
    if (typeof parsed.id !== 'string' || typeof parsed.name !== 'string' || typeof parsed.exp !== 'number') return null;
    if (parsed.exp < Date.now() / 1000) return null;
    return { role: parsed.role, id: parsed.id, name: parsed.name };
  } catch { return null; }
}
export function newGuestId() { return randomBytes(8).toString('hex'); }
