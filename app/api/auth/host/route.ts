import { timingSafeEqual } from 'node:crypto';
import { AuthConfigError, HOST_MAX_AGE } from '../../../auth/identity';
import { setIdentityCookie } from '../../../auth/session-cookie';
import { tooManyAttempts, resetAttempts } from '../../../auth/rate-limit';

export const runtime = 'nodejs';
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

function equalPin(a: string, b: string) {
  const bufA = Buffer.from(a), bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export async function POST(req: Request) {
  const pin = process.env.MIRC_HOST_PIN;
  if (!pin) return json({ error: 'Login is not configured. Set MIRC_HOST_PIN, MIRC_SESSION_SECRET and MIRC_PARTY_CODE in the server environment, then redeploy.' }, 503);
  const key = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  if (tooManyAttempts(key)) return json({ error: 'Too many attempts. Try again in a few minutes.' }, 429);
  let body: { pin?: string };
  try { body = await req.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
  if (typeof body.pin !== 'string' || !equalPin(body.pin, pin)) return json({ error: 'Incorrect PIN.' }, 401);
  resetAttempts(key);
  try { await setIdentityCookie({ role: 'host', id: 'host', name: 'Mirc' }, HOST_MAX_AGE); }
  catch (error) { if (error instanceof AuthConfigError) return json({ error: error.message }, error.status); throw error; }
  return json({ ok: true });
}
