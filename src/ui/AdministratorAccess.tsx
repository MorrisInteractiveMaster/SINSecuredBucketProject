import React, { useEffect, useState } from 'react';
import type { Api } from './types';
import { Button } from './components';

type Administrator = { key: string; label: string; owner: boolean; active: boolean; connected: boolean };
export function AdministratorAccess({ api, signOut, permanent = false }: { api: Api; signOut: () => void; permanent?: boolean }) {
  const [rows, setRows] = useState<Administrator[] | null>(null);
  const [pending, setPending] = useState<Administrator | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  async function load(data: Record<string, unknown> = {}) {
    setBusy(true);
    setStatus('');
    try {
      const result = await api<{ administrators: Administrator[] }>('portalAdministrators', data);
      setRows(result.administrators);
      if (Object.keys(data).length) {
        setPending(null);
        setStatus('Administrator access updated.');
      }
    } catch {
      setStatus('Administrator access could not be updated or loaded. Verify your authorization and try again.');
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => { void load(); }, [api]);
  async function closeWindow() {
    setBusy(true);
    try {
      await api('portalOwnerWindow', { action: 'close' });
      signOut();
    } catch {
      setStatus('Could not close the test window. Try again.');
      setBusy(false);
    }
  }
  return <section className="data-panel security-card">
    <h2>Administrator access</h2>
    <p>Approved staff sign in with their Microsoft organizational accounts. Revoking access blocks new portal requests.</p>
    <p role="status">{status || (busy ? 'Checking administrator access…' : '')}</p>
    {rows?.map((row) => <div className="modal-actions" key={row.key}>
      <span>{row.label} · {row.owner ? 'Owner' : 'Administrator'} · {row.active ? (row.connected ? 'Connected' : 'Awaiting sign-in') : 'Revoked'}</span>
      {!row.owner && <Button disabled={busy} onClick={() => setPending(row)}>
        {row.active ? 'Revoke access' : 'Restore access'}
      </Button>}
    </div>)}
    {pending && <div className="callout">
      <p>{pending.active ? 'Revoke' : 'Restore'} portal access for {pending.label}?</p>
      <Button disabled={busy} onClick={() => setPending(null)}>Cancel</Button>
      <Button disabled={busy} onClick={() => void load({ key: pending.key, active: !pending.active })}>Confirm</Button>
    </div>}
    <Button disabled={busy} onClick={() => void load()}>Refresh roles</Button>
    {!permanent && <Button disabled={busy} onClick={() => void closeWindow()}>Close synthetic test window</Button>}
  </section>;
}
