import { readSession, SessionStoreError, updateSession } from '../../music/session-store';
import type { Command } from '../../music/session';
import { authorizeCommand, ForbiddenError } from '../../auth/authorize';
import { AuthConfigError } from '../../auth/identity';
import { readIdentity } from '../../auth/session-cookie';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
function failure(error: unknown) {
  if (error instanceof SessionStoreError || error instanceof ForbiddenError || error instanceof AuthConfigError) return json({ error: error.message }, error.status);
  return json({ error: 'The playlist could not be saved. Check the server storage configuration and retry.' }, 503);
}
export async function GET() {
  try { return json(await readSession()); } catch (error) { return failure(error); }
}
export async function POST(req: Request) {
  const origin = req.headers.get('origin');
  if (origin) {
    try { if (new URL(origin).host !== req.headers.get('host')) return json({ error: 'Use the app on the same server.' }, 403); }
    catch { return json({ error: 'Invalid origin.' }, 403); }
  }
  if (Number(req.headers.get('content-length')) > 16000) return json({ error: 'Request too large' }, 413);
  let body: { client: string; requestId: string; command: Command };
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (!/^[a-f0-9]{32}$/.test(body?.client) || !/^[a-f0-9]{32}$/.test(body?.requestId) || !body.command) return json({ error: 'Invalid command' }, 400);
  const identity = await readIdentity();
  try { authorizeCommand(identity, body.command); } catch (error) { return failure(error); }
  const command: Command = identity ? { ...body.command, identity } : body.command;
  try { return json(await updateSession(body.client, body.requestId, command)); }
  catch (error) { return failure(error); }
}
