// Run only under the owner's approved, scoped deployment identity.
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { initialRoster } from '../functions/lib/admin-roster.mjs';
import { emailKey } from '../functions/lib/security.mjs';
import { staffScope, staffPermissions, validStaffPolicy } from '../cloud-functions/cloud/staff.mjs';
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
    version: 1, projectId: TARGET.projectId, databaseId: TARGET.databaseId,
    tenantId: input.tenantId, microsoftClientId: input.microsoftClientId,
    enabled: true, invitationImportApproved: false, realCollectionEnabled: false,
    sensitiveRetrievalEnabled: false, disposalEnabled: false,
  };
  if (!validStaffPolicy(policy) || !Array.isArray(input.members) || input.members.length !== initialRoster.length)
    throw new Error();
  const guid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
  const known = new Set(initialRoster.map(({ key }) => key));
  const uids = new Set();
  const objects = new Set();
  for (const entry of input.members) {
    if (!known.delete(entry.key) || !/^[A-Za-z0-9_-]{1,128}$/.test(entry.uid || '') ||
        !guid.test(entry.objectId || '') || uids.has(entry.uid) || objects.has(entry.objectId)) throw new Error();
    uids.add(entry.uid);
    objects.add(entry.objectId);
  }
  if (!action) {
    console.log('Plan validated for four pinned staff identities. No remote calls or writes.');
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
  const auth = getAuth(app);
  const db = staffScope(getFirestore(app, TARGET.databaseId));
  for (const entry of action === '--execute' ? input.members : []) {
    const user = await auth.getUser(entry.uid);
    const provider = user.providerData.find(({ providerId }) => providerId === 'microsoft.com');
    if (user.disabled || emailKey(user.email) !== entry.key || provider?.uid !== entry.objectId) throw new Error();
  }
  const policyRef = db.doc('policy/access');
  const refs = input.members.map(({ uid }) => db.doc('roles/' + uid));
  await db.runTransaction(async (tx) => {
    const prior = await tx.getAll(policyRef, ...refs);
    if (action !== '--execute') {
      const [policyDoc, ...roles] = prior;
      const existing = policyDoc.data();
      if (!existing || existing.projectId !== TARGET.projectId || existing.databaseId !== TARGET.databaseId ||
          existing.tenantId !== policy.tenantId || existing.microsoftClientId !== policy.microsoftClientId ||
          roles.some((doc, i) => doc.data()?.emailKey !== input.members[i].key ||
            doc.data()?.objectId !== input.members[i].objectId)) throw new Error();
      if (action === '--approve-invitations') {
        if (!validStaffPolicy(existing) || !guid.test(input.privacyApprovalReference || '')) throw new Error();
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
    if (prior.some((doc) => doc.exists)) throw new Error();
    tx.create(policyRef, policy);
    refs.forEach((ref, index) => {
      const member = input.members[index];
      tx.create(ref, {
        emailKey: member.key, objectId: member.objectId, tenantId: policy.tenantId,
        displayLabel: initialRoster.find(({ key }) => key === member.key).label, active: true,
        ...Object.fromEntries(staffPermissions.map((permission) => [permission, true])),
      });
    });
    tx.create(db.collection('auditEvents').doc(), {
      event: 'staff_workspace_provisioned', actorUid: 'approved-deployment', at: Timestamp.now(),
    });
  });
  console.log('Reviewed staff workspace action completed. Sensitive operations remain closed.');
}
main().catch(() => {
  console.error('Staff provisioning stopped. Verify the private roster, tenant, scoped ADC/Auth access and absence of conflicting records.');
  process.exitCode = 1;
});
