'use client';
import { useState } from 'react';
import { MusicNoteIcon } from '../icons';

export default function JoinForm() {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !code) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/auth/guest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, name }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not join.');
      location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join.');
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-mark"><span className="brand-mark"><MusicNoteIcon /></span></div>
        <h1>Join the party</h1>
        <p className="login-subtitle">Enter the party code shown on the TV.</p>
        <form className="login-form" onSubmit={submit}>
          <label htmlFor="party-code">Party code</label>
          <input id="party-code" type="text" autoCapitalize="characters" autoCorrect="off" autoComplete="off" autoFocus value={code} onChange={e => setCode(e.target.value)} placeholder="MIRC-7" />
          <label htmlFor="guest-name">Your name (optional)</label>
          <input id="guest-name" type="text" maxLength={40} value={name} onChange={e => setName(e.target.value)} placeholder="So your songs get credit" />
          {error && <p className="embed-notice" role="alert">{error}</p>}
          <button className="primary-button" type="submit" disabled={busy || !code}>{busy ? 'Joining…' : 'Join'}</button>
        </form>
      </div>
    </div>
  );
}
