// Requires an isolated Chrome with --remote-debugging-port=9222 and the app running.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
const base=process.env.APP_URL || 'http://localhost:3000';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function tab(path) {
 const info=await (await fetch('http://localhost:9222/json/new?'+encodeURIComponent(base+path),{method:'PUT'})).json();
 const ws=new WebSocket(info.webSocketDebuggerUrl); await new Promise(r=>ws.addEventListener('open',r,{once:true}));
 let seq=0; const pending=new Map(), errors=[];
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p.reject(m.error);else p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);});
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 await call('Runtime.enable'); await call('Page.enable');
 const evaluate=async (expression,userGesture=false)=>(await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture})).result.value;
 return {call,evaluate,errors,close:async()=>{ws.close();await fetch('http://localhost:9222/json/close/'+info.id);}};
}
async function wait(fn,label,ms=25000){const end=Date.now()+ms;while(Date.now()<end){const v=await fn();if(v)return v;await delay(500);}throw Error('Timed out: '+label);}
const state=async()=> (await fetch(base+'/api/session')).json();
const client=randomBytes(16).toString('hex');
const command=async command=>{const r=await fetch(base+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client,requestId:randomBytes(16).toString('hex'),command})});assert.equal(r.status,200);return r.json();};
const controller=await tab('/ipad'); let tv, extra;
try {
 await wait(()=>controller.evaluate('document.body.innerText.includes("Mirc Beats")'),'controller render');
 await controller.call('Emulation.setDeviceMetricsOverride',{width:820,height:1180,deviceScaleFactor:1,mobile:true});
 await wait(async()=>!!(await state()).owner,'controller lease');
 const original=await state();
 await command({type:'select',value:0});
 await wait(()=>controller.evaluate('!!document.querySelector("iframe[src*=youtube]")'),'iPad video');
 await controller.evaluate('[...document.querySelectorAll("button")].find(x=>x.dataset.action==="enable-player").click()',true);
 await wait(async()=> (await state()).duration>90,'iPad starts song',45000);
 await command({type:'seek',value:45});
 await wait(async()=> (await state()).time>46,'initial playback position');
 await controller.evaluate(`window.savedFrame=document.querySelector("iframe"); window.savedPlayer=YT.get(savedFrame.id); document.querySelector('[data-screen="tv"]').click()`,true);
 await wait(()=>controller.evaluate('document.querySelector(".tv-view") && document.querySelector("iframe")===savedFrame && YT.get(savedFrame.id)===savedPlayer && !savedPlayer.isMuted() && savedPlayer.getCurrentTime()>45'),'TV mode preserves video and sound');
 await controller.evaluate(`document.querySelector('.tv-view-toolbar [data-screen="ipad"]').click()`,true);
 await wait(()=>controller.evaluate('!!document.querySelector(".ipad-view") && document.querySelector("iframe")===savedFrame && !savedPlayer.isMuted() && savedPlayer.getCurrentTime()>45'),'iPad mode preserves video and sound');
 tv=await tab('/tv');
 await wait(async()=>{const s=await state();return s.owner?.role==='tv'&&s.owner.readyAt<Date.now();},'TV ownership');
 await wait(()=>tv.evaluate('!!document.querySelector("iframe[src*=youtube]")'),'YouTube iframe');
 // TV receives no user gesture: first-time video must autoplay.
 const playing=await wait(async()=>{const s=await state();return s.time>45&&s.duration>90?s:false;},'real YouTube playback',45000);
 assert.equal(await tv.evaluate('navigator.userActivation.hasBeenActive'),false,'TV autoplay needs no click');
 console.log('Real YouTube duration:',playing.duration,'seconds; time:',playing.time);
 assert.equal(await controller.evaluate('document.querySelectorAll("iframe[src*=youtube]").length'),1,'iPad keeps video visible');
 const playerState = t => t.evaluate('(() => {const frame=document.querySelector("iframe"); if(!frame || !window.YT?.get)return null; const p=YT.get(frame.id); if(!p?.getCurrentTime)return null; return {time:p.getCurrentTime(),muted:p.isMuted(),state:p.getPlayerState()};})()');
 await wait(async()=>{const p=await playerState(controller), t=await playerState(tv);return p.muted && p.state===1 && Math.abs(p.time-t.time)<3;},'muted iPad preview matches TV');
 await command({type:'seek',value:100});
 await wait(async()=>{const s=await state();return s.index===0&&s.time>=100;},'full song beyond old cutoff');
 await wait(async()=>{const p=await playerState(controller);return p.time>=98&&p.time<110;},'iPad follows seek');
 await command({type:'pause'}); await delay(1800); const paused=await state(); await delay(1200); assert.ok(Math.abs((await state()).time-paused.time)<1,'remote pause');
 await wait(async()=> (await playerState(controller)).state===2,'iPad follows pause');
 await tv.evaluate('[...document.querySelectorAll("button")].find(x=>x.textContent==="Fullscreen").click()',true);
 assert.equal(await tv.evaluate('!!document.fullscreenElement'),true,'fullscreen');
 assert.equal(await controller.evaluate('document.documentElement.scrollWidth <= innerWidth'),true,'iPad overflow');
 await command({type:'play'});
 extra=await tab('/ipad');
 await wait(async()=>{const p=await playerState(extra), t=await playerState(tv);return p && p.muted && p.state===1 && Math.abs(p.time-t.time)<3 && p.time>95;},'new iPad screen joins continuing TV video');
 await extra.evaluate(`document.querySelector('[data-action="enable-player"]').click()`,true);
 await wait(async()=>{const p=await playerState(extra);return p && !p.muted && p.state===1;},'iPad Sound on here stays audible');
 await delay(1200);assert.equal((await playerState(extra)).muted,false,'sound must not be forcibly muted again');
 await extra.close();extra=null;
 await command({type:'seek',value:playing.duration-2}); await command({type:'play'});
 await wait(async()=> (await state()).index===1,'natural ended advances once',20000);
 await command({type:'pause'});
 assert.equal((await state()).queue.length,original.queue.length,'queue unchanged by playback');
 await controller.call('Page.reload'); await delay(2000);
 assert.equal((await state()).queue.length,original.queue.length,'queue survives controller reload');
 assert.deepEqual(controller.errors,[]);assert.deepEqual(tv.errors,[]);
 console.log('PASS: continuous position at TV open, both videos visible, muted iPad sync, shared pause/seek, ended advancement, fullscreen, reload, no runtime errors');
} catch (e) { console.log('TV:', tv && await tv.evaluate('document.body.innerText')); console.log('Errors:', controller.errors, tv?.errors); throw e; } finally {await command({type:'pause'});await controller.close();if(tv)await tv.close();if(extra)await extra.close();}
