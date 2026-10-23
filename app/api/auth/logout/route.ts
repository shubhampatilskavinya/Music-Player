import { clearIdentityCookie } from '../../../auth/session-cookie';

export const runtime = 'nodejs';

export async function POST() {
  await clearIdentityCookie();
  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
