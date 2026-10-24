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

test('appended and play-next songs carry requester attribution only when an identity is given', () => {
 const s=initialSession();
 changeSession(s,{type:'append',song:{youtubeId:'M7lc1UVf-VE',title:'No identity'}},'a');
 assert.equal(s.queue.at(-1).requestedBy,undefined);
 changeSession(s,{type:'append',song:{youtubeId:'M7lc1UVf-VE',title:'From a guest'},identity:{role:'guest',id:'g1',name:'Priya'}},'a');
 assert.deepEqual(s.queue.at(-1).requestedBy,{id:'g1',name:'Priya'});
 changeSession(s,{type:'play-next',song:{youtubeId:'M7lc1UVf-VE',title:'From the host'},identity:{role:'host',id:'host',name:'Mirc'}},'a');
 assert.deepEqual(s.queue[s.index+1].requestedBy,{id:'host',name:'Mirc'});
});

test('a guest can only remove the song they added; the host can remove anything', () => {
 const s=initialSession();
 changeSession(s,{type:'append',song:{youtubeId:'M7lc1UVf-VE',title:'Priya song'},identity:{role:'guest',id:'g1',name:'Priya'}},'a');
 const priyaSongId=s.queue.at(-1).id;
 changeSession(s,{type:'append',song:{youtubeId:'M7lc1UVf-VE',title:'Rahul song'},identity:{role:'guest',id:'g2',name:'Rahul'}},'a');
 const rahulSongId=s.queue.at(-1).id;
 assert.throws(()=>changeSession(s,{type:'remove',value:rahulSongId,identity:{role:'guest',id:'g1',name:'Priya'}},'a'),/only remove songs you added/);
 assert.equal(s.queue.some(song=>song.id===rahulSongId),true);
 changeSession(s,{type:'remove',value:priyaSongId,identity:{role:'guest',id:'g1',name:'Priya'}},'a');
 assert.equal(s.queue.some(song=>song.id===priyaSongId),false);
 changeSession(s,{type:'remove',value:rahulSongId,identity:{role:'host',id:'host',name:'Mirc'}},'a');
 assert.equal(s.queue.some(song=>song.id===rahulSongId),false);
 const untouchedId=s.queue[0].id, lengthBefore=s.queue.length;
 changeSession(s,{type:'remove',value:untouchedId},'a');
 assert.equal(s.queue.length,lengthBefore-1);
 assert.equal(s.queue.some(song=>song.id===untouchedId),false);
});

test('add-to-playlist permanently appends a song without requester attribution', () => {
 const s=initialSession(), original=structuredClone(s.queue);
 changeSession(s,{type:'add-to-playlist',song:{youtubeId:'M7lc1UVf-VE',title:'New catalog song'}},'a');
 assert.deepEqual(s.queue.slice(0,-1),original);
 assert.equal(s.queue.at(-1).title,'New catalog song');
 assert.equal(s.queue.at(-1).requestedBy,undefined);
 assert.equal(s.queue.at(-1).external,undefined);
 assert.throws(()=>changeSession(s,{type:'add-to-playlist',song:{youtubeId:'invalid',title:'Bad'}},'a'));
 while(s.queue.length<500) s.queue.push({...s.queue[0],id:s.queue.length+1});
 assert.throws(()=>changeSession(s,{type:'add-to-playlist',song:{youtubeId:'M7lc1UVf-VE',title:'Over limit'}},'a'),/full/);
});

test('add-to-playlist with a position inserts at that exact catalog row, shifting the index if needed', () => {
 const s=initialSession(), originalLength=s.queue.length;
 changeSession(s,{type:'select',value:5},'a');
 const songAtFive=s.queue[5].id;
 changeSession(s,{type:'add-to-playlist',song:{youtubeId:'M7lc1UVf-VE',title:'Inserted at 3'},position:3},'a');
 assert.equal(s.queue.length,originalLength+1);
 assert.equal(s.queue[2].title,'Inserted at 3');
 assert.equal(s.index,6);
 assert.equal(s.queue[s.index].id,songAtFive);
 const s2=initialSession();
 changeSession(s2,{type:'add-to-playlist',song:{youtubeId:'M7lc1UVf-VE',title:'Beyond the end'},position:9999},'a');
 assert.equal(s2.queue.at(-1).title,'Beyond the end');
});

test('promote moves an already-queued song to play next, and no-ops for invalid targets', () => {
 const s=initialSession();
 const originalLength=s.queue.length;
 changeSession(s,{type:'promote',value:s.queue[s.index].id},'a');
 assert.equal(s.queue.length,originalLength); assert.equal(s.index,0);
 changeSession(s,{type:'promote',value:s.queue[s.index+1].id},'a');
 assert.equal(s.queue.length,originalLength); assert.equal(s.index,0);
 changeSession(s,{type:'promote',value:999999},'a');
 assert.equal(s.queue.length,originalLength);
 const laterSongId=s.queue[10].id;
 changeSession(s,{type:'promote',value:laterSongId},'a');
 assert.equal(s.queue.length,originalLength);
 assert.equal(s.queue[s.index+1].id,laterSongId);
 assert.equal(s.index,0);
 const s2=initialSession();
 changeSession(s2,{type:'select',value:5},'a');
 const earlierSongId=s2.queue[1].id;
 changeSession(s2,{type:'promote',value:earlierSongId},'a');
 assert.equal(s2.index,4);
 assert.equal(s2.queue[5].id,earlierSongId);
 assert.equal(s2.queue.length,originalLength);
});

test('a host can insert a play-next request at an exact upcoming position; others cannot', () => {
 const s=initialSession();
 changeSession(s,{type:'play-next',song:{youtubeId:'M7lc1UVf-VE',title:'At position 3'},position:3,identity:{role:'host',id:'host',name:'Mirc'}},'a');
 assert.equal(s.queue[s.index+3].title,'At position 3');
 const s2=initialSession();
 changeSession(s2,{type:'play-next',song:{youtubeId:'M7lc1UVf-VE',title:'Guest tries position'},position:3,identity:{role:'guest',id:'g1',name:'Priya'}},'a');
 assert.equal(s2.queue[s2.index+1].title,'Guest tries position');
 const s3=initialSession();
 changeSession(s3,{type:'play-next',song:{youtubeId:'M7lc1UVf-VE',title:'No identity'},position:3},'a');
 assert.equal(s3.queue[s3.index+1].title,'No identity');
});

test('reorder moves an already-queued song to an exact upcoming slot, and no-ops for invalid targets', () => {
 const s=initialSession(), originalLength=s.queue.length;
 const targetId=s.queue[10].id;
 changeSession(s,{type:'reorder',value:targetId,position:2},'a');
 assert.equal(s.queue.length,originalLength);
 assert.equal(s.queue[s.index+2].id,targetId);
 changeSession(s,{type:'reorder',value:s.queue[s.index].id,position:1},'a');
 assert.equal(s.queue.length,originalLength);
 changeSession(s,{type:'reorder',value:999999,position:1},'a');
 assert.equal(s.queue.length,originalLength);
 const s2=initialSession();
 changeSession(s2,{type:'select',value:10},'a');
 const earlierId=s2.queue[2].id;
 changeSession(s2,{type:'reorder',value:earlierId,position:3},'a');
 assert.equal(s2.queue.length,originalLength);
 assert.equal(s2.queue[s2.index+3].id,earlierId);
});
