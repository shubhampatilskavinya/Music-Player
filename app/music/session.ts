import { songs, type Song } from '../songs';
export type Session = {
  queue: Song[]; index: number; playing: boolean; volume: number; fade: number;
  reportedAt?: number; progressing?: boolean; serial: number; seek: number; time: number; duration: number; revision: number;
  owner: { id: string; role: 'controller' | 'tv'; expires: number; readyAt: number; previous?: string } | null;
};
export type Command = { type: string; value?: number; song?: Song; serial?: number; time?: number; duration?: number; progressing?: boolean; role?: 'controller' | 'tv' };
export function initialSession(): Session {
  return { queue: [...songs], index: 0, playing: false, volume: .8, fade: 3, serial: 0, seek: 0, time: 0, duration: 0, revision: Date.now(), owner: null };
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
        s.owner = { id: client, role: cmd.role, expires: now + 5000, readyAt, previous };
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
      s.queue.splice(cmd.type === 'play-next' ? s.index + 1 : s.queue.length, 0, { id: Math.max(...s.queue.map(t => t.id), 0) + 1, youtubeId: song.youtubeId, title: song.title.slice(0, 250), artist: String(song.artist || 'YouTube').slice(0, 150), movie: 'YouTube request', duration: '', external: true, gradient: 'from-fuchsia-500 to-indigo-500' });
      if (cmd.type === 'append-play') { select(s.queue.length - 1); s.playing = true; }
      break;
    }
    case 'remove': {
      const index = s.queue.findIndex(song => song.id === cmd.value);
      if (index < 0) break;
      if (s.queue.length === 1) throw Error('Keep at least one song in the playlist.');
      s.queue.splice(index, 1);
      if (index < s.index) s.index--;
      else if (index === s.index) select(Math.min(index, s.queue.length - 1));
      break;
    }
    case 'select': select(Math.trunc(number(cmd.value, 0, s.queue.length - 1))); s.playing = true; break;
    case 'next': select((s.index + 1) % s.queue.length); break;
    case 'previous': select((s.index - 1 + s.queue.length) % s.queue.length); break;
    case 'play': s.playing = true; break;
    case 'pause': s.time = playbackPosition(s, now); s.playing = false; s.progressing = false; break;
    case 'volume': s.volume = number(cmd.value, 0, 1); break;
    case 'fade': s.fade = number(cmd.value, 0, 8); break;
    case 'seek': s.seek = number(cmd.value, 0, s.duration || 86400); s.time = s.seek; s.progressing = false; s.reportedAt = now; s.serial++; break;
    case 'ended': if (owns && cmd.serial === s.serial) select((s.index + 1) % s.queue.length); break;
    case 'report': if (owns && cmd.serial === s.serial) { s.time = number(cmd.time, 0, 86400); s.duration = number(cmd.duration, 0, 86400); s.reportedAt = now; s.progressing = cmd.progressing === true; } break;
    default: throw Error('Unknown command');
  }
  s.revision = Math.max(now, s.revision + 1);
  return s;
}
