import type { Command } from '../music/session';
import type { Identity } from './identity';

export class ForbiddenError extends Error { status = 403; constructor(message = 'You are not allowed to do that.') { super(message); } }

// Screen-lease commands arbitrate which device has audio; they are unrelated to party roles.
// `play`/`pause` are included because the active screen's YouTubePlayer also sends them on its
// own, unprompted, whenever the real iframe state drifts from the shared session (buffering,
// a native pause, etc.) - that reconciliation has to work from an unauthenticated public TV
// screen too, not just a logged-in host tab. Guests never trigger it: their console has no
// YouTube player and no play/pause control at all.
const LEASE_COMMANDS = new Set(['heartbeat', 'release', 'ended', 'report', 'play', 'pause']);
const GUEST_ALLOWED = new Set(['append', 'play-next', 'remove']);

export function authorizeCommand(identity: Identity | null, command: Command) {
  if (LEASE_COMMANDS.has(command.type)) return;
  if (!identity) throw new ForbiddenError('Sign in to control the party.');
  if (identity.role === 'host') return;
  if (!GUEST_ALLOWED.has(command.type)) throw new ForbiddenError('Guests can only add songs or remove the ones they added.');
}
