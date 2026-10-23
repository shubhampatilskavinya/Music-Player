import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const compile = file => ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const url = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const code = compile('app/music/session.ts').replace("'../songs'", JSON.stringify(url(compile('app/songs.ts'))));
const { initialSession, changeSession, playbackPosition } = await import(url(code));
test('requests append without replacing or interrupting the playlist', () => {
 const s = initialSession(), original = s.queue.map(x => x.id);
 s.index = 3; s.playing = true;
 for (const title of ['Request A', 'Request B']) changeSession(s, {type:'append', song: {youtubeId:'M7lc1UVf-VE', title}}, 'a');
 assert.deepEqual(s.queue.slice(0, -2).map(x => x.id), original);
 assert.deepEqual(s.queue.slice(-2).map(x => x.title), ['Request A','Request B']);
 assert.equal(s.index, 3); assert.equal(s.playing, true);
});
test('full-length progress never truncates a song at its catalog clip duration', () => {
 const s = initialSession(); changeSession(s, {type:'heartbeat',role:'controller'}, 'a', 100);
 changeSession(s, {type:'report',serial:0,time:190,duration:300}, 'a', 200);
 assert.equal(s.index,0); assert.equal(s.duration,300); assert.equal(s.time,190);
 changeSession(s, {type:'ended',serial:0}, 'a',300); assert.equal(s.index,1);
 changeSession(s, {type:'ended',serial:0}, 'a',301); assert.equal(s.index,1);
});
test('TV takeover waits for the old lease and stale controllers cannot skip tracks', () => {
 const s = initialSession(); changeSession(s,{type:'heartbeat',role:'controller'},'a',100);
 changeSession(s,{type:'heartbeat',role:'tv'},'b',200);
 assert.equal(s.owner.id,'b'); assert.equal(s.owner.readyAt,20100);
 changeSession(s,{type:'ended',serial:0},'b',300); assert.equal(s.index,0);
 changeSession(s,{type:'heartbeat',role:'tv'},'b',5000);
 changeSession(s,{type:'ended',serial:0},'a',20200); assert.equal(s.index,0);
 changeSession(s,{type:'ended',serial:0},'b',20200); assert.equal(s.index,1);
});
test('seek, pause, next and settings preserve the queue', () => {
 const s=initialSession(), n=s.queue.length;
 changeSession(s,{type:'play'},'a'); changeSession(s,{type:'seek',value:100},'a');
 assert.equal(s.seek,100); assert.equal(s.serial,1);
 changeSession(s,{type:'pause'},'a'); changeSession(s,{type:'next'},'a');
 assert.equal(s.playing,false); assert.equal(s.index,1); assert.equal(s.seek,0); assert.equal(s.queue.length,n);
 assert.throws(()=>changeSession(s,{type:'volume',value:NaN},'a'));
});

test('only the silenced previous owner can complete a TV handoff early', () => {
 const s=initialSession();changeSession(s,{type:'heartbeat',role:'controller'},'a',100);
 changeSession(s,{type:'heartbeat',role:'tv'},'b',200);
 changeSession(s,{type:'release'},'stranger',300);assert.equal(s.owner.readyAt,20100);
 changeSession(s,{type:'release'},'a',400);assert.equal(s.owner.readyAt,400);
 changeSession(s,{type:'ended',serial:0},'a',500);assert.equal(s.index,0);
});
test('new screens resume the current clock; paused and stale clocks do not drift indefinitely', () => {
 const s=initialSession();changeSession(s,{type:'heartbeat',role:'controller'},'a',100);
 changeSession(s,{type:'play'},'a',100);
 changeSession(s,{type:'report',serial:0,time:100,duration:200,progressing:true},'a',1000);
 assert.equal(playbackPosition(s,2000),101);assert.equal(playbackPosition(s,20000),105);
 changeSession(s,{type:'pause'},'a',2500);assert.equal(playbackPosition(s,30000),101.5);
 changeSession(s,{type:'seek',value:30},'a',30000);assert.equal(playbackPosition(s,40000),30);
});

test('search Play appends and starts the exact new song atomically, preserving older songs', () => {
 const s=initialSession(), original=structuredClone(s.queue);
 s.index=3; s.playing=false; s.time=90; s.seek=90;
 changeSession(s,{type:'append-play',song:{youtubeId:'M7lc1UVf-VE',title:'Play request'}},'a');
 assert.deepEqual(s.queue.slice(0,-1),original);
 assert.equal(s.index,original.length); assert.equal(s.queue[s.index].title,'Play request');
 assert.equal(s.playing,true);assert.equal(s.time,0);assert.equal(s.seek,0);assert.equal(s.serial,1);
 changeSession(s,{type:'append',song:{youtubeId:'M7lc1UVf-VE',title:'Later request'}},'b');
 assert.equal(s.queue[s.index].title,'Play request');
});

test('play next inserts requests after the current song without interrupting playback', () => {
 for (const playing of [true,false]) {
  const s=initialSession(), original=structuredClone(s.queue);
  s.index=3;s.playing=playing;s.time=85;s.seek=30;s.serial=7;s.duration=240;
  for (const title of ['First request','Latest request']) changeSession(s,{type:'play-next',song:{youtubeId:'M7lc1UVf-VE',title}},'guest');
  assert.deepEqual(s.queue.slice(0,4),original.slice(0,4));
  assert.deepEqual(s.queue.slice(4,6).map(x=>x.title),['Latest request','First request']);
  assert.deepEqual(s.queue.slice(6),original.slice(4));
  assert.deepEqual([s.index,s.playing,s.time,s.seek,s.serial,s.duration],[3,playing,85,30,7,240]);
  const before=structuredClone(s);
  assert.throws(()=>changeSession(s,{type:'play-next',song:{youtubeId:'invalid',title:'Bad'}},'guest'));
  assert.deepEqual(s,before);
 }
 const s=initialSession();s.index=s.queue.length-1;
 changeSession(s,{type:'play-next',song:{youtubeId:'M7lc1UVf-VE',title:'After last'}},'guest');
 assert.equal(s.queue.at(-1).title,'After last');
 while(s.queue.length<500) s.queue.push({...s.queue[0],id:s.queue.length+1});
 assert.throws(()=>changeSession(s,{type:'play-next',song:{youtubeId:'M7lc1UVf-VE',title:'Over limit'}},'guest'),/full/);
});
