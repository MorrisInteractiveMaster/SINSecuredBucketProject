import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { clientConfiguration } from './release-config.mjs';
import {
  initializeAuth,
  inMemoryPersistence,
  browserPopupRedirectResolver,
  connectAuthEmulator,
  signInWithPopup,
  GoogleAuthProvider,
  OAuthProvider,
  signOut,
} from 'firebase/auth';
import {
  initializeFirestore,
  memoryLocalCache,
  connectFirestoreEmulator,
} from 'firebase/firestore';
import {
  getFunctions,
  connectFunctionsEmulator,
  httpsCallable,
} from 'firebase/functions';
const config = clientConfiguration(import.meta.env);
const local = config.mode === 'emulator';
export const isLocal = local;
const app = initializeApp(config.firebase, 'mi-sin-portal');
if (!local)
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(config.appCheckSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
export const auth = initializeAuth(app, {
  persistence: inMemoryPersistence,
  popupRedirectResolver: browserPopupRedirectResolver,
});
export const db = initializeFirestore(
  app,
  { localCache: memoryLocalCache() },
  'mi-sin-portal',
);
const functions = getFunctions(app, 'northamerica-northeast1');
if (local) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', {
    disableWarnings: false,
  });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}
let microsoftIdToken: string | undefined;
export async function signIn(
  provider: 'microsoft.com' | 'google.com',
  staff = false,
) {
  microsoftIdToken = undefined;
  const p =
    provider === 'google.com'
      ? new GoogleAuthProvider()
      : new OAuthProvider('microsoft.com');
  p.setCustomParameters(
    provider === 'google.com'
      ? { prompt: 'select_account' }
      : {
          prompt: 'select_account',
          tenant: staff
            ? import.meta.env.VITE_MI_TENANT_ID || 'common'
            : 'common',
        },
  );
  // No Graph mail/calendar or additional Google API scopes requested.
  try {
    const result = await signInWithPopup(auth, p);
    if (provider === 'microsoft.com')
      microsoftIdToken = OAuthProvider.credentialFromResult(result)?.idToken;
    return result.user;
  } catch (error) {
    await signOut(auth);
    microsoftIdToken = undefined;
    throw error;
  }
}
export async function logout() {
  microsoftIdToken = undefined;
  await signOut(auth);
}
export async function api<T = any>(
  name: string,
  data: Record<string, unknown> = {},
): Promise<T> {
  if (!auth.currentUser) throw { code: 'functions/unauthenticated' };
  const input = { ...data, ...(microsoftIdToken ? { microsoftIdToken } : {}) };
  const response = local
    ? await httpsCallable(functions, name)(input)
    : await httpsCallable(
        functions,
        'miSinSynthetic',
      )({
        operation: name,
        payload: data,
        ...(microsoftIdToken ? { microsoftIdToken } : {}),
      });
  return response.data as T;
}
export function safeError(error: unknown) {
  const code = (error as { code?: string })?.code || '';
  if (
    code.includes('account-exists-with-different-credential') ||
    code.includes('credential-already-in-use')
  )
    return 'This account has a provider conflict. Use your original sign-in provider or contact MI. No accounts were linked by the portal.';
  if (code.includes('popup-closed') || code.includes('cancelled-popup'))
    return 'Sign-in was cancelled. You can try again.';
  if (code.includes('popup-blocked'))
    return 'Allow the sign-in popup, then try again.';
  if (code.includes('already-exists'))
    return 'This invitation has already been submitted.';
  if (code.includes('resource-exhausted'))
    return 'Please wait before requesting another verification code.';
  if (code.includes('invalid-argument'))
    return 'Check the information and the documented synthetic fixture values.';
  if (code.includes('failed-precondition'))
    return 'This step is not available. Verify your email or check the local setup instructions.';
  if (code.includes('unauthenticated')) return 'Please sign in again.';
  return 'Access could not be confirmed. Use an approved account or contact Morris Interactive.';
}
