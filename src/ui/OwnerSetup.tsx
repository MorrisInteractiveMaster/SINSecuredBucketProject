import React, { useState } from 'react';
import type { Api } from './types';
import { Button } from './components';

export function OwnerSetup({ mode, api, signOut, continueToPortal }: {
  mode: 'activate' | 'window';
  api: Api;
  signOut: () => void;
  continueToPortal: () => Promise<void>;
}) {
  const [stage, setStage] = useState(mode);
  const [code, setCode] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit() {
    if (busy || (stage === 'activate' ? !/^[0-9a-f]{64}$/.test(code) : !confirmed)) return;
    setBusy(true);
    setError('');
    try {
      if (stage === 'activate') {
        await api('portalActivateOwner', { code: code.trim() });
        setCode('');
        setStage('window');
        return;
      }
      if (stage === 'window') {
        await api('portalOwnerWindow', { action: 'open', confirmed: true });
      }
      await continueToPortal();
    } catch {
      setError('Setup could not be completed. Check the activation code or sign in again with your approved Microsoft account. Contact the portal operator if access is still unavailable.');
    } finally {
      setBusy(false);
    }
  }
  return <main className="welcome-shell">
    <section className="data-panel security-card" style={{ maxWidth: 580, margin: '3rem auto' }}>
      <h1>{stage === 'activate' ? 'Set up the SIN Portal' : 'Open a synthetic test window'}</h1>
      <p>{stage === 'activate'
        ? 'Use the single-use activation code provided by your deployment operator. The portal verifies your Microsoft account and establishes your administrator access.'
        : 'Open a two-hour window for dedicated test accounts and synthetic fixtures.'}</p>
      <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        {stage === 'activate' ? <label className="field-label">Owner activation code
          <input type="password" required autoComplete="off" maxLength={64} value={code}
            onChange={(event) => setCode(event.target.value)} />
        </label> : <label>
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
          I confirm that the approved cost and isolation conditions still apply.
        </label>}
        {error && <p role="alert">{error}</p>}
        <div className="modal-actions">
          <Button disabled={busy} onClick={signOut}>Sign out</Button>
          <Button type="submit" kind="primary" busy={busy}
            disabled={stage === 'activate' ? !/^[0-9a-f]{64}$/.test(code) : !confirmed}>
            {stage === 'activate' ? 'Activate owner access' : 'Open test window'}
          </Button>
        </div>
      </form>
    </section>
  </main>;
}
