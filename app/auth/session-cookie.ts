import { cookies } from 'next/headers';
import { type Identity, IDENTITY_COOKIE, decodeIdentity, encodeIdentity } from './identity';

export async function setIdentityCookie(identity: Identity, maxAgeSeconds: number) {
  (await cookies()).set(IDENTITY_COOKIE, encodeIdentity(identity, maxAgeSeconds), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: maxAgeSeconds,
  });
}
export async function clearIdentityCookie() { (await cookies()).delete(IDENTITY_COOKIE); }
export async function readIdentity(): Promise<Identity | null> {
  return decodeIdentity((await cookies()).get(IDENTITY_COOKIE)?.value);
}
