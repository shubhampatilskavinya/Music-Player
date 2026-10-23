'use client';
import { useState } from 'react';

export default function PinForm() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !pin) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/auth/host', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Login failed.');
      location.href = '/';
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed.');
      setBusy(false);
    }
  };

  return (
    <form className="login-form" onSubmit={submit}>
      <label htmlFor="host-pin">Host PIN</label>
      <input id="host-pin" type="password" inputMode="numeric" autoComplete="current-password" autoFocus value={pin} onChange={e => setPin(e.target.value)} />
      {error && <p className="embed-notice" role="alert">{error}</p>}
      <button className="primary-button" type="submit" disabled={busy || !pin}>{busy ? 'Checking…' : 'Enter'}</button>
    </form>
  );
}
