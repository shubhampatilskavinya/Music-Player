import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { changeSession, initialSession, type Command, type Session } from './session';

export class SessionStoreError extends Error {
  constructor(message: string, public status = 503) { super(message); }
}
export type RedisCommand = (args: (string | number)[]) => Promise<unknown>;
type SavedSession = { state: Session; seen: string[] };
const transient = (command: Command) => ['heartbeat', 'report', 'release'].includes(command.type);
function apply(state: Session, command: Command, client: string) {
  try { return changeSession(structuredClone(state), command, client); }
  catch (e) { throw new SessionStoreError((e as Error).message, 400); }
}
// Compare-and-set is atomic in Redis, including when two Vercel instances race.
// A failed comparison never overwrites a newer queue or playback command.
export const COMPARE_AND_SET = `
local current = redis.call('GET', KEYS[1])
if (current or '') ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2])
return 1
`;
export function createRedisSessionStore(redis: RedisCommand, key: string) {
  async function load() {
    const raw = await redis(['GET', key]);
    if (raw === null) return { raw: '', value: { state: initialSession(), seen: [] } as SavedSession };
    if (typeof raw !== 'string') throw new SessionStoreError('Invalid session storage response.');
    let value: SavedSession;
    try { value = JSON.parse(raw); }
    catch { throw new SessionStoreError('Saved session could not be read.'); }
    if (!value.state?.queue?.length || !Array.isArray(value.seen)) throw new SessionStoreError('Saved session has an invalid format.');
    return { raw, value };
  }
  return {
    async read() { return (await load()).value.state; },
    async update(client: string, requestId: string, command: Command) {
      const receipt = client + requestId;
      for (let attempt = 0; attempt < 12; attempt++) {
        const { raw, value } = await load();
        if (value.seen.includes(receipt)) return value.state;
        const next = apply(value.state, command, client);
        const saved: SavedSession = { state: next, seen: transient(command) ? value.seen : [...value.seen, receipt].slice(-256) };
        const result = await redis(['EVAL', COMPARE_AND_SET, 1, key, raw, JSON.stringify(saved)]);
        if (result === 1) return next;
        if (result !== 0) throw new SessionStoreError('Unexpected session storage response.');
      }
      throw new SessionStoreError('The playlist is busy. Please try your command again.');
    },
  };
}
function remoteStore() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url && !token && !process.env.VERCEL) return null;
  if (!url || !token) throw new SessionStoreError('Live storage is not configured. Connect Upstash Redis in Vercel, set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN, then redeploy.');
  let endpoint: URL;
  try { endpoint = new URL(url); } catch { throw new SessionStoreError('Redis URL is invalid. Check the server environment variables.'); }
  if (endpoint.protocol !== 'https:') throw new SessionStoreError('Redis storage requires an HTTPS REST endpoint.');
  const key = process.env.MIRC_SESSION_KEY || `mirc:music:${process.env.VERCEL_PROJECT_ID || 'local'}:${process.env.VERCEL_ENV || 'development'}`;
  const redis: RedisCommand = async args => {
    let response: Response;
    try {
      response = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args), cache: 'no-store', signal: AbortSignal.timeout(2500) });
    } catch { throw new SessionStoreError('Session storage is temporarily unreachable. Please retry.'); }
    if (!response.ok) throw new SessionStoreError(response.status === 401 || response.status === 403 ? 'Redis credentials were rejected. Check the server environment variables.' : 'Session storage is temporarily unavailable. Please retry.');
    let data: { result?: unknown; error?: unknown };
    try { data = await response.json(); } catch { throw new SessionStoreError('Invalid response from session storage.'); }
    if (data.error || !('result' in data)) throw new SessionStoreError('Session storage could not complete the command.');
    return data.result;
  };
  return createRedisSessionStore(redis, key);
}

// Keep the established disk store for a single local Node server.
type LocalStore = { state?: Session; tail: Promise<unknown>; seen: Set<string> };
const globalStore = globalThis as typeof globalThis & { mircMusic?: LocalStore };
const local = globalStore.mircMusic ||= { tail: Promise.resolve(), seen: new Set() };
const file = () => path.join(process.env.MIRC_DATA_DIR || path.join(process.cwd(), '.mirc-data'), 'music.json');
function transaction<T>(fn: () => Promise<T>) {
  const work = local.tail.then(fn); local.tail = work.catch(() => {}); return work;
}
async function readLocal() {
  if (!local.state) {
    try { local.state = JSON.parse(await readFile(file(), 'utf8')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; local.state = initialSession(); }
    local.state!.owner = null; local.state!.playing = false; local.state!.revision = Date.now();
  }
  return local.state!;
}
export async function readSession() {
  const remote = remoteStore();
  return remote ? remote.read() : transaction(readLocal);
}
export async function updateSession(client: string, requestId: string, command: Command) {
  const remote = remoteStore();
  if (remote) return remote.update(client, requestId, command);
  return transaction(async () => {
    const old = await readLocal(), key = client + requestId;
    if (local.seen.has(key)) return old;
    const next = apply(old, command, client);
    if (!transient(command)) {
      await mkdir(path.dirname(file()), { recursive: true });
      await writeFile(file() + '.tmp', JSON.stringify({ ...next, owner: null, playing: false }));
      await rename(file() + '.tmp', file());
    }
    local.state = next; local.seen.add(key);
    if (local.seen.size > 2000) local.seen.delete(local.seen.values().next().value!);
    return next;
  });
}
