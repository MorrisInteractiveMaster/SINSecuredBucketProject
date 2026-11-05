import { deny } from '../../functions/lib/security.mjs';
export const TARGET = Object.freeze({
  projectId: 'gen-lang-client-0948635471',
  databaseId: 'mi-sin-portal',
  appId: '1:1025148630135:web:75e07aa9dd751cc25e0272',
  siteId: 'mi-sin-portal',
  region: 'northamerica-northeast1',
  mode: 'synthetic-cloud-test-v1',
});
export const FIXTURES = Object.freeze({
  'fixture-a': '000000018',
  'fixture-b': '000000026',
});
export function assertRelease(
  policy,
  projectId,
  now = Date.now(),
  emulator = false,
) {
  const expires = policy?.expiresAt?.toMillis?.() ?? 0;
  if (
    (projectId !== TARGET.projectId &&
      !(emulator && projectId === 'demo-mi-sin-portal')) ||
    policy?.projectId !== TARGET.projectId ||
    policy?.databaseId !== TARGET.databaseId ||
    policy?.mode !== TARGET.mode ||
    policy?.enabled !== true ||
    policy?.financialReviewApproved !== true ||
    policy?.isolationReviewApproved !== true ||
    policy?.realCollectionEnabled !== false ||
    policy?.sensitiveRetrievalEnabled !== false ||
    policy?.disposalEnabled !== false ||
    expires <= now ||
    expires > now + 24 * 3600000 ||
    !policy?.adminUid ||
    !/^[a-f0-9-]{36}$/i.test(policy?.tenantId || '') ||
    !/^[a-f0-9-]{36}$/i.test(policy?.microsoftClientId || '')
  )
    deny(
      'failed-precondition',
      'Synthetic cloud testing is closed or expired.',
    );
  return policy;
}
export function assertTestIdentity(record, who) {
  if (
    record?.active !== true ||
    record?.ownershipVerified !== true ||
    record?.purpose !== 'dedicated-synthetic-test' ||
    record.email !== who.email ||
    !Array.isArray(record.providerIds) ||
    !record.providerIds.includes(who.providerId) ||
    record.providerUids?.[who.providerId] !== who.providerUid
  )
    deny();
}
export function exactKeys(data, keys) {
  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    Object.keys(data).some((k) => !keys.includes(k))
  )
    deny('invalid-argument', 'Only synthetic test fields are accepted.');
}
export function submissionFixture(data) {
  exactKeys(data, ['fixtureId', 'invitationId', 'revision']);
  if (
    !Object.hasOwn(FIXTURES, data.fixtureId) ||
    typeof data.invitationId !== 'string' ||
    !/^[a-f0-9-]{36}$/i.test(data.invitationId) ||
    !Number.isSafeInteger(data.revision) ||
    data.revision < 1
  )
    deny('invalid-argument', 'Choose a documented synthetic fixture.');
  return FIXTURES[data.fixtureId];
}
