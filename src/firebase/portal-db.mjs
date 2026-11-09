// Phase 1 isolation proof, not a live collector. No production initialization path.
import { initializeApp } from 'firebase/app';
import { initializeFirestore, memoryLocalCache, connectFirestoreEmulator } from 'firebase/firestore';
import { requireEmulatorTarget, PORTAL_DATABASE_ID } from '../../config/portal-target.mjs';

export function openPortalDatabase(config, sdk = { initializeApp, initializeFirestore, memoryLocalCache, connectFirestoreEmulator }) {
  const target = requireEmulatorTarget(config);
  const app = sdk.initializeApp({ projectId: target.projectId, apiKey: 'emulator-only-not-a-credential', appId: 'emulator-only' }, config.appName || 'mi-sin-portal-proof');
  const db = sdk.initializeFirestore(app, { localCache: sdk.memoryLocalCache() }, PORTAL_DATABASE_ID);
  sdk.connectFirestoreEmulator(db, target.emulatorHost, target.emulatorPort, config.mockUserToken ? { mockUserToken: config.mockUserToken } : undefined);
  return { app, db };
}
