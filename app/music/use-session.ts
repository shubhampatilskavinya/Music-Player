'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Command, Session } from './session';
export function id() { return Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join(''); }
export function useSession(tv: boolean) {
  const [state, setState] = useState<Session | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [client, setClient] = useState('');
  const [now, setNow] = useState(0);
  const lastContact = useRef(0);
  const serial = useRef(Promise.resolve());
  const accept = useCallback((next: Session) => {
    setState(old => !old || next.revision >= old.revision ? next : old);
    lastContact.current = Date.now(); setConnected(true);
  }, []);
  useEffect(() => {
    // Persist per-tab (not per-browser) so a refresh keeps this exact device's lease
    // instead of minting a new id the server treats as a second, competing screen -
    // which otherwise has to wait out the old (now-gone) id's full lease before this
    // tab can own audio again. A new tab still gets its own id, preserving the
    // same-role conflict handling between genuinely separate devices.
    let stored = '';
    try { stored = sessionStorage.getItem('mirc_client') || ''; } catch { /* private browsing, etc. */ }
    if (!/^[a-f0-9]{32}$/.test(stored)) {
      stored = id();
      try { sessionStorage.setItem('mirc_client', stored); } catch { /* fall back to in-memory only */ }
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setClient(stored);
  }, []);
  const send = useCallback((command: Command): Promise<Session | null> => {
    if (!client) return Promise.resolve(null);
    const requestId = id();
    const work = serial.current.then(async () => {
      try {
        const response = await fetch('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client, requestId, command }), signal: AbortSignal.timeout(8000) });
        const data = await response.json();
        if (!response.ok) throw Error(data.error || 'Command failed');
        accept(data); setError(''); return data as Session;
      } catch (e) { setError((e as Error).message); return null; }
    });
    serial.current = work.then(() => {}); return work;
  }, [client, accept]);
  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await send({ type: 'heartbeat', role: tv ? 'tv' : 'controller' });
      if (!cancelled) timer = setTimeout(poll, 2000);
    };
    void poll();
    const watchdog = setInterval(() => { setNow(Date.now()); if (Date.now() - lastContact.current > 10000) setConnected(false); }, 250);
    // A backgrounded tab/screen-locked device throttles timers, so the next scheduled
    // heartbeat can be badly delayed. Firing one immediately on return shortens that gap.
    const onVisible = () => { if (document.visibilityState === 'visible') { clearTimeout(timer); void poll(); } };
    document.addEventListener('visibilitychange', onVisible);
    return () => { cancelled = true; clearTimeout(timer); clearInterval(watchdog); document.removeEventListener('visibilitychange', onVisible); };
  }, [client, tv, send]);
  const owner = connected && !!state?.owner && state.owner.id === client && state.owner.readyAt <= now && state.owner.expires > now;
  return { state, send, client, owner, connected, error, tv, connecting: connected && state?.owner?.id === client && !owner };
}
export type Connection = ReturnType<typeof useSession>;
