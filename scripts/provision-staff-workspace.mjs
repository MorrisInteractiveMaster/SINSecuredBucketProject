// Run only under the owner's approved, scoped deployment identity.
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { initialRoster } from '../functions/lib/admin-roster.mjs';
import { staffScope, staffGuid, validStaffPolicy } from '../cloud-functions/cloud/staff.mjs';
import { TARGET } from '../cloud-functions/cloud/gates.mjs';

async function main() {
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST)
    throw new Error();
  const path = process.argv[2];
  if (!path || !/(?:^|\/)operator-input[\w.-]*\.json$/.test(path)) throw new Error();
  const input = JSON.parse(readFileSync(path, 'utf8'));
  const action = process.argv[3];
  if (action && !['--execute', '--approve-invitations', '--pause'].includes(action)) throw new Error();
  const policy = {
    version: 2, projectId: TARGET.projectId, databaseId: TARGET.databaseId,
    tenantId: input.tenantId, microsoftClientId: input.microsoftClientId,
    enabled: true, invitationImportApproved: false, realCollectionEnabled: false,
    sensitiveRetrievalEnabled: false, disposalEnabled: false,
  };
  if (!validStaffPolicy(policy) || Object.keys(input).some((key) =>
    !['tenantId', 'microsoftClientId', 'privacyApprovalReference'].includes(key))) throw new Error();
  if (!action) {
    console.log('Plan validated for four preapproved staff accounts. No remote calls or writes.');
    return;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const phrase = action === '--pause' ? 'PAUSE STAFF WORKSPACE' :
      action === '--approve-invitations' ? 'APPROVE PRIVATE INVITATION METADATA' : 'APPROVE STAFF WORKSPACE';
    const answer = await rl.question('Confirm the independently reviewed action. Type ' + phrase + ': ');
    if (answer !== phrase) throw new Error();
  } finally {
    rl.close();
  }
  const app = initializeApp({ projectId: TARGET.projectId, credential: applicationDefault() });
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
      if (!sameConfig || !validStaffPolicy(existing)) throw new Error();
      if (action === '--approve-invitations') {
        if (!staffGuid.test(input.privacyApprovalReference || '')) throw new Error();
        tx.update(policyRef, { invitationImportApproved: true, privacyApprovalReference: input.privacyApprovalReference });
      } else {
        tx.update(policyRef, { enabled: false, invitationImportApproved: false });
      }
      tx.create(db.collection('auditEvents').doc(), {
        event: action === '--pause' ? 'staff_workspace_paused' : 'staff_invitation_metadata_approved',
        actorUid: 'approved-deployment', at: Timestamp.now(),
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
main().catch(() => {
  console.error('Staff provisioning stopped. Verify the tenant, application ID, scoped Firestore ADC access and absence of conflicting records.');
  process.exitCode = 1;
});
