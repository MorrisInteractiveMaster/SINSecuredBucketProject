export function authorizationFailure(error: unknown): 'temporary' | 'expired' | 'denied' {
  const failure = error as { code?: string; details?: { stage?: string } } | null;
  const code = failure?.code?.split('/').at(-1);
  const stage = failure?.details?.stage;
  if (stage === 'app-check' || stage === 'firebase-auth-reader' || stage === 'backend-access' ||
      failure?.code?.startsWith('appCheck/') ||
      ['unavailable', 'deadline-exceeded', 'internal', 'unknown', 'network-request-failed',
        'resource-exhausted', 'cancelled'].includes(code ?? '')) return 'temporary';
  if (code === 'unauthenticated' || code === 'user-token-expired' ||
      (stage === 'microsoft-assertion' && code === 'permission-denied')) return 'expired';
  if (code === 'permission-denied' || code === 'failed-precondition' ||
      code === 'user-disabled' || code === 'user-not-found' || code === 'invalid-user-token') return 'denied';
  return 'temporary';
}

export function authorizationRetryDelay(failures: number) {
  return Math.min(60_000, 4000 * 2 ** Math.min(failures - 1, 4));
}
