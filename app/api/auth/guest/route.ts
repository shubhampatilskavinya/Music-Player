import { AuthConfigError, GUEST_MAX_AGE, newGuestId } from '../../../auth/identity';
import { setIdentityCookie } from '../../../auth/session-cookie';
import { tooManyAttempts, resetAttempts } from '../../../auth/rate-limit';

export const runtime = 'nodejs';
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

function sanitizeName(name: unknown) {
  const text = typeof name === 'string' ? name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 40) : '';
  return text || 'Guest';
}

export async function POST(req: Request) {
  const partyCode = process.env.MIRC_PARTY_CODE;
  if (!partyCode) return json({ error: 'Login is not configured. Set MIRC_HOST_PIN, MIRC_SESSION_SECRET and MIRC_PARTY_CODE in the server environment, then redeploy.' }, 503);
  const key = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  if (tooManyAttempts(key)) return json({ error: 'Too many attempts. Try again in a few minutes.' }, 429);
  let body: { code?: string; name?: string };
  try { body = await req.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
  if (typeof body.code !== 'string' || body.code.trim().toUpperCase() !== partyCode.trim().toUpperCase()) return json({ error: 'Incorrect party code.' }, 401);
  resetAttempts(key);
  try { await setIdentityCookie({ role: 'guest', id: newGuestId(), name: sanitizeName(body.name) }, GUEST_MAX_AGE); }
  catch (error) { if (error instanceof AuthConfigError) return json({ error: error.message }, error.status); throw error; }
  return json({ ok: true });
}
