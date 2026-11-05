// Local HTTP transport for real Firebase onCall wrappers, not a second authorization implementation.
// Used when the Firebase Functions emulator's Unix socket is unavailable in a workspace.
import * as handlers from '../functions/index.mjs';
if (
  process.env.FUNCTIONS_EMULATOR !== 'true' ||
  process.env.GCLOUD_PROJECT !== 'demo-mi-sin-portal' ||
  process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099'
)
  throw new Error('Explicit local demo emulators required');
export function localRouter(req, res) {
  if (req.path === '/healthz') {
    res.status(200).json({ localSyntheticOnly: true });
    return;
  }
  const match =
    /^\/demo-mi-sin-portal\/northamerica-northeast1\/(portal[A-Za-z]+)$/.exec(
      req.path,
    );
  if (!match || typeof handlers[match[1]] !== 'function') {
    res.status(404).end();
    return;
  }
  return handlers[match[1]](req, res);
}
