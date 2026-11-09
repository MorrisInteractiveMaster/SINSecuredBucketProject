import React from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { api, logout } from '../../src/app/client';
import App from '../../src/ui/App';
import { authorizationFailure } from '../../src/app/session';

vi.mock('../../src/app/client', () => ({
  isLocal: false, warmClient: async () => ({}), api: vi.fn(), login: vi.fn(),
  logout: vi.fn(), devLogin: vi.fn(), message: () => 'Access unavailable.',
}));
vi.mock('../../src/ui/Dashboard', () => ({
  default: ({ api: request, signOut, authorizationPending }: any) => <div>
    <h1>Staff dashboard</h1>
    <button onClick={() => void signOut()}>Sign out</button>
    <button disabled={authorizationPending} onClick={() => void request('portalBucketReveal')}>Reveal</button>
  </div>,
}));

const portalContext = { kind: 'admin', workspace: 'staff', liveSin: true };
const request = vi.mocked(api);
const end = vi.mocked(logout);
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); request.mockReset(); });
async function open() {
  request.mockResolvedValue(portalContext);
  const app = render(<App />);
  fireEvent.click(screen.getByRole('button', { name: /MI staff access/ }));
  fireEvent.click(await screen.findByRole('button', { name: /Continue with Microsoft/ }));
  await screen.findByRole('heading', { name: 'Staff dashboard' });
  vi.useFakeTimers();
  // Restart the session under fake timers so the first poll is deterministic.
  app.unmount();
  const mounted = render(<App />);
  fireEvent.click(screen.getByRole('button', { name: /MI staff access/ }));
  await act(async () => {});
  fireEvent.click(screen.getByRole('button', { name: /Continue with Microsoft/ }));
  await act(async () => {});
  expect(screen.getByRole('heading', { name: 'Staff dashboard' })).toBeInTheDocument();
  return mounted;
}
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

test('network and App Check failures pause reveal and retry without signing out', async () => {
  await open();
  request.mockRejectedValueOnce({ code: 'functions/unavailable' })
    .mockRejectedValueOnce({ code: 'functions/unauthenticated', details: { stage: 'app-check' } });
  await tick(60_000);
  expect(screen.getByRole('button', { name: 'Reveal' })).toBeDisabled();
  expect(end).not.toHaveBeenCalled();
  await tick(4000);
  expect(screen.getByRole('button', { name: 'Reveal' })).toBeDisabled();
  await tick(8000);
  expect(screen.getByRole('button', { name: 'Reveal' })).toBeEnabled();
  expect(end).not.toHaveBeenCalled();
});

test.each([
  [{ code: 'functions/unauthenticated' }, 'Your session expired'],
  [{ code: 'functions/permission-denied' }, 'Your portal access was denied or revoked'],
  [{ code: 'functions/permission-denied', details: { stage: 'microsoft-assertion' } }, 'Your session expired'],
])('a terminal refresh error prompts sign-in and signs out once', async (error, reason) => {
  await open();
  request.mockRejectedValueOnce(error);
  await tick(60_000);
  expect(screen.getByRole('alert')).toHaveTextContent(reason);
  expect(screen.getByRole('button', { name: /Continue with Microsoft/ })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Staff dashboard' })).not.toBeInTheDocument();
  await tick(600_000);
  expect(end).toHaveBeenCalledTimes(1);
});

test('explicit sign-out ignores a late refresh and a new mount starts signed out', async () => {
  const app = await open();
  let resolve!: (value: unknown) => void;
  request.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  await tick(60_000);
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  await act(async () => { resolve(portalContext); });
  expect(screen.getByRole('heading', { name: 'Welcome to the secure portal.' })).toBeInTheDocument();
  expect(end).toHaveBeenCalledTimes(1);
  app.unmount();
  render(<App />);
  expect(screen.queryByRole('heading', { name: 'Staff dashboard' })).not.toBeInTheDocument();
  await tick(600_000);
  expect(end).toHaveBeenCalledTimes(1);
});

test('backend and SDK error classification exposes categories only', () => {
  expect(authorizationFailure({ code: 'appCheck/throttled' })).toBe('temporary');
  expect(authorizationFailure({ code: 'functions/resource-exhausted' })).toBe('temporary');
  expect(authorizationFailure({ code: 'functions/permission-denied', details: { stage: 'microsoft-member-binding' } })).toBe('denied');
});
