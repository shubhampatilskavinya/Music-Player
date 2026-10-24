import { songs, type Song } from '../songs';
import type { Identity } from '../auth/identity';
export type Session = {
  queue: Song[]; index: number; playing: boolean; volume: number; fade: number;
  reportedAt?: number; progressing?: boolean; serial: number; seek: number; time: number; duration: number; revision: number;
  owner: { id: string; role: 'controller' | 'tv'; expires: number; readyAt: number; previous?: string } | null;
};
export type Command = { type: string; value?: number; song?: Song; serial?: number; time?: number; duration?: number; progressing?: boolean; role?: 'controller' | 'tv'; identity?: Identity; position?: number };
// Wide enough to absorb Vercel cold starts and Upstash REST latency; a same-process
// local server would be fine with far less, but this lease is shared by both.
export const LEASE_MS = 20000;
export function initialSession(): Session {
  return { queue: [...songs], index: 0, playing: false, volume: .8, fade: 10, serial: 0, seek: 0, time: 0, duration: 0, revision: Date.now(), owner: null };
}
export function playbackPosition(s: Session, now = Date.now()) {
  const elapsed = s.playing && s.progressing && s.reportedAt ? Math.min(5, Math.max(0, (now - s.reportedAt) / 1000)) : 0;
  return Math.min(s.duration || 86400, s.time + elapsed);
}
export function changeSession(s: Session, cmd: Command, client: string, now = Date.now()) {
  const active = s.owner && s.owner.expires > now;
  const owns = active && s.owner!.id === client && s.owner!.readyAt <= now;
  const number = (v: unknown, min: number, max: number) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) throw Error('Invalid number');
    return Math.max(min, Math.min(max, v));
  };
  const select = (index: number) => { s.index = index; s.serial++; s.time = 0; s.seek = 0; s.duration = 0; s.progressing = false; s.reportedAt = now; };
  switch (cmd.type) {
    case 'heartbeat': {
      if (cmd.role !== 'tv' && cmd.role !== 'controller') throw Error('Invalid screen');
      if (!active || s.owner!.id === client || (cmd.role === 'tv' && s.owner!.role === 'controller')) {
        const readyAt = active && s.owner!.id !== client ? s.owner!.expires : s.owner?.id === client ? s.owner.readyAt : now;
        const previous = active && s.owner!.id !== client ? s.owner!.id : s.owner?.previous;
        s.owner = { id: client, role: cmd.role, expires: now + LEASE_MS, readyAt, previous };
      }
      break;
    }
    case 'release': if (s.owner?.previous === client) { s.owner.readyAt = now; delete s.owner.previous; } break;
    case 'play-next':
    case 'append':
    case 'append-play': {
      const song = cmd.song;
      if (!song || typeof song.youtubeId !== 'string' || !/^[\w-]{11}$/.test(song.youtubeId) || typeof song.title !== 'string' || !song.title.trim()) throw Error('Invalid song');
      if (s.queue.length >= 500) throw Error('Playlist is full (500 songs).');
      const requestedBy = cmd.identity ? { id: cmd.identity.id, name: cmd.identity.name } : undefined;
      // Only the host can choose an exact upcoming slot; everyone else just gets "next" (offset 1).
      const offset = cmd.type === 'play-next' && cmd.identity?.role === 'host' && cmd.position !== undefined ? Math.max(1, Math.trunc(number(cmd.position, 1, 500))) : 1;
      const insertAt = cmd.type === 'play-next' ? Math.min(s.index + offset, s.queue.length) : s.queue.length;
      s.queue.splice(insertAt, 0, { id: Math.max(...s.queue.map(t => t.id), 0) + 1, youtubeId: song.youtubeId, title: song.title.slice(0, 250), artist: String(song.artist || 'YouTube').slice(0, 150), movie: 'YouTube request', duration: '', external: true, gradient: 'from-fuchsia-500 to-indigo-500', requestedBy });
      if (cmd.type === 'append-play') { select(s.queue.length - 1); s.playing = true; }
      break;
    }
    case 'remove': {
      const index = s.queue.findIndex(song => song.id === cmd.value);
      if (index < 0) break;
      if (cmd.identity?.role === 'guest' && s.queue[index].requestedBy?.id !== cmd.identity.id) throw Error('You can only remove songs you added.');
      if (s.queue.length === 1) throw Error('Keep at least one song in the playlist.');
      s.queue.splice(index, 1);
      if (index < s.index) s.index--;
      else if (index === s.index) select(Math.min(index, s.queue.length - 1));
      break;
    }
    case 'add-to-playlist': {
      const song = cmd.song;
      if (!song || typeof song.youtubeId !== 'string' || !/^[\w-]{11}$/.test(song.youtubeId) || typeof song.title !== 'string' || !song.title.trim()) throw Error('Invalid song');
      if (s.queue.length >= 500) throw Error('Playlist is full (500 songs).');
      // `position` here is an absolute row number in the full playlist (matching the "#"
      // column in Browse full playlist), not an offset from the current song - this command
      // is about where the song sits in the catalog listing, not when it plays next.
      const insertAt = cmd.position !== undefined ? Math.max(0, Math.min(Math.trunc(number(cmd.position, 1, 500)) - 1, s.queue.length)) : s.queue.length;
      s.queue.splice(insertAt, 0, { id: Math.max(...s.queue.map(t => t.id), 0) + 1, youtubeId: song.youtubeId, title: song.title.slice(0, 250), artist: String(song.artist || 'YouTube').slice(0, 150), movie: 'YouTube request', duration: '', gradient: 'from-fuchsia-500 to-indigo-500' });
      if (insertAt <= s.index) s.index++;
      break;
    }
    case 'promote': {
      const from = s.queue.findIndex(song => song.id === cmd.value);
      if (from < 0 || from === s.index || from === s.index + 1) break;
      const [song] = s.queue.splice(from, 1);
      s.queue.splice((from < s.index ? s.index - 1 : s.index) + 1, 0, song);
      if (from < s.index) s.index--;
      break;
    }
    case 'reorder': {
      // Like 'promote', but to any upcoming slot, not just "next" (position 1 = next, 2 = after that, ...).
      const from = s.queue.findIndex(song => song.id === cmd.value);
      if (from < 0 || from === s.index) break;
      const offset = Math.max(1, Math.trunc(number(cmd.position, 1, 500)));
      const [song] = s.queue.splice(from, 1);
      const base = from < s.index ? s.index - 1 : s.index;
      s.queue.splice(Math.min(base + offset, s.queue.length), 0, song);
      if (from < s.index) s.index--;
      break;
    }
    case 'select': select(Math.trunc(number(cmd.value, 0, s.queue.length - 1))); s.playing = true; break;
    case 'next': select((s.index + 1) % s.queue.length); break;
    case 'previous': select((s.index - 1 + s.queue.length) % s.queue.length); break;
    case 'play': s.playing = true; break;
    case 'pause': s.time = playbackPosition(s, now); s.playing = false; s.progressing = false; break;
    case 'volume': s.volume = number(cmd.value, 0, 1); break;
    case 'fade': s.fade = number(cmd.value, 0, 15); break;
    case 'seek': s.seek = number(cmd.value, 0, s.duration || 86400); s.time = s.seek; s.progressing = false; s.reportedAt = now; s.serial++; break;
    case 'ended': if (owns && cmd.serial === s.serial) select((s.index + 1) % s.queue.length); break;
    case 'report': if (owns && cmd.serial === s.serial) { s.time = number(cmd.time, 0, 86400); s.duration = number(cmd.duration, 0, 86400); s.reportedAt = now; s.progressing = cmd.progressing === true; } break;
    default: throw Error('Unknown command');
  }
  s.revision = Math.max(now, s.revision + 1);
  return s;
}
