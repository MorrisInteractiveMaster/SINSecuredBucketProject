// Immutable review targets. Cloud access stays disabled in Phase 1.
export const PORTAL_PROJECT_ID = 'gen-lang-client-0948635471';
export const PORTAL_DATABASE_ID = 'mi-sin-portal';
export const EMULATOR_PROJECT_ID = 'demo-mi-sin-portal';

export function requireEmulatorTarget({ projectId, databaseId, emulatorHost, emulatorPort }) {
  if (projectId !== EMULATOR_PROJECT_ID) throw new Error('Cloud access disabled: use the demo project');
  if (databaseId !== PORTAL_DATABASE_ID) throw new Error('Explicit portal database required');
  if (emulatorHost !== '127.0.0.1' || emulatorPort !== 8080) throw new Error('Local emulator target required');
  return Object.freeze({ projectId, databaseId, emulatorHost, emulatorPort });
}

export function reviewedDeploymentPlan(config, projectId) {
  if (projectId !== PORTAL_PROJECT_ID) throw new Error('Unexpected project');
  if (!Array.isArray(config.firestore) || config.firestore.length !== 1) throw new Error('One named database required');
  const db = config.firestore[0];
  if (db.database !== PORTAL_DATABASE_ID || db.rules !== 'firestore.mi-sin-portal.rules' || db.indexes !== 'firestore.mi-sin-portal.indexes.json') throw new Error('Unexpected database artifacts');
  if (Object.keys(config).some(key => !['firestore', 'hosting'].includes(key))) throw new Error('Unreviewed shared service');
  if ('site' in (config.hosting || {})) throw new Error('Physical Hosting site must be independently bound, not hardcoded');
  if (config.hosting?.target !== 'mi-sin-portal' || config.hosting.public !== 'dist') throw new Error('Portal Hosting target required');
  // Return text for review ONLY; never execute cloud commands from this helper.
  return Object.freeze({ projectId, databaseId: db.database, firestoreSelector: `firestore:${PORTAL_DATABASE_ID}`, hostingSelector: 'hosting:mi-sin-portal' });
}
