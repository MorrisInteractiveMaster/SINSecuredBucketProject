import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { defaultBucketField } from '../functions/lib/bucket-field.mjs';
import { requestKinds, validRequestTemplate } from '../functions/lib/request-types.mjs';
import { staffScope } from '../cloud-functions/cloud/staff.mjs';
import { REQUEST_BUCKET } from '../cloud-functions/cloud/request-files.mjs';
import { liveSinRelease } from '../cloud-functions/cloud/one-time-sin.mjs';
import { cryptoKeyPattern } from '../functions/lib/kms.mjs';
import { TARGET } from '../cloud-functions/cloud/gates.mjs';
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
function stableId(value) {
  const hex = createHash('sha256').update('mi-requests-migration-v1:' + value).digest('hex');
  return [hex.slice(0, 8), hex.slice(8, 12), '4' + hex.slice(13, 16), 'a' + hex.slice(17, 20), hex.slice(20, 32)].join('-');
}
export async function migratePendingRequests(db, apply, clock = Date.now) {
  const marker = db.doc('policy/requests-migration-v1');
  const field = await db.runTransaction(async (tx) => {
    const [saved, current] = await tx.getAll(marker, db.doc('policy/bucket-field'));
    if (saved.exists) return saved.data().field;
    const field = current.data() ?? defaultBucketField;
    if (!validRequestTemplate({ label: field.label, type: field.type, instructions: '',
      maxLength: requestKinds[field.type]?.max, status: 'active' })) throw new Error('Invalid legacy field');
    if (apply) tx.create(marker, { field });
    return field;
  });
  const template = { label: field.label, type: field.type, instructions: '', maxLength: requestKinds[field.type]?.max, status: 'active', revision: field.revision };
  if (!validRequestTemplate(template)) throw new Error('Legacy field cannot migrate');
  const templateId = stableId(JSON.stringify(template));
  const templateRef = db.doc('requestsV2/v1/templates/' + templateId);
  const entries = await db.collection('allowlist').limit(101).get();
  if (entries.size > 100) throw new Error('Migration exceeds reviewed limit');
  const counts = { scanned: entries.size, pending: 0, skipped: 0, created: 0 };
  for (const snapshot of entries.docs) {
    const result = await db.runTransaction(async (tx) => {
      const entry = (await tx.get(snapshot.ref)).data();
      if (entry?.status !== 'active' || !uuid.test(entry.invitationId || '') || !entry.expiresAt || entry.expiresAt.toMillis() <= clock()) return false;
      const slotId = createHash('sha256').update(entry.invitationId + ':' + templateId).digest('hex');
      const slot = db.doc('requestsV2/v1/slots/' + slotId);
      const [legacy, existing, savedTemplate, currentField, migration] = await tx.getAll(db.doc('submissions/' + entry.invitationId), slot, templateRef, db.doc('policy/bucket-field'), marker);
      if (legacy.exists || existing.exists) return false;
      if (Object.keys(field).some((key) => (migration.data()?.field ?? currentField.data() ?? defaultBucketField)[key] !== field[key])) throw new Error('Legacy field changed during migration');
      if (savedTemplate.exists && JSON.stringify(savedTemplate.data()) !== JSON.stringify(template)) {
        // Firestore map order is not guaranteed. Compare each reviewed property.
        if (Object.keys(template).some((key) => savedTemplate.data()[key] !== template[key])) throw new Error('Migration template changed');
      }
      if (apply) {
        const assignmentId = stableId(entry.invitationId + ':' + templateId);
        if (!savedTemplate.exists) tx.create(templateRef, template);
        tx.create(slot, { assignmentId });
        tx.create(db.doc('requestsV2/v1/assignments/' + assignmentId), {
          invitationId: entry.invitationId, emailKey: snapshot.id, templateId, template,
          status: 'pending', createdAt: Timestamp.fromMillis(clock()),
        });
        tx.create(db.collection('auditEvents').doc(), { actorUid: 'approved-deployment', event: 'legacy_pending_request_migrated',
          assignmentId, invitationId: entry.invitationId, at: Timestamp.fromMillis(clock()) });
      }
      return true;
    });
    if (result) { counts.pending++; if (apply) counts.created++; }
    else counts.skipped++;
  }
  return counts;
}
async function main() {
  const [action, file, apply] = process.argv.slice(2);
  if (!['migrate', 'enable', 'pause'].includes(action) || !file || !/(?:^|\/)operator-input[\w.-]*\.json$/.test(file) ||
      (apply !== undefined && apply !== '--apply') || process.env.FIRESTORE_EMULATOR_HOST) throw new Error();
  const input = JSON.parse(readFileSync(file, 'utf8'));
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some((key) =>
    !['approvalReference', 'filesEnabled', 'fileApprovalReference', 'filesKmsKey', 'scannerUrl'].includes(key))) throw new Error();
  if (action === 'enable' && !uuid.test(input.approvalReference || '')) throw new Error('A recorded request release decision is required');
  if (input.filesEnabled === true && (!uuid.test(input.fileApprovalReference || '') || !cryptoKeyPattern.test(input.filesKmsKey || '') ||
      !/^https:\/\/[a-z0-9-]+\.a\.run\.app$/.test(input.scannerUrl || ''))) throw new Error('A separate reviewed file release is required');
  if (apply) {
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    try { if (await prompt.question('Type APPLY REQUESTS ' + action.toUpperCase() + ': ') !== 'APPLY REQUESTS ' + action.toUpperCase()) throw new Error(); }
    finally { prompt.close(); }
  }
  const app = initializeApp({ projectId: TARGET.projectId, credential: applicationDefault() });
  const db = staffScope(getFirestore(app, TARGET.databaseId));
  if (action === 'migrate') { console.log(JSON.stringify(await migratePendingRequests(db, Boolean(apply)))); return; }
  await db.runTransaction(async (tx) => {
    const flag = db.doc('policy/requests-v2');
    const [live, staff, prior] = await tx.getAll(db.doc('policy/sin-release'), db.doc('policy/access'), flag);
    if (action === 'enable' && (!liveSinRelease(live.data()) || staff.data()?.enabled !== true || staff.data()?.invitationImportApproved !== true)) throw new Error();
    if (!apply) return;
    if (action === 'pause') {
      if (!prior.exists) return;
      tx.update(flag, { enabled: false });
    } else tx.set(flag, { enabled: true, cutover: true, approvalReference: input.approvalReference, filesEnabled: input.filesEnabled === true,
      ...(input.filesEnabled ? { fileApprovalReference: input.fileApprovalReference, storageBucket: REQUEST_BUCKET,
        filesKmsKey: input.filesKmsKey, scannerUrl: input.scannerUrl } : {}),
    });
    tx.create(db.collection('auditEvents').doc(), { actorUid: 'approved-deployment', event: 'requests_release_' + action, at: Timestamp.now() });
  });
  console.log(apply ? 'Request rollout action completed.' : 'Request rollout preview passed. No writes.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => {
  console.error('Request operation stopped. Check the private input, recorded approvals, scoped ADC and named database.');
  process.exitCode = 1;
});
