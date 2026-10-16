// One YouTube player: fade out before the clip ends, then fade in the next clip.
// Playback time makes fades pause during buffering and follow seeks naturally.
export function playbackGain(elapsed: number, duration: number, seconds: number) {
  if (seconds <= 0) return 1;
  const fade = duration > 0 ? Math.min(seconds, duration / 2) : seconds;
  if (fade <= 0) return 1;
  const fadeIn = Math.max(0, elapsed) / fade;
  const fadeOut = duration > 0 ? Math.max(0, duration - elapsed) / fade : 1;
  return Math.max(0, Math.min(1, fadeIn, fadeOut));
}
