import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { changeSession, initialSession, type Command, type Session } from '../../music/session';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const file = path.join(process.env.MIRC_DATA_DIR || path.join(process.cwd(), '.mirc-data'), 'music.json');
type Store = { state?: Session; tail: Promise<unknown>; seen: Set<string> };
const globalStore = globalThis as typeof globalThis & { mircMusic?: Store };
const store = globalStore.mircMusic ||= { tail: Promise.resolve(), seen: new Set() };
function transaction<T>(fn: () => Promise<T>) {
  const work = store.tail.then(fn); store.tail = work.catch(() => {}); return work;
}
async function read() {
  if (!store.state) {
    try { store.state = JSON.parse(await readFile(file, 'utf8')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; store.state = initialSession(); }
    store.state!.owner = null; store.state!.playing = false; store.state!.revision = Date.now();
  }
  return store.state!;
}
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export async function GET() { return transaction(async () => json(await read())); }
export async function POST(req: Request) {
  const origin = req.headers.get('origin');
  if (origin && new URL(origin).host !== req.headers.get('host')) return json({ error: 'Use the app on the same server.' }, 403);
  if (Number(req.headers.get('content-length')) > 16000) return json({ error: 'Request too large' }, 413);
  let body: { client: string; requestId: string; command: Command };
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (!/^[a-f0-9]{32}$/.test(body?.client) || !/^[a-f0-9]{32}$/.test(body?.requestId) || !body.command) return json({ error: 'Invalid command' }, 400);
  return transaction(async () => {
    const old = await read();
    const key = body.client + body.requestId;
    if (store.seen.has(key)) return json(old);
    let next: Session;
    try { next = changeSession(structuredClone(old), body.command, body.client); }
    catch (e) { return json({ error: (e as Error).message }, 400); }
    if (!['heartbeat', 'report', 'release'].includes(body.command.type)) {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file + '.tmp', JSON.stringify({ ...next, owner: null, playing: false }));
      await rename(file + '.tmp', file);
    }
    store.state = next; store.seen.add(key);
    if (store.seen.size > 2000) store.seen.delete(store.seen.values().next().value!);
    return json(next);
  });
}
