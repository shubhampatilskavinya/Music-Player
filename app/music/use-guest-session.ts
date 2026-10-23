'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { id } from './use-session';
import type { Command, Session } from './session';

export function useGuestSession() {
  const [state, setState] = useState<Session | null>(null);
  const [error, setError] = useState('');
  const serial = useRef(Promise.resolve());
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { const response = await fetch('/api/session', { cache: 'no-store' }); if (response.ok) setState(await response.json()); }
      catch { /* retry on next tick */ }
      if (!cancelled) timer = setTimeout(poll, 3000);
    };
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);
  const send = useCallback((command: Command): Promise<Session | null> => {
    const work = serial.current.then(async () => {
      try {
        const response = await fetch('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client: id(), requestId: id(), command }), signal: AbortSignal.timeout(8000) });
        const data = await response.json();
        if (!response.ok) throw Error(data.error || 'Command failed');
        setState(data); setError(''); return data as Session;
      } catch (e) { setError((e as Error).message); return null; }
    });
    serial.current = work.then(() => {}); return work;
  }, []);
  return { state, send, error };
}
