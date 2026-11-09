import type { Api } from '../ui/types';
export const isLocal = import.meta.env.VITE_PORTAL_MODE !== 'cloud-test';
let promise: Promise<typeof import('./firebase')> | undefined;
export const warmClient = () => (promise ??= import('./firebase'));
export const api: Api = async (name, data = {}) =>
  (await warmClient()).api(name, data);
export async function logout() {
  if (promise) await (await promise).logout();
}
export async function login(
  provider: 'google.com' | 'microsoft.com',
  staff = false,
) {
  return (await warmClient()).signIn(provider, staff);
}
export async function devLogin(role: 'admin' | 'contractor') {
  if (!import.meta.env.DEV || !isLocal)
    throw new Error('Local emulator fixtures only');
  const { signInWithCredential, OAuthProvider } = await import('firebase/auth');
  const client = await warmClient();
  const account =
    role === 'admin'
      ? {
          sub: 'emulator-mi-member',
          oid: 'emulator-mi-member',
          email: 'admin@example.com',
        }
      : {
          sub: 'emulator-contractor-ms',
          oid: 'emulator-contractor-ms',
          email: 'contractor@example.com',
        };
  const encoded = (v: object) =>
    btoa(JSON.stringify(v))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/, '');
  const jwt = [
    encoded({ alg: 'none', typ: 'JWT' }),
    encoded({
      ...account,
      email_verified: false,
      iss: 'https://login.microsoftonline.com/common/v2.0',
      aud: 'emulator-only',
    }),
    '',
  ].join('.');
  return signInWithCredential(
    client.auth,
    new OAuthProvider('microsoft.com').credential({ idToken: jwt }),
  );
}
export function message(error: unknown) {
  const details = (error as { details?: { stage?: string; reference?: string } })?.details;
  const reference = details?.reference;
  const suffix = typeof reference === 'string' && /^[0-9a-f-]{36}$/i.test(reference)
    ? ' Reference: ' + reference : '';
  return describeError(error, details?.stage) + suffix;
}
function describeError(error: unknown, stage?: string) {
  const code = (error as { code?: string })?.code || '';
  if (stage === 'request-format') return 'The portal rejected the request format. Reload the official site and try again.';
  if (stage === 'app-check' && (code === 'functions/permission-denied' || code === 'functions/unauthenticated'))
    return 'Application verification failed. Reload the official portal and try again.';
  if (stage === 'microsoft-member-binding')
    return 'Microsoft organization membership or the linked account could not be verified. Contact the portal operator.';
  if (stage === 'microsoft-assertion' && code === 'functions/permission-denied')
    return 'The Microsoft sign-in proof was rejected. Sign in again with your organizational account.';
  if (stage === 'invitation-duplicate' && code === 'functions/already-exists')
    return 'An imported row already has an invitation. No rows were added. Edit the existing contractor instead.';
  if (stage === 'invitation-csv' && code === 'functions/invalid-argument')
    return 'Check the CSV preview for invalid columns, email addresses, statuses, or duplicate rows.';
  if (stage === 'sin-mailbox') return 'Use your approved, verified Gmail, Outlook or Hotmail mailbox.';
  if (stage === 'sin-unavailable') return 'This SIN is unavailable or has already been removed.';
  if (stage === 'sin-delivery') return 'The one-time reveal was consumed, but delivery failed.';
  if (stage === 'staff-policy') return 'Staff access is paused. Contact the portal operator.';
  if (stage === 'synthetic-policy') return 'Synthetic testing is closed or has expired.';
  if (code.includes('already-exists'))
    return 'This invitation already has a submission. No duplicate was created.';
  if (code.includes('resource-exhausted'))
    return 'The request limit was reached. Please wait and retry.';
  if (code.includes('unauthenticated'))
    return 'Your session expired. Sign in again.';
  if (code.includes('permission-denied'))
    return 'This action is not permitted for your current identity and role.';
  if (code.includes('failed-precondition'))
    return 'This portal workspace or operation is paused. Ask the portal operator to check its approval and setup.';
  if (
    code === 'functions/unavailable' &&
    (error as { message?: string })?.message ===
      'Portal identity verification is unavailable. The operator should check the runtime Auth reader.'
  )
    return 'Portal identity verification is unavailable. Ask the portal operator to verify the dedicated runtime Auth reader.';
  if (code.includes('unavailable') || code.includes('deadline-exceeded'))
    return 'The portal backend could not be reached. Please try again shortly.';
  if (code.includes('unauthorized-domain'))
    return 'This website is not an authorized Firebase sign-in domain. Contact the portal operator.';
  if (code.includes('operation-not-allowed'))
    return 'This sign-in method is not currently available. Contact the portal operator.';
  if (code.includes('invalid-credential') || code.includes('invalid-oauth-client-id'))
    return 'Microsoft sign-in configuration could not be verified. Contact the portal operator.';
  if (code.includes('invalid-argument'))
    return 'Check the selected fields and the approved synthetic-test data.';
  if (
    code.includes('account-exists-with-different-credential') ||
    code.includes('credential-already-in-use')
  )
    return 'Use your original sign-in provider or contact MI. The portal did not link accounts.';
  if (code.includes('popup'))
    return 'Sign-in did not finish. Allow the popup and try again.';
  return 'The request could not be completed. Check your connection and try again.';
}
