'use client';
import { useEffect, useRef, useState } from 'react';
import { playbackPosition, type Session } from './session';
import type { Connection } from './use-session';
import type { Song } from '../songs';
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
// How early (seconds before the current song's predicted end) to start the hidden standby
// player buffering the next song, muted. Independent of the visual fade length below - this
// is purely buffering headroom, not the transition the viewer sees. Generous on purpose: a
// slow connection needs real time to fully buffer, and starting early costs nothing (the
// standby is silent and invisible) while starting late is what causes a visible stall right
// after the swap.
const STANDBY_LEAD_SECONDS = 20;
export default function YouTubePlayer({ connection }: { connection: Connection }) {
  const { state, owner, connected, send, client } = connection;
  const hostA = useRef<HTMLDivElement>(null);
  const hostB = useRef<HTMLDivElement>(null);
  const playerA = useRef<Player | null>(null);
  const playerB = useRef<Player | null>(null);
  // `player` always points at whichever of playerA/playerB is the current front/audible one;
  // every existing piece of logic below reads this exactly as if there were only one player.
  // `standby` points at the other one, used only by the crossfade logic further down.
  const player = useRef<Player | null>(null);
  const standby = useRef<Player | null>(null);
  const frontIsA = useRef(true);
  const latest = useRef(connection);
  useEffect(() => { latest.current = connection; });
  const loaded = useRef({ id: -1, serial: -1 });
  const ended = useRef(-1);
  const [readyA, setReadyA] = useState(0);
  const [readyB, setReadyB] = useState(0);
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const blocked = useRef(false);
  const localSound = useRef(false);
  const [listeningHere, setListeningHere] = useState(false);
  const hasPlayed = useRef(false);
  const suppressPauseUntil = useRef(0);
  const standbyForId = useRef(-1);
  // crossfadeActive: we're inside the gradual volume/opacity ramp window, between it starting
  // and the final swap. finalizing: a short guard around the swap instant itself, so the
  // tick can't re-enter mid-swap.
  const crossfadeActive = useRef(false);
  const finalizing = useRef(false);
  // standbyArmed: the standby has been told to run for real (the fade is starting), as opposed
  // to being parked silently at its song's first frame while it waits.
  const standbyArmed = useRef(false);
  const ready = readyA + readyB;
  const hasSession = !!state;

  // Whether sound should actually come out of this screen right now. Every screen renders the
  // video (and the crossfade); only the audio owner - or a screen the user explicitly turned
  // sound on for - is heard.
  const audible = () => !blocked.current && (!!latest.current.owner || localSound.current);
  const upcoming = (s: Session) => s.queue[(s.index + 1) % s.queue.length];

  const setFront = (front: HTMLDivElement | null, back: HTMLDivElement | null) => {
    front?.classList.add('youtube-host--front'); front?.classList.remove('youtube-host--back');
    back?.classList.add('youtube-host--back'); back?.classList.remove('youtube-host--front');
  };

  // Park the standby: silent, paused on the very first frame of its song, but already buffered
  // (it has to have reached PLAYING once for YouTube to fetch anything, which is why it's
  // allowed a brief muted start before being held here). Resuming a paused, buffered player is
  // near-instant, so the next song can begin from 0:00 exactly when the fade starts instead of
  // having silently run ahead for the whole buffering lead.
  const holdStandby = () => {
    const b = standby.current;
    if (!b) return;
    standbyArmed.current = false;
    b.setVolume(0); b.mute(); b.pauseVideo(); b.seekTo(0, true);
  };

  // Cleanly abandons an in-progress crossfade without finishing it: restores the front player
  // to full volume and re-parks the standby, and clears any manual opacity override so the
  // host--front/--back classes (1/0) take back over. Needed when a seek moves back out of the
  // fade window, or a manual Next/Previous/Select picks a track the crossfade didn't predict -
  // either way the ramp in progress is no longer meaningful and must not be left half-applied.
  const unwindCrossfade = (volume: number) => {
    if (!crossfadeActive.current) return;
    crossfadeActive.current = false;
    player.current?.setVolume(volume * 100);
    holdStandby();
    if (hostA.current) hostA.current.style.opacity = '';
    if (hostB.current) hostB.current.style.opacity = '';
  };

  // The hotswap itself: the standby becomes the front/audible player, the old front goes
  // silent and is kept around as the next standby. `serialAfter` is what loaded.current.serial
  // must become - the server's post-advance serial when we're predicting an 'ended' advance
  // (s.serial + 1), or the already-current one when the server has already moved. `notify`
  // tells the server about the advance, which only the audio owner may do.
  const finalizeSwap = (s: Session, next: Song, serialAfter: number, notify: boolean) => {
    const p = player.current, b = standby.current;
    if (!p || !b) return;
    finalizing.current = true;
    p.setVolume(0); p.mute(); p.pauseVideo();
    if (audible()) { b.setVolume((s.volume ?? .8) * 100); b.unMute(); } else { b.setVolume(0); b.mute(); }
    standbyArmed.current = true;
    if (s.playing) b.playVideo();
    frontIsA.current = !frontIsA.current;
    setFront(frontIsA.current ? hostA.current : hostB.current, frontIsA.current ? hostB.current : hostA.current);
    if (hostA.current) hostA.current.style.opacity = '';
    if (hostB.current) hostB.current.style.opacity = '';
    player.current = b; standby.current = p;
    hasPlayed.current = true;
    loaded.current = { id: next.id, serial: serialAfter };
    ended.current = -1;
    standbyForId.current = -1; crossfadeActive.current = false;
    if (notify) void latest.current.send({ type: 'ended', serial: s.serial });
    setTimeout(() => { finalizing.current = false; }, 400);
  };

  // Shared by both the front and standby players: a player keeps its onStateChange handler
  // for its whole life, but which one is "the active player" changes at swap time. Checking
  // e.target === player.current here (live, not at creation time) is what lets a demoted
  // player's own trailing "ended" event be ignored instead of double-reporting the advance
  // that the crossfade already predicted and sent.
  const handleStateChange = (e: Event) => {
    const c = latest.current, s = c.state;
    if (e.target !== player.current) {
      // The standby's first PLAYING means it has buffered its opening: park it there until the
      // fade actually arms it.
      if (e.data === 1 && e.target === standby.current && !standbyArmed.current && !crossfadeActive.current) holdStandby();
      return;
    }
    if (!s || loaded.current.serial !== s.serial) return;
    if (e.data === 0 && ended.current !== s.serial) {
      // The real end arrived before the 100ms tick caught the last 0.15s (YouTube's clock
      // updates are coarse right at the end). If the standby is ready for exactly what comes
      // next, finish the crossfade with a hotswap rather than letting the ordinary advance
      // reload the next song into the front player from scratch.
      const next = upcoming(s);
      if (standby.current && standbyForId.current === next.id && s.queue[s.index]?.id === loaded.current.id) { finalizeSwap(s, next, s.serial + 1, !!c.owner); return; }
      if (c.owner) { ended.current = s.serial; void c.send({ type: 'ended', serial: s.serial }); }
    }
    if (!c.owner) { if (e.data === 1) setNotice(''); return; }
    if (e.data === 1) { hasPlayed.current = true; setNotice(''); if (!s.playing) void c.send({ type: 'play' }); }
    if (e.data === 2 && hasPlayed.current && Date.now() > suppressPauseUntil.current && s.playing && e.target.getCurrentTime() < e.target.getDuration() - .5) void c.send({ type: 'pause' });
  };

  // Crossfade: every screen performs the visual cross-dissolve so the TV, the host console and
  // any mirror all show the same transition; the audio ramp is heard only where `audible()`.
  // Only the owner reports the advance to the server. With no transition configured,
  // everything keeps the original single-player cut.
  const maybeBufferStandby = (s: Session) => {
    if (!s.fade || !player.current || finalizing.current) return;
    // s.index can briefly lag what's actually loaded right after a crossfade hotswap - the
    // server only confirms the advance after a round trip, while the active player already
    // jumped to the new song locally and immediately. Computing "next" from a stale index in
    // that gap would target the wrong track (often the song that *just* became current) and
    // could fire straight into another swap, cutting the new song short. Wait for s.index to
    // actually agree with what's loaded before reasoning about what's next.
    if (s.queue[s.index]?.id !== loaded.current.id) return;
    const nextTrack = upcoming(s);
    if (standbyForId.current === nextTrack.id) return;
    const dur = player.current.getDuration(), cur = player.current.getCurrentTime();
    if (!dur || dur - cur > STANDBY_LEAD_SECONDS) return;
    standbyForId.current = nextTrack.id;
    standbyArmed.current = false;
    const targetIsB = frontIsA.current;
    const existing = targetIsB ? playerB.current : playerA.current;
    if (existing) {
      // Reusing a player created for an earlier transition - already ready, just retarget it.
      standby.current = existing;
      existing.setVolume(0); existing.mute();
      existing.loadVideoById({ videoId: nextTrack.youtubeId, startSeconds: 0 });
      return;
    }
    const host = targetIsB ? hostB.current : hostA.current;
    const into = targetIsB ? playerB : playerA;
    const setReady = targetIsB ? setReadyB : setReadyA;
    if (!host) return;
    const mount = document.createElement('div'); host.replaceChildren(mount);
    void loadAPI().then(YT => {
      new YT.Player(mount, {
        playerVars: { autoplay: 0, controls: 0, fs: 0, playsinline: 1, rel: 0, origin: location.origin },
        events: {
          onReady: e => { into.current = e.target; standby.current = e.target; e.target.setVolume(0); e.target.mute(); e.target.loadVideoById({ videoId: nextTrack.youtubeId, startSeconds: 0 }); setReady(n => n + 1); },
          onAutoplayBlocked: () => {},
          onError: () => { standbyForId.current = -1; },
          onStateChange: handleStateChange,
        },
      });
    });
  };

  // Gradual overlapping crossfade: starting `s.fade` seconds before the current song's
  // predicted end, both videos play and are audible together - A's volume ramps down to 0
  // while B's ramps up from 0, in lockstep with a matching visual cross-dissolve, finishing
  // with a clean hotswap into B as the new front/audible player right at the real end.
  const maybeSwap = (s: Session) => {
    if (!s.fade || finalizing.current) return;
    const p = player.current, b = standby.current;
    if (!p || !b) return;
    // Same staleness guard as maybeBufferStandby: don't reason about "next" from an s.index
    // that hasn't yet caught up to what's actually loaded after the previous hotswap.
    if (s.queue[s.index]?.id !== loaded.current.id) return;
    const nextTrack = upcoming(s);
    if (standbyForId.current !== nextTrack.id) return;
    const dur = p.getDuration(), cur = p.getCurrentTime();
    if (!dur) return;
    const remaining = dur - cur;
    if (remaining > s.fade) {
      // Seeked back out of the window: abandon any ramp in progress and re-park the standby.
      if (crossfadeActive.current) unwindCrossfade(s.volume ?? .8);
      else if (standbyArmed.current) holdStandby();
      return;
    }
    const hear = audible();
    if (!crossfadeActive.current) {
      // Entering the window: release the parked standby, then wait until it is genuinely
      // playing before ramping - never fade into a player that's still buffering, that would
      // just relocate the stall into the middle of the crossfade. If the current song reaches
      // its real end first, the ENDED handler above still hotswaps as a fallback.
      if (!standbyArmed.current) { standbyArmed.current = true; b.setVolume(0); b.playVideo(); return; }
      if (b.getPlayerState() !== 1) return;
      crossfadeActive.current = true;
      b.setVolume(0);
    }
    if (hear === b.isMuted()) { if (hear) b.unMute(); else b.mute(); }
    const vol = hear ? (s.volume ?? .8) * 100 : 0;
    const progress = Math.min(1, Math.max(0, 1 - remaining / s.fade));
    p.setVolume(vol * (1 - progress));
    b.setVolume(vol * progress);
    const frontEl = frontIsA.current ? hostA.current : hostB.current;
    const backEl = frontIsA.current ? hostB.current : hostA.current;
    if (frontEl) frontEl.style.opacity = String(1 - progress);
    if (backEl) backEl.style.opacity = String(progress);
    if (remaining > 0.15) return;
    // Predict the server's post-advance serial so the ready-effect below treats the already-
    // playing swapped-in player as already correct, instead of reloading or seeking it.
    finalizeSwap(s, nextTrack, s.serial + 1, !!latest.current.owner);
  };

  useEffect(() => {
    if (!hasSession || !hostA.current) return;
    let disposed = false;
    let instance: Player | undefined;
    const mount = document.createElement('div'); hostA.current.replaceChildren(mount);
    loaded.current = { id: -1, serial: -1 }; ended.current = -1;
    frontIsA.current = true; standbyForId.current = -1; crossfadeActive.current = false; finalizing.current = false; standbyArmed.current = false;
    playerB.current = null; standby.current = null; setReadyB(0);
    setFront(hostA.current, hostB.current);
    void loadAPI().then(YT => {
      if (disposed) return;
      instance = new YT.Player(mount, {
        // No initial videoId: the ready-triggered effect below loads the current
        // track exactly once, with the correct resume position. Passing a videoId
        // here too would cue it a second time, racing that effect's own load and
        // producing a visible mute/pause glitch on the very first track shown.
        playerVars: { autoplay: 0, controls: 1, fs: 1, playsinline: 1, rel: 0, origin: location.origin },
        events: {
          onReady: e => { if (disposed) return; playerA.current = e.target; player.current = e.target; if (!latest.current.owner) e.target.mute(); setReadyA(n => n + 1); },
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
          onError: e => { if (disposed) return; if (e.target !== player.current) { standbyForId.current = -1; return; } setNotice(e.data === 153 ? 'YouTube requires a valid app address/referrer. Open this page using http:// or https:// and retry.' : e.data === 101 || e.data === 150 ? 'The owner does not allow this video in embedded players. Choose another video or open YouTube.' : e.data === 100 ? 'This video is unavailable or private. Skip it or choose another version.' : `YouTube playback error ${e.data}. Retry or choose another video.`); },
          onStateChange: e => { if (!disposed) handleStateChange(e); },
        },
      });
    }).catch(e => { if (!disposed) setNotice(e.message); });
    const tick = setInterval(() => {
      const p = player.current, s = latest.current.state;
      if (!p || !s) return;
      // Mute only, never hard-pause here: a backgrounded/throttled tab (screen lock, app
      // switch) can miss a heartbeat and look briefly "disconnected" even though nothing
      // is actually wrong. Pausing would visibly restart the video on every such blip;
      // muting just goes quiet and resumes in sync once the heartbeat catches up.
      if (!latest.current.connected || !s.owner || s.owner.expires <= Date.now()) { p.mute(); return; }
      if (!audible()) p.mute(); else p.setVolume(s.volume * 100);
      // Every screen runs the crossfade (silently where not audible) so the visual transition
      // is the same on the TV, the host console and any mirror.
      if (s.playing && p.getPlayerState() === 1) { maybeBufferStandby(s); maybeSwap(s); }
    }, 100);
    const report = setInterval(() => {
      const p = player.current, c = latest.current;
      if (p && c.owner && c.state && loaded.current.serial === c.state.serial) void c.send({ type: 'report', serial: loaded.current.serial, time: p.getCurrentTime() || 0, duration: p.getDuration() || 0, progressing: p.getPlayerState() === 1 });
    }, 1000);
    const unlock = (event: { type: string }) => { const c = latest.current; if (!player.current) return; blocked.current = false; setSoundBlocked(false); localSound.current = !c.owner; setListeningHere(!c.owner); player.current.setVolume((c.state?.volume ?? .8) * 100); player.current.unMute(); suppressPauseUntil.current = Date.now() + 1500; if (event.type === 'mirc-play') player.current.playVideo(); };
    window.addEventListener('mirc-play', unlock);
    window.addEventListener('mirc-sound', unlock);
    return () => {
      window.removeEventListener('mirc-play', unlock); window.removeEventListener('mirc-sound', unlock);
      disposed = true; clearInterval(tick); clearInterval(report);
      player.current = null; standby.current = null; playerA.current = null; playerB.current = null;
      instance?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSession, attempt]);
  useEffect(() => {
    let p = player.current;
    if (!p || !ready || !state) return;
    const track = state.queue[state.index];
    if (loaded.current.id !== track.id) {
      if (standby.current && standbyForId.current === track.id) {
        // The queue moved onto exactly the song this screen's standby already holds - whether
        // because the audio owner elsewhere advanced first, or the host pressed Next - so hand
        // over to it right now instead of reloading the same song into the front player.
        finalizeSwap(state, track, state.serial, false);
        p = player.current!;
      } else {
        // A genuinely new track that the crossfade didn't predict (manual Previous/Select, or
        // another screen's action) - abandon any in-progress fade cleanly instead of letting
        // it keep ramping toward a standby that's no longer the right "next" song.
        unwindCrossfade(state.volume ?? .8);
        standbyForId.current = -1;
        loaded.current = { id: track.id, serial: state.serial }; ended.current = -1; hasPlayed.current = false;
        const video = { videoId: track.youtubeId, startSeconds: playbackPosition(state) };
        p.setVolume(owner || localSound.current ? state.volume * 100 : 0);
        if (state.playing) p.loadVideoById(video); else p.cueVideoById(video);
      }
    } else if (loaded.current.serial !== state.serial) {
      loaded.current.serial = state.serial; ended.current = -1; p.seekTo(state.seek, true);
    }
    if ((owner || localSound.current) && !blocked.current) { if (p.isMuted()) suppressPauseUntil.current = Date.now() + 1500; p.unMute(); } else p.mute();
    if (state.playing) {
      p.playVideo();
      // Keep the standby moving in lockstep while a crossfade is actively overlapping the two
      // players - otherwise a pause/resume during the overlap window leaves it frozen while
      // the front player continues, breaking the sync between them.
      if (crossfadeActive.current) standby.current?.playVideo();
    } else {
      p.pauseVideo();
      if (crossfadeActive.current) standby.current?.pauseVideo();
    }
    // Telemetry must not restart or seek the player.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.index, state?.serial, state?.playing, ready, owner]);
  // A silent display follows the audible player's clock and never advances the queue.
  useEffect(() => {
    const p = player.current;
    if (!p || !state || owner || !ready) return;
    if (!localSound.current || blocked.current) p.mute();
    if (loaded.current.serial !== state.serial) return;
    // Right after a track change the server's clock is only a placeholder (time 0, duration 0)
    // until the audio owner's first report for the new song lands. Syncing to that placeholder
    // would yank a crossfaded-in standby back to 0:00 for a second, replaying what was just
    // heard, before the real position arrives - so wait for the owner to actually report.
    if (!state.duration) return;
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
  return <div className="youtube-player" data-audio-owner={owner ? "true" : "false"}>
    <div className="youtube-stage">
      <div className="youtube-host youtube-host--front" ref={hostA} />
      <div className="youtube-host youtube-host--back" ref={hostB} />
    </div>
    <div className="screen-actions"><button data-action="enable-player" onClick={() => { window.dispatchEvent(new Event('mirc-play')); setNotice(''); void send({ type: 'play' }); }}>{soundBlocked || (!owner && !listeningHere) ? 'Sound on here' : 'Play'}</button>{!owner && listeningHere && <button onClick={() => { localSound.current = false; setListeningHere(false); player.current?.mute(); }}>Mute this screen</button>}<button onClick={() => { setReadyA(0); setNotice(''); setAttempt(n => n + 1); }}>Retry</button><button onClick={() => void send({ type: 'next' })}>Skip</button><a href={`https://www.youtube.com/watch?v=${state!.queue[state!.index].youtubeId}`} target="_blank" rel="noreferrer">Open YouTube ↗</a></div>{(owner || listeningHere) && soundBlocked && <p className="screen-help">Video starts automatically muted. Tap Sound on here to allow audio on this screen.</p>}{!connected && <p className="embed-notice">Connection lost. Reconnecting…</p>}{connected && !owner && !listeningHere && <p className="screen-help">Video is synchronized. Use Sound on here to hear it on this device too.</p>}{notice && <p role="status" className="embed-notice">{notice}</p>}</div>;
}
