// Server/operator-only approved roster fingerprints. These are identifiers, not encryption or secrets.
import { createHash } from 'node:crypto';
const approved = new Set([
  'c71dba4ce3148db1e84fa3f72b3caa64171c3aefaf1596f9b143824d2bb1ef6a',
  '8f8670bdc8caa516c55bc162f85dff1a5d9d6c82a9dc8ddd9b51fb6a612ef304',
  '3ea8aa6cdad55d14f1c5495af47df59c08c27ff362fac48b6e4e206f9e2be7af',
  '74153dfa41d0215777e8ecd8f427f4602bf0ff08ad76d507bad536292b22c0da',
]);
export const approvedAdminEmail = (email) =>
  typeof email === 'string' &&
  approved.has(
    createHash('sha256').update(email.trim().toLowerCase()).digest('hex'),
  );

export const initialOwnerKey = '74153dfa41d0215777e8ecd8f427f4602bf0ff08ad76d507bad536292b22c0da';
export const initialRoster = Object.freeze(
  [initialOwnerKey, ...[...approved].filter((key) => key !== initialOwnerKey)]
    .map((key, index) => Object.freeze({ key, label: ['Dev', 'Jeremy', 'Trista', 'Mercydes'][index] })),
);
export const isInitialOwnerEmail = (email) =>
  typeof email === 'string' &&
  createHash('sha256').update(email.trim().toLowerCase()).digest('hex') === initialOwnerKey;
