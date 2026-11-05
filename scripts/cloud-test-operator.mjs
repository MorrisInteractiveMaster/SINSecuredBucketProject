import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { normalizeEmail } from '../functions/lib/csv.mjs';
import { TARGET } from '../cloud-functions/cloud/gates.mjs';
const action = process.argv[2];
if (!['bootstrap', 'add-tester', 'activate', 'disable'].includes(action))
  throw new Error('Choose bootstrap, add-tester, activate or disable.');
if (
  process.env.FIRESTORE_EMULATOR_HOST ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST
)
  throw new Error('Do not run the cloud operator tool inside emulators.');
const rl = createInterface({ input: stdin, output: stdout });
const ask = async (text) => (await rl.question(text)).trim();
const confirm = async (text, phrase) => {
  if ((await ask(text + `\nType ${phrase}: `)) !== phrase)
    throw new Error('No changes made: confirmation did not match.');
};
const guid = (v) => {
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v)
  )
    throw new Error('A GUID is required.');
  return v.toLowerCase();
};
const app = initializeApp({
  credential: applicationDefault(),
  projectId: TARGET.projectId,
});
const auth = getAuth(app),
  db = getFirestore(app, 'mi-sin-portal');
async function approvedIdentity(providerRequired) {
  const uid = await ask('Exact existing Firebase Authentication UID: '),
    email = normalizeEmail(
      await ask(
        'Exact approved dedicated-test email (or MI administrator email for bootstrap): ',
      ),
    );
  const user = await auth.getUser(uid);
  if (user.disabled || normalizeEmail(user.email) !== email)
    throw new Error('UID/email mismatch or disabled user. No changes made.');
  const providers = user.providerData.filter((p) =>
    ['google.com', 'microsoft.com'].includes(p.providerId),
  );
  if (
    !providers.length ||
    (providerRequired &&
      !providers.some((p) => p.providerId === providerRequired))
  )
    throw new Error(
      'Required provider is not linked to this UID. No Auth changes were attempted.',
    );
  await confirm(
    'Confirm you independently verified control of this exact email and provider identity. For contractors, confirm this is a DEDICATED TEST account, not a real contractor.',
    'I VERIFIED THIS TEST IDENTITY',
  );
  return {
    uid,
    email,
    providers,
    data: {
      email,
      active: true,
      purpose: 'dedicated-synthetic-test',
      ownershipVerified: true,
      providerIds: providers.map((p) => p.providerId),
      providerUids: Object.fromEntries(
        providers.map((p) => [p.providerId, p.uid]),
      ),
      attestedAt: Timestamp.now(),
      attestedBy: 'privileged-cloud-shell-operator',
    },
  };
}
try {
  await confirm(
    `Target ONLY ${TARGET.projectId}, database ${TARGET.databaseId}. This tool writes no other database and never creates/updates Auth users.`,
    'mi-sin-portal',
  );
  if (action === 'bootstrap') {
    const account = await approvedIdentity('microsoft.com'),
      tenantId = guid(await ask('Approved MI Entra tenant GUID: ')),
      objectId = guid(
        await ask('Approved MI MEMBER object GUID (not a guest): '),
      ),
      microsoftClientId = guid(
        await ask(
          'Microsoft Entra APPLICATION/CLIENT GUID (not Firebase App ID): ',
        ),
      );
    if (
      account.providers.find((p) => p.providerId === 'microsoft.com').uid !==
      objectId
    )
      throw new Error(
        'Microsoft provider UID does not match the approved Entra object ID. Stop and review the integration.',
      );
    await confirm(
      'Create exactly ONE invitation/status/correction administrator. Retrieval and disposal stay disabled. Existing bootstrap/roles/policy will NEVER be overwritten.',
      'BOOTSTRAP ONE MI ADMIN',
    );
    const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 4096 }),
      keyId = randomUUID();
    await db.runTransaction(async (tx) => {
      const lock = db.doc('policy/bootstrap'),
        policy = db.doc('policy/cloud-test'),
        mvp = db.doc('policy/mvp'),
        role = db.doc(`roles/${account.uid}`),
        identity = db.doc(`testIdentities/${account.uid}`);
      const docs = await tx.getAll(lock, policy, mvp, role, identity);
      if (docs.some((d) => d.exists))
        throw new Error('Bootstrap state already exists. Nothing overwritten.');
      tx.create(lock, { adminUid: account.uid, at: Timestamp.now() });
      tx.create(policy, {
        projectId: TARGET.projectId,
        databaseId: TARGET.databaseId,
        mode: TARGET.mode,
        adminUid: account.uid,
        tenantId,
        microsoftClientId,
        enabled: false,
        financialReviewApproved: false,
        isolationReviewApproved: false,
        realCollectionEnabled: false,
        sensitiveRetrievalEnabled: false,
        disposalEnabled: false,
        expiresAt: Timestamp.now(),
      });
      tx.create(mvp, {
        mode: TARGET.mode,
        keyId,
        publicKey: publicKey.export({ format: 'jwk' }),
      });
      tx.create(role, {
        active: true,
        tenantId,
        objectId,
        invitationManagement: true,
        statusViewing: true,
        correctionManagement: true,
        sensitiveRetrieval: false,
      });
      tx.create(identity, account.data);
    });
    console.log(
      'One MI administrator bootstrapped. Cloud test remains DISABLED. Synthetic private key discarded.',
    );
  } else if (action === 'add-tester') {
    const account = await approvedIdentity();
    await db.runTransaction(async (tx) => {
      const policy = (await tx.get(db.doc('policy/cloud-test'))).data(),
        active = await tx.get(
          db.collection('testIdentities').where('active', '==', true),
        ),
        r = db.doc(`testIdentities/${account.uid}`),
        old = await tx.get(r);
      if (
        !policy ||
        account.uid === policy.adminUid ||
        old.exists ||
        active.size >= 6
      )
        throw new Error(
          'Not eligible: bootstrap missing, identity exists/admin, or five-test-account limit reached. Nothing overwritten.',
        );
      tx.create(r, account.data);
    });
    console.log(
      'Dedicated test identity approved. Import its exact email using a Test label in the dashboard.',
    );
  } else if (action === 'activate') {
    await confirm(
      'Review billing usage, provider/App Check configuration, runtime IAM isolation and existing-app behavior first. Named Firestore usage WILL be billed; CAD $0 cannot be guaranteed.',
      'I APPROVE USAGE-BASED SYNTHETIC TEST COSTS',
    );
    await confirm(
      'Confirm runtime access is restricted to the named portal database and existing-app regression checks are complete.',
      'I REVIEWED ISOLATION AND EXISTING APP',
    );
    await db.runTransaction(async (tx) => {
      const r = db.doc('policy/cloud-test'),
        s = await tx.get(r);
      if (
        !s.exists ||
        s.data().mode !== TARGET.mode ||
        s.data().realCollectionEnabled !== false
      )
        throw new Error('Approved bootstrap is missing or changed.');
      tx.update(r, {
        enabled: true,
        financialReviewApproved: true,
        isolationReviewApproved: true,
        expiresAt: Timestamp.fromMillis(Date.now() + 24 * 3600000),
      });
    });
    console.log(
      'Synthetic testing enabled for at most 24 hours. Real submission, reveal and disposal remain disabled.',
    );
  } else {
    await confirm(
      'Close the synthetic callable gate. This does not delete any records or affect other apps.',
      'DISABLE SYNTHETIC TEST',
    );
    await db
      .doc('policy/cloud-test')
      .update({ enabled: false, expiresAt: Timestamp.now() });
    console.log(
      'Synthetic cloud testing disabled. Hosting may still show the sign-in page; calls are blocked.',
    );
  }
} catch (error) {
  console.error(
    error?.code
      ? 'Operator action failed. Check ADC, scoped permissions and existing resource state; no broader permissions were applied.'
      : error.message,
  );
  process.exitCode = 1;
} finally {
  rl.close();
  await app.delete();
}
