// Run against an isolated test server; this appends two fixture songs.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
const base=process.env.APP_URL || 'http://localhost:3101';
const client=randomBytes(16).toString('hex');
const post=async(command,requestId=randomBytes(16).toString('hex'))=>{
 const r=await fetch(base+'/api/session',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({client,requestId,command})});assert.equal(r.status,200);return r.json();
};
const before=await(await fetch(base+'/api/session')).json();
const a={type:'append',song:{title:'Append A',youtubeId:'M7lc1UVf-VE'}}, b={type:'append',song:{title:'Append B',youtubeId:'M7lc1UVf-VE'}};
const requestId=randomBytes(16).toString('hex');
await Promise.all([post(a,requestId),post(b)]);await post(a,requestId);
const after=await(await fetch(base+'/api/session')).json();
assert.equal(after.queue.length,before.queue.length+2);
assert.deepEqual(after.queue.slice(0,-2),before.queue);
assert.equal(after.index,before.index);
assert.deepEqual(new Set(after.queue.slice(-2).map(x=>x.title)),new Set(['Append A','Append B']));
for(const route of ['/','/ipad','/tv'])assert.equal((await fetch(base+route)).status,200);
const bad=await fetch(base+'/api/session',{method:'POST',headers:{Origin:'https://different.example','Content-Type':'application/json'},body:'{}'});assert.equal(bad.status,403);
const search=await(await fetch(base+'/api/search?q=M7lc1UVf-VE')).json();assert.equal(search.results[0].videoId,'M7lc1UVf-VE');
console.log('PASS: concurrent append, preserved queue, retry idempotency, all screen routes, origin validation, direct YouTube links');
