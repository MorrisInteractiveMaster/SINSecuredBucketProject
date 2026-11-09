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
  const code = (error as { code?: string })?.code || '';
  if (code.includes('already-exists'))
    return 'This invitation already has a submission. No duplicate was created.';
  if (code.includes('resource-exhausted'))
    return 'The request limit was reached. Please wait and retry.';
  if (code.includes('unauthenticated'))
    return 'Your session expired. Sign in again.';
  if (code.includes('permission-denied'))
    return 'This action is not permitted for your current identity and role.';
  if (code.includes('failed-precondition'))
    return 'Synthetic testing is not active or its setup is incomplete. Ask the portal operator to review the test policy.';
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
