import { initializeApp } from 'firebase/app';
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
const local = import.meta.env.VITE_PORTAL_MODE !== 'cloud';
if (!local)
  throw new Error(
    'Cloud access is disabled pending security and deployment approval',
  );
const projectId = local
  ? 'demo-mi-sin-portal'
  : import.meta.env.VITE_FIREBASE_PROJECT_ID;
if (!local && projectId !== 'gen-lang-client-0948635471')
  throw new Error('Unexpected Firebase project');
export const isLocal = local;
const app = initializeApp(
  {
    projectId,
    apiKey: local ? 'emulator-only' : import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: local
      ? 'demo-mi-sin-portal.firebaseapp.com'
      : import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    appId: local ? 'emulator-only' : import.meta.env.VITE_FIREBASE_APP_ID,
  },
  'mi-sin-portal',
);
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
  const response = await httpsCallable(
    functions,
    name,
  )({ ...data, ...(microsoftIdToken ? { microsoftIdToken } : {}) });
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
