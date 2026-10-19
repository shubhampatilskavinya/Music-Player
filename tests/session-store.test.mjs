import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const compile = file => ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const url = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const model = url(compile('app/music/session.ts').replace("'../songs'", JSON.stringify(url(compile('app/songs.ts')))));
const { createRedisSessionStore, COMPARE_AND_SET, readSession } = await import(url(compile('app/music/session-store.ts').replace("'./session'", JSON.stringify(model))));
// A shared Redis contract double. It yields on each call to expose worker races.
// Real Upstash credentials are intentionally not needed by this regression suite.
function redisDouble() {
 const values = new Map(); let conflicts = 0;
 const redis = async ([command, ...args]) => {
   await new Promise(resolve => setImmediate(resolve));
   if (command === 'GET') return values.get(args[0]) ?? null;
   assert.equal(command, 'EVAL'); assert.equal(args[0], COMPARE_AND_SET); assert.equal(args[1], 1);
   const [, , key, expected, next] = args;
   if ((values.get(key) ?? '') !== expected) { conflicts++; return 0; }
   values.set(key, next); return 1;
 };
 return { redis, conflicts: () => conflicts };
}
const song = title => ({ title, youtubeId: 'M7lc1UVf-VE' });
test('separate serverless workers preserve concurrent song appends and exact play selection', async () => {
 const backend=redisDouble(), a=createRedisSessionStore(backend.redis,'room'), b=createRedisSessionStore(backend.redis,'room');
 const original=await a.read();
 await Promise.all([
  a.update('a','request-a',{type:'append-play',song:song('Play now')}),
  b.update('b','request-b',{type:'append',song:song('Queued')})
 ]);
 const s=await b.read();
 assert.equal(s.queue.length,original.queue.length+2);assert.deepEqual(s.queue.slice(0,original.queue.length),JSON.parse(JSON.stringify(original.queue)));
 assert.equal(s.queue[s.index].title,'Play now');assert.equal(s.playing,true);assert.ok(backend.conflicts()>0);
});
test('cold starts and replayed requests do not reset state or append twice', async () => {
 const backend=redisDouble(), first=createRedisSessionStore(backend.redis,'room');
 await first.update('a','1',{type:'append-play',song:song('Remember me')});
 const fresh=createRedisSessionStore(backend.redis,'room');
 const before=await fresh.read();assert.equal(before.playing,true);
 await fresh.update('a','1',{type:'append-play',song:song('Remember me')});
 assert.deepEqual(await fresh.read(),before);
});
test('separate instances agree on TV ownership and reject a stale controller ending', async () => {
 const {redis}=redisDouble(), a=createRedisSessionStore(redis,'room'), b=createRedisSessionStore(redis,'room');
 await a.update('controller','1',{type:'heartbeat',role:'controller'});
 await b.update('tv','2',{type:'heartbeat',role:'tv'});
 await a.update('controller','3',{type:'release'});
 await a.update('controller','4',{type:'ended',serial:0});assert.equal((await b.read()).index,0);
 await b.update('tv','5',{type:'ended',serial:0});assert.equal((await a.read()).index,1);
});
test('storage outage never silently falls back to an unrelated local queue', async () => {
 const store=createRedisSessionStore(async()=>{throw Error('offline');},'room');
 await assert.rejects(()=>store.read(),/offline/);
});
test('Vercel without shared storage fails with an actionable error instead of writing files', async () => {
 const keys=['VERCEL','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','KV_REST_API_URL','KV_REST_API_TOKEN'];
 const saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 try {
  keys.forEach(k=>delete process.env[k]);process.env.VERCEL='1';
  await assert.rejects(()=>readSession(),e=>e.status===503 && /Connect Upstash Redis/.test(e.message));
 } finally { for(const k of keys){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];} }
});
