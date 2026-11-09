import { deny } from '../../functions/lib/security.mjs';

export async function getPortalIdentity(auth, idToken) {
  try {
    const token = await auth.verifyIdToken(idToken, true);
    const user = await auth.getUser(token.uid);
    return { token, user };
  } catch (error) {
    if (['auth/internal-error', 'auth/insufficient-permission', 'app/invalid-credential'].includes(error?.code)) {
      // Log a fixed category only. The Admin SDK error can contain the upstream response.
      console.error('Portal Auth identity lookup unavailable', error.code);
      deny('unavailable', 'Portal identity verification is unavailable. The operator should check the runtime Auth reader.');
    }
    deny('unauthenticated', 'Your portal session could not be verified. Sign in again.');
  }
}
