import { deny, PortalError } from '../../functions/lib/security.mjs';

export async function getPortalIdentity(auth, idToken) {
  try {
    const token = await auth.verifyIdToken(idToken, true);
    const user = await auth.getUser(token.uid);
    if (user.disabled) deny('permission-denied', 'Your portal account is disabled.', 'firebase-revoked');
    return { token, user };
  } catch (error) {
    if (error instanceof PortalError) throw error;
    if (['auth/id-token-revoked', 'auth/user-disabled', 'auth/user-not-found'].includes(error?.code))
      deny('permission-denied', 'Your portal account or session access was revoked.', 'firebase-revoked');
    if (['auth/internal-error', 'auth/insufficient-permission', 'app/invalid-credential'].includes(error?.code)) {
      // Log a fixed category only. The Admin SDK error can contain the upstream response.
      console.error('Portal Auth identity lookup unavailable', error.code);
      deny('unavailable', 'Portal identity verification is unavailable. The operator should check the runtime Auth reader.', 'firebase-auth-reader');
    }
    deny('unauthenticated', 'Your portal session could not be verified. Sign in again.', 'firebase-session');
  }
}
