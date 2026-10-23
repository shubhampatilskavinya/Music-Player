const store = globalThis as typeof globalThis & { mircLoginAttempts?: Map<string, { count: number; resetAt: number }> };
const attempts = store.mircLoginAttempts ||= new Map();
const WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 8;

export function tooManyAttempts(key: string, now = Date.now()): boolean {
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) { attempts.set(key, { count: 1, resetAt: now + WINDOW_MS }); return false; }
  return ++entry.count > MAX_ATTEMPTS;
}
export function resetAttempts(key: string) { attempts.delete(key); }
