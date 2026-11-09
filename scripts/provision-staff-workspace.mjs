// Run only under the owner's approved, scoped deployment identity.
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { initialRoster } from '../functions/lib/admin-roster.mjs';
import { staffScope, staffGuid, validStaffPolicy } from '../cloud-functions/cloud/staff.mjs';
import { liveSinRelease } from '../cloud-functions/cloud/one-time-sin.mjs';
import { TARGET } from '../cloud-functions/cloud/gates.mjs';

class OperatorError extends Error {}

function stop(message) {
  throw new OperatorError(message);
}

async function main() {
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST)
    stop('Clear the emulator environment before running the staff operator.');
  const path = process.argv[2];
  if (!path || !/(?:^|\/)operator-input[\w.-]*\.json$/.test(path))
    stop('Provide the path to a private operator-input*.json file.');
  let input;
  try {
    input = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    stop('The private operator input could not be read as JSON.');
  }
  if (!input || Array.isArray(input) || typeof input !== 'object')
    stop('The private operator input must be a JSON object.');
  const action = process.argv[3];
  if (action && !['--execute', '--approve-invitations', '--pause', '--enable-sin', '--pause-sin'].includes(action)) stop('Unknown operator action.');
  const policy = {
    version: 2, projectId: TARGET.projectId, databaseId: TARGET.databaseId,
    tenantId: input.tenantId, microsoftClientId: input.microsoftClientId,
    enabled: true, invitationImportApproved: false, realCollectionEnabled: false,
    sensitiveRetrievalEnabled: false, disposalEnabled: false,
  };
  if (!validStaffPolicy(policy) || Object.keys(input).some((key) =>
    !['tenantId', 'microsoftClientId', 'privacyApprovalReference', 'sinReleaseApprovalReference', 'sinKmsKey'].includes(key))) stop('Check tenantId, microsoftClientId and the permitted operator input fields.');
  if (action === '--approve-invitations' && !staffGuid.test(input.privacyApprovalReference || ''))
    stop('Set privacyApprovalReference to the UUID of the recorded privacy decision before attempting approval.');
  const sinRelease = { enabled: true, approvalReference: input.sinReleaseApprovalReference, kmsKey: input.sinKmsKey };
  if (action === '--enable-sin' && !liveSinRelease(sinRelease))
    stop('Provide the recorded SIN release approval UUID and an approved Canadian Cloud KMS key resource.');
  if (!action) {
    console.log('Plan validated for four preapproved staff accounts. No remote calls or writes.');
    return;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const phrase = action === '--enable-sin' ? 'APPROVE LIVE SIN RELEASE' :
      action === '--pause-sin' ? 'PAUSE LIVE SIN RELEASE' :
      action === '--pause' ? 'PAUSE STAFF WORKSPACE' :
      action === '--approve-invitations' ? 'APPROVE PRIVATE INVITATION METADATA' : 'APPROVE STAFF WORKSPACE';
    const answer = await rl.question('Confirm the independently reviewed action. Type ' + phrase + ': ');
    if (answer !== phrase) stop('Confirmation did not match. No remote write was attempted.');
  } finally {
    rl.close();
  }
  let credential;
  try {
    credential = applicationDefault();
    await credential.getAccessToken();
  } catch {
    stop('Application Default Credentials could not obtain a token. Check the approved keyless operator session and, if applicable, impersonation access.');
  }
  const app = initializeApp({ projectId: TARGET.projectId, credential });
  const db = staffScope(getFirestore(app, TARGET.databaseId));
  const policyRef = db.doc('policy/access');
  const slots = initialRoster.map(({ key }) => db.doc('approvedAdministrators/' + key));
  await db.runTransaction(async (tx) => {
    const policyDoc = await tx.get(policyRef);
    const existing = policyDoc.data();
    const sameConfig = existing?.projectId === TARGET.projectId &&
      existing.databaseId === TARGET.databaseId && existing.tenantId === policy.tenantId &&
      existing.microsoftClientId === policy.microsoftClientId;
    if (action !== '--execute') {
      if (!sameConfig || !validStaffPolicy(existing))
        stop('Staff policy is missing, paused, unsafe, or belongs to a different tenant or application.');
      if (action === '--enable-sin' || action === '--pause-sin') {
        const ref = db.doc('policy/sin-release');
        const previous = (await tx.get(ref)).data();
        if (action === '--enable-sin') {
          if (existing.invitationImportApproved !== true || !staffGuid.test(existing.privacyApprovalReference || ''))
            stop('Record contractor metadata approval before enabling SIN submission.');
          if (previous && previous.kmsKey !== sinRelease.kmsKey)
            stop('The approved key resource cannot be changed here. Rotate versions on the existing Cloud KMS key.');
          if (previous?.enabled === true && previous.approvalReference === sinRelease.approvalReference) return;
          tx.set(ref, sinRelease);
        } else {
          if (previous?.enabled !== true) return;
          tx.update(ref, { enabled: false });
        }
        tx.create(db.collection('auditEvents').doc(), {
          event: action === '--enable-sin' ? 'sin_release_enabled' : 'sin_release_paused',
          actorUid: 'approved-deployment', at: Timestamp.now(),
          ...(action === '--enable-sin' ? { approvalReference: sinRelease.approvalReference } : {}),
        });
        return;
      }
      if (action === '--approve-invitations') {
        if (existing.invitationImportApproved === true) {
          if (existing.privacyApprovalReference !== input.privacyApprovalReference)
            stop('Invitation metadata already has a different approval. Use the reviewed approval-change process.');
          return;
        }
        tx.update(policyRef, { invitationImportApproved: true, privacyApprovalReference: input.privacyApprovalReference });
      } else {
        tx.update(policyRef, { enabled: false, invitationImportApproved: false });
      }
      tx.create(db.collection('auditEvents').doc(), {
        event: action === '--pause' ? 'staff_workspace_paused' : 'staff_invitation_metadata_approved',
        actorUid: 'approved-deployment', at: Timestamp.now(),
        ...(action === '--approve-invitations' ? { approvalReference: input.privacyApprovalReference } : {}),
      });
      return;
    }
    const slotDocs = await tx.getAll(...slots);
    const previousRoles = await tx.get(db.collection('roles').limit(initialRoster.length + 1));
    if (policyDoc.exists && (!sameConfig || existing.version !== 1 ||
        !validStaffPolicy({ ...existing, enabled: true }) ||
        previousRoles.size !== initialRoster.length)) throw new Error();
    if (slotDocs.some((doc) => doc.exists) || (!policyDoc.exists && previousRoles.size)) throw new Error();
    const roles = new Map();
    const objects = new Set();
    for (const doc of previousRoles.docs) {
      const row = doc.data();
      if (!initialRoster.some(({ key }) => key === row.emailKey) || roles.has(row.emailKey) ||
          !staffGuid.test(row.objectId || '') || objects.has(row.objectId) ||
          !/^[A-Za-z0-9_-]{1,128}$/.test(doc.id) || row.tenantId !== policy.tenantId ||
          typeof row.active !== 'boolean') throw new Error();
      roles.set(row.emailKey, { uid: doc.id, objectId: row.objectId, active: row.active });
      objects.add(row.objectId);
    }
    const bindings = [...objects].map((oid) => db.doc('objectBindings/' + oid));
    if (bindings.length && (await tx.getAll(...bindings)).some((doc) => doc.exists)) throw new Error();
    if (policyDoc.exists) tx.update(policyRef, { version: 2 });
    else tx.create(policyRef, policy);
    initialRoster.forEach(({ key }, index) => {
      const prior = roles.get(key);
      tx.create(slots[index], { key, active: true, ...prior });
      if (prior) tx.create(db.doc('objectBindings/' + prior.objectId), { uid: prior.uid, key });
    });
    tx.create(db.collection('auditEvents').doc(), {
      event: policyDoc.exists ? 'staff_roster_migrated' : 'staff_workspace_provisioned', actorUid: 'approved-deployment', at: Timestamp.now(),
    });
  });
  console.log('Reviewed staff workspace action completed. Sensitive operations remain closed.');
}
main().catch((error) => {
  const code = error?.code;
  const message = error instanceof OperatorError ? error.message :
    [7, 'PERMISSION_DENIED', 'permission-denied'].includes(code)
      ? 'Named Firestore database permission denied. Verify the approved operator identity and IAM condition.'
      : [16, 'UNAUTHENTICATED', 'unauthenticated'].includes(code)
        ? 'Firestore rejected the operator credentials. Renew the approved keyless session.'
        : [4, 14, 'DEADLINE_EXCEEDED', 'UNAVAILABLE'].includes(code)
          ? 'Firestore is temporarily unavailable. Verify connectivity, then retry with the same approval reference.'
          : 'Staff operation stopped. Verify the named database and check for conflicting policy or roster records.';
  console.error(message);
  process.exitCode = 1;
});
