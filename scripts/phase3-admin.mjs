// Privileged owner-run provisioning. No user/key/billing/IAM mutation; no identity bindings in bundles.
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createInterface } from 'node:readline/promises';
import { approvedAdminEmail } from '../functions/lib/admin-roster.mjs';
const action = process.argv[2];
if (!['grant', 'revoke'].includes(action))
  throw new Error('Use grant or revoke');
if (
  process.env.FIRESTORE_EMULATOR_HOST ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST
)
  throw new Error('Use the dedicated emulator seed for local fixtures.');
const rl = createInterface({ input: process.stdin, output: process.stdout }),
  ask = async (text) => (await rl.question(text)).trim();
const app = initializeApp({
    projectId: 'gen-lang-client-0948635471',
    credential: applicationDefault(),
  }),
  auth = getAuth(app),
  db = getFirestore(app, 'mi-sin-portal');
try {
  if (
    (await ask('Type mi-sin-portal to confirm the named target: ')) !==
    'mi-sin-portal'
  )
    throw Error('Target not confirmed.');
  const uid = await ask('Exact verified Firebase UID: '),
    email = (
      await ask('Exact approved MI administrator email: ')
    ).toLowerCase();
  if (!approvedAdminEmail(email))
    throw Error('This email is not one of the four approved MI identities.');
  const user = action === 'grant' ? await auth.getUser(uid) : null,
    provider = user?.providerData.find((p) => p.providerId === 'microsoft.com');
  if (
    action === 'grant' &&
    (user.disabled || user.email?.toLowerCase() !== email || !provider)
  )
    throw Error('UID/email/Microsoft identity does not match.');
  const objectId = await ask('Verified MI Entra MEMBER object GUID: ');
  if (
    (action === 'grant' && provider.uid !== objectId) ||
    !/^[a-f0-9-]{36}$/i.test(objectId)
  )
    throw Error('Provider UID and member object ID do not match.');
  const tenantId = await ask('Verified MI Entra tenant GUID: '),
    label = await ask('Administrator display label (max 100 characters): ');
  if (label.length > 100) throw Error('Label too long.');
  if (
    (await ask(
      `Confirm independent email control and MI membership. Type ${action.toUpperCase()} VERIFIED MI ADMIN: `,
    )) !== `${action.toUpperCase()} VERIFIED MI ADMIN`
  )
    throw Error('Not confirmed.');
  await db.runTransaction(async (tx) => {
    const policyRef = db.doc('policy/cloud-test'),
      roleRef = db.doc(`roles/${uid}`),
      identityRef = db.doc(`testIdentities/${uid}`),
      policy = (await tx.get(policyRef)).data(),
      role = await tx.get(roleRef),
      identity = await tx.get(identityRef);
    if (
      !policy ||
      policy.tenantId !== tenantId ||
      policy.realCollectionEnabled !== false
    )
      throw Error('Missing/mismatched synthetic policy.');
    if (action === 'grant' && policy.enabled)
      throw Error('Pause synthetic testing before granting new permissions.');
    const current = Array.isArray(policy.adminUids)
      ? policy.adminUids
      : [policy.adminUid];
    const next =
      action === 'grant'
        ? [...new Set([...current, uid])]
        : current.filter((v) => v !== uid);
    if (next.length > 4)
      throw Error(
        'Four administrator slots are already occupied. Explicitly revoke a replaced legacy binding first.',
      );
    if (
      action === 'revoke' &&
      (!role.exists ||
        role.data().tenantId !== tenantId ||
        role.data().objectId !== objectId ||
        identity.data()?.email !== email)
    )
      throw Error(
        'Existing portal binding does not match the verified revocation target.',
      );
    if (action === 'grant') {
      tx.set(roleRef, {
        active: true,
        tenantId,
        objectId,
        displayLabel: label || 'MI administrator',
        invitationManagement: true,
        statusViewing: true,
        correctionManagement: true,
        metadataCopy: true,
        metadataExport: true,
        auditViewing: true,
        workflowManagement: true,
        sensitiveRetrieval: false,
      });
      tx.set(identityRef, {
        email,
        active: true,
        purpose: 'dedicated-synthetic-test',
        ownershipVerified: true,
        providerIds: ['microsoft.com'],
        providerUids: { 'microsoft.com': objectId },
        attestedAt: Timestamp.now(),
        attestedBy: 'privileged-operator',
      });
    } else {
      tx.update(roleRef, { active: false, sensitiveRetrieval: false });
      tx.set(identityRef, { active: false }, { merge: true });
    }
    tx.update(policyRef, { adminUids: next });
    tx.create(db.collection('auditEvents').doc(), {
      actorUid: 'privileged-operator',
      targetUid: uid,
      event:
        action === 'grant'
          ? 'administrator_permissions_changed'
          : 'administrator_revoked',
      invitationId: null,
      at: Timestamp.now(),
    });
  });
  console.log(
    'Portal-only role change confirmed. No Auth account, shared settings, IAM or sensitive-retrieval permission changed.',
  );
} catch (error) {
  console.error(
    error?.code
      ? 'Provisioning failed. Check the approved UID, ADC and scoped permissions; no broader rights were applied.'
      : error.message,
  );
  process.exitCode = 1;
} finally {
  rl.close();
  await app.delete();
}
