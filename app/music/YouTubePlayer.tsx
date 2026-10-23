'use client';
import { useEffect, useRef, useState } from 'react';
import { playbackPosition } from './session';
import { playbackGain } from '../playback-fade';
import type { Connection } from './use-session';
type Player = { isMuted(): boolean; mute(): void; unMute(): void; playVideo(): void; pauseVideo(): void; destroy(): void; setVolume(n: number): void; getCurrentTime(): number; getDuration(): number; getPlayerState(): number; loadVideoById(v: { videoId: string; startSeconds: number }): void; cueVideoById(v: { videoId: string; startSeconds: number }): void; seekTo(n: number, ahead: boolean): void };
type Event = { target: Player; data: number };
type API = { Player: new (host: HTMLElement, options: { playerVars: Record<string, string | number>; events: { onReady(e: Event): void; onStateChange(e: Event): void; onError(e: Event): void; onAutoplayBlocked(): void } }) => Player };
declare global { interface Window { YT?: API; onYouTubeIframeAPIReady?: () => void } }
let loading: Promise<API> | null = null;
function loadAPI(): Promise<API> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (loading) return loading;
  loading = new Promise<API>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { clearTimeout(timer); previous?.(); if (window.YT) resolve(window.YT); };
    let script = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
    if (!script) { script = document.createElement('script'); script.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(script); }
    const fail = () => { clearTimeout(timer); script?.remove(); reject(Error('YouTube could not load. Check your internet connection and retry.')); };
    script.addEventListener('error', fail, { once: true });
    const timer = setTimeout(fail, 15000);
  }).catch(e => { loading = null; throw e; });
  return loading;
}
export default function YouTubePlayer({ connection }: { connection: Connection }) {
  const { state, owner, connected, send, client } = connection;
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<Player | null>(null);
  const latest = useRef(connection);
  useEffect(() => { latest.current = connection; });
  const loaded = useRef({ id: -1, serial: -1 });
  const ended = useRef(-1);
  const [ready, setReady] = useState(0);
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const blocked = useRef(false);
  const localSound = useRef(false);
  const [listeningHere, setListeningHere] = useState(false);
  const hasPlayed = useRef(false);
  const suppressPauseUntil = useRef(0);
  const hasSession = !!state;
  useEffect(() => {
    if (!hasSession || !host.current) return;
    let disposed = false;
    let instance: Player | undefined;
    const mount = document.createElement('div'); host.current.replaceChildren(mount);
    loaded.current = { id: -1, serial: -1 }; ended.current = -1;
    void loadAPI().then(YT => {
      if (disposed) return;
      instance = new YT.Player(mount, {
        // No initial videoId: the ready-triggered effect below loads the current
        // track exactly once, with the correct resume position. Passing a videoId
        // here too would cue it a second time, racing that effect's own load and
        // producing a visible mute/pause glitch on the very first track shown.
        playerVars: { autoplay: 0, controls: 1, fs: 1, playsinline: 1, rel: 0, origin: location.origin },
        events: {
          onReady: e => { if (disposed) return; player.current = e.target; if (!latest.current.owner) e.target.mute(); setReady(n => n + 1); },
          onAutoplayBlocked: () => {
            if (disposed) return;
            const p = player.current;
            if (!blocked.current && p) {
              blocked.current = true; setSoundBlocked(true); setNotice('');
              suppressPauseUntil.current = Date.now() + 1500;
              p.mute();
              if (latest.current.state?.playing) p.playVideo();
            } else setNotice('This browser also blocked muted video. Allow autoplay in its site settings, or press Play.');
          },
          onError: e => { if (!disposed) setNotice(e.data === 153 ? 'YouTube requires a valid app address/referrer. Open this page using http:// or https:// and retry.' : e.data === 101 || e.data === 150 ? 'The owner does not allow this video in embedded players. Choose another video or open YouTube.' : e.data === 100 ? 'This video is unavailable or private. Skip it or choose another version.' : `YouTube playback error ${e.data}. Retry or choose another video.`); },
          onStateChange: e => {
            if (disposed) return;
            const c = latest.current, s = c.state;
            if (!s || loaded.current.serial !== s.serial) return;
            if (!c.owner) { if (e.data === 1) setNotice(''); return; }
            if (e.data === 0 && ended.current !== s.serial) { ended.current = s.serial; void c.send({ type: 'ended', serial: s.serial }); }
            if (e.data === 1) { hasPlayed.current = true; setNotice(''); if (!s.playing) void c.send({ type: 'play' }); }
            if (e.data === 2 && hasPlayed.current && Date.now() > suppressPauseUntil.current && s.playing && e.target.getCurrentTime() < e.target.getDuration() - .5) void c.send({ type: 'pause' });
          },
        },
      });
    }).catch(e => { if (!disposed) setNotice(e.message); });
    const tick = setInterval(() => {
      const p = player.current, s = latest.current.state;
      if (!p || !s) return;
      if (!latest.current.connected || !s.owner || s.owner.expires <= Date.now()) { p.mute(); p.pauseVideo(); return; }
      if (!latest.current.owner && !localSound.current) { p.mute(); return; }
      if (blocked.current) p.mute();
      p.setVolume(s.volume * 100 * (p.getPlayerState() === 1 ? playbackGain(p.getCurrentTime(), p.getDuration(), s.fade) : 1));
    }, 100);
    const report = setInterval(() => {
      const p = player.current, c = latest.current;
      if (p && c.owner && c.state && loaded.current.serial === c.state.serial) void c.send({ type: 'report', serial: loaded.current.serial, time: p.getCurrentTime() || 0, duration: p.getDuration() || 0, progressing: p.getPlayerState() === 1 });
    }, 1000);
    const unlock = (event: { type: string }) => { const c = latest.current; if (!player.current) return; blocked.current = false; setSoundBlocked(false); localSound.current = !c.owner; setListeningHere(!c.owner); player.current.setVolume((c.state?.volume ?? .8) * 100); player.current.unMute(); suppressPauseUntil.current = Date.now() + 1500; if (event.type === 'mirc-play') player.current.playVideo(); };
    window.addEventListener('mirc-play', unlock);
    window.addEventListener('mirc-sound', unlock);
    return () => { window.removeEventListener('mirc-play', unlock); window.removeEventListener('mirc-sound', unlock); disposed = true; clearInterval(tick); clearInterval(report); player.current = null; instance?.destroy(); };
  }, [hasSession, attempt]);
  useEffect(() => {
    const p = player.current;
    if (!p || !ready || !state) return;
    if ((owner || localSound.current) && !blocked.current) { if (p.isMuted()) suppressPauseUntil.current = Date.now() + 1500; p.unMute(); } else p.mute();
    const track = state.queue[state.index];
    if (loaded.current.id !== track.id) {
      loaded.current = { id: track.id, serial: state.serial }; ended.current = -1; hasPlayed.current = false;
      const video = { videoId: track.youtubeId, startSeconds: playbackPosition(state) };
      p.setVolume(owner || localSound.current ? state.volume * 100 : 0);
      if (state.playing) p.loadVideoById(video); else p.cueVideoById(video);
    } else if (loaded.current.serial !== state.serial) {
      loaded.current.serial = state.serial; ended.current = -1; p.seekTo(state.seek, true);
    }
    if (state.playing) p.playVideo(); else p.pauseVideo();
    // Telemetry must not restart or seek the player.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.index, state?.serial, state?.playing, ready, owner]);
  // A silent display follows the audible player's clock and never advances the queue.
  useEffect(() => {
    const p = player.current;
    if (!p || !state || owner || !ready) return;
    if (!localSound.current || blocked.current) p.mute();
    if (loaded.current.serial !== state.serial) return;
    const target = playbackPosition(state);
    if (Math.abs(p.getCurrentTime() - target) > 2) p.seekTo(target, true);
    if (!state.playing) p.pauseVideo();
    else if (p.getPlayerState() === 2 || p.getPlayerState() === 0) p.playVideo();
  }, [state, owner, ready]);
  useEffect(() => {
    if (owner) return;
    if (state?.owner?.previous === client || !localSound.current) player.current?.mute();
    // Acknowledge only after silencing this screen; otherwise keep the lease timeout.
    if (state?.owner?.previous === client) void send({ type: 'release' });
  }, [owner, state?.owner?.previous, client, send]);
  if (!state) return <p className="embed-notice">Connecting to the music server…</p>;
  return <div className="youtube-player" data-audio-owner={owner ? "true" : "false"}><div className="youtube-host" ref={host} /><div className="screen-actions"><button data-action="enable-player" onClick={() => { window.dispatchEvent(new Event('mirc-play')); setNotice(''); void send({ type: 'play' }); }}>{soundBlocked || (!owner && !listeningHere) ? 'Sound on here' : 'Play'}</button>{!owner && listeningHere && <button onClick={() => { localSound.current = false; setListeningHere(false); player.current?.mute(); }}>Mute this screen</button>}<button onClick={() => { setReady(0); setNotice(''); setAttempt(n => n + 1); }}>Retry</button><button onClick={() => void send({ type: 'next' })}>Skip</button><a href={`https://www.youtube.com/watch?v=${state!.queue[state!.index].youtubeId}`} target="_blank" rel="noreferrer">Open YouTube ↗</a></div>{(owner || listeningHere) && soundBlocked && <p className="screen-help">Video starts automatically muted. Tap Sound on here to allow audio on this screen.</p>}{!connected && <p className="embed-notice">Connection lost. Reconnecting…</p>}{connected && !owner && !listeningHere && <p className="screen-help">Video is synchronized. Use Sound on here to hear it on this device too.</p>}{notice && <p role="status" className="embed-notice">{notice}</p>}</div>;
}
