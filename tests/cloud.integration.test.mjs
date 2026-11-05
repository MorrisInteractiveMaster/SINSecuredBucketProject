import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { generateKeyPairSync } from 'node:crypto';
import {
  initializeTestEnvironment,
  assertFails,
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  collection,
} from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { createCloudRuntime } from '../cloud-functions/cloud/runtime.mjs';
import { TARGET } from '../cloud-functions/cloud/gates.mjs';
if (
  process.env.GCLOUD_PROJECT !== 'demo-mi-sin-portal' ||
  process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099'
)
  throw new Error('Only demo Auth/Firestore emulators may run these tests');
let app,
  db,
  auth,
  runtime,
  rules,
  contractorToken,
  adminToken,
  outsiderToken,
  policy;
const guid = '11111111-1111-1111-1111-111111111111';
function jwt(payload) {
  return `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.`;
}
async function token(providerId, email, sub) {
  const r = await fetch(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=demo-only',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestUri: 'http://localhost',
        postBody: new URLSearchParams({
          providerId,
          id_token: jwt({
            sub,
            oid: sub,
            email,
            email_verified: false,
            iss: 'https://accounts.google.com',
            aud: 'demo-only',
          }),
        }).toString(),
        returnSecureToken: true,
      }),
    },
  );
  const b = await r.json();
  assert.ok(r.ok);
  return b.idToken;
}
function request(t, operation, payload = {}, extra = {}) {
  return {
    auth: {
      uid: JSON.parse(Buffer.from(t.split('.')[1], 'base64url')).user_id,
    },
    app: { appId: TARGET.appId },
    rawRequest: { headers: { authorization: `Bearer ${t}` } },
    data: { operation, payload, ...extra },
  };
}
async function deny(p, code) {
  await assert.rejects(p, (e) => e.code === code);
}
before(async () => {
  app = initializeApp({ projectId: 'demo-mi-sin-portal' }, 'cloud-tests');
  db = getFirestore(app, 'mi-sin-portal');
  auth = getAuth(app);
  await fetch(
    'http://127.0.0.1:8080/emulator/v1/projects/demo-mi-sin-portal/databases/mi-sin-portal/documents',
    { method: 'DELETE' },
  );
  contractorToken = await token(
    'google.com',
    'cloud@example.net',
    'cloud-test-google',
  );
  adminToken = await token('microsoft.com', 'staff@example.org', guid);
  outsiderToken = await token(
    'google.com',
    'outsider@example.org',
    'unapproved',
  );
  const cid = request(contractorToken).auth.uid,
    aid = request(adminToken).auth.uid;
  const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 4096 });
  policy = {
    projectId: TARGET.projectId,
    databaseId: TARGET.databaseId,
    mode: TARGET.mode,
    adminUid: aid,
    tenantId: guid,
    microsoftClientId: guid,
    enabled: true,
    financialReviewApproved: true,
    isolationReviewApproved: true,
    realCollectionEnabled: false,
    sensitiveRetrievalEnabled: false,
    disposalEnabled: false,
    expiresAt: Timestamp.fromMillis(Date.now() + 3600000),
  };
  await db.doc('policy/cloud-test').set(policy);
  await db.doc('policy/mvp').set({
    mode: TARGET.mode,
    keyId: 'ephemeral-synthetic',
    publicKey: publicKey.export({ format: 'jwk' }),
  });
  await db.doc(`roles/${aid}`).set({
    active: true,
    tenantId: guid,
    objectId: guid,
    invitationManagement: true,
    statusViewing: true,
    correctionManagement: true,
    sensitiveRetrieval: false,
  });
  for (const [id, email, p, uid] of [
    [cid, 'cloud@example.net', 'google.com', 'cloud-test-google'],
    [aid, 'staff@example.org', 'microsoft.com', guid],
  ])
    await db.doc(`testIdentities/${id}`).set({
      active: true,
      email,
      providerIds: [p],
      providerUids: { [p]: uid },
      purpose: 'dedicated-synthetic-test',
      ownershipVerified: true,
    });
  runtime = createCloudRuntime({
    db,
    auth,
    projectId: 'demo-mi-sin-portal',
    emulator: true,
    verifyMicrosoft: async (assertion) => {
      if (assertion !== 'test-signed-member')
        throw new Error('Invalid test assertion');
      return { tenantId: guid, objectId: guid, member: true };
    },
  });
  rules = await initializeTestEnvironment({
    projectId: 'demo-mi-sin-portal',
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: readFileSync('firestore.mi-sin-portal.cloud-test.rules', 'utf8'),
    },
  });
});
after(async () => {
  await rules.cleanup();
  await deleteApp(app);
});
test('signed Auth-emulator accounts still need explicit test identity, tenant assertion and active release gates', async () => {
  await deny(
    runtime({
      ...request(contractorToken, 'portalContext'),
      rawRequest: { headers: {} },
    }),
    'unauthenticated',
  );
  await deny(
    runtime(request(outsiderToken, 'portalContext')),
    'permission-denied',
  );
  await assert.rejects(runtime(request(adminToken, 'portalContext')));
  assert.equal(
    (
      await runtime(
        request(
          adminToken,
          'portalContext',
          {},
          { microsoftIdToken: 'test-signed-member' },
        ),
      )
    ).kind,
    'admin',
  );
  await db.doc('policy/cloud-test').update({ enabled: false });
  await deny(
    runtime(request(contractorToken, 'portalContext')),
    'failed-precondition',
  );
  await db.doc('policy/cloud-test').set(policy);
  const withAppCheck = createCloudRuntime({
    db,
    auth,
    projectId: TARGET.projectId,
  });
  await deny(
    withAppCheck({
      ...request(contractorToken, 'portalContext'),
      app: { appId: 'other-app' },
    }),
    'permission-denied',
  );
});
test('cloud import refuses real contractor/unapproved identities and user-provided free text names', async () => {
  const adminReq = (csv) =>
    request(
      adminToken,
      'portalImportAllowlist',
      { csv },
      { microsoftIdToken: 'test-signed-member' },
    );
  await deny(
    runtime(
      adminReq(
        'name,email,status\nTest account,not-approved@example.net,active',
      ),
    ),
    'invalid-argument',
  );
  await deny(
    runtime(
      adminReq(
        'name,email,status\nUnapproved personal name,cloud@example.net,active',
      ),
    ),
    'invalid-argument',
  );
  assert.equal(
    (
      await runtime(
        adminReq('name,email,status\nTest Google,cloud@example.net,active'),
      )
    ).imported,
    1,
  );
});
test('cloud cannot persist hidden real data in ciphertext; concurrent valid fixture calls consume one slot', async () => {
  const c = await runtime(request(contractorToken, 'portalContext'));
  const data = {
    invitationId: c.invitationId,
    revision: c.revision,
    fixtureId: 'fixture-a',
  };
  await deny(
    runtime(
      request(contractorToken, 'portalSubmit', {
        ...data,
        ciphertext: 'hidden-data',
      }),
    ),
    'invalid-argument',
  );
  await deny(
    runtime(
      request(contractorToken, 'portalSubmit', { ...data, sin: '000000034' }),
    ),
    'invalid-argument',
  );
  await deny(
    runtime(
      request(contractorToken, 'portalSubmit', {
        ...data,
        fixtureId: '000000034',
      }),
    ),
    'invalid-argument',
  );
  assert.equal((await db.collection('encryptedRecords').get()).size, 0);
  const results = await Promise.allSettled(
    Array.from({ length: 10 }, () =>
      runtime(request(contractorToken, 'portalSubmit', data)),
    ),
  );
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal((await db.collection('encryptedRecords').get()).size, 1);
  await deny(
    runtime(request(contractorToken, 'portalSubmit', data)),
    'already-exists',
  );
  const record = (
    await db.doc(`encryptedRecords/${c.invitationId}`).get()
  ).data();
  assert.equal(record.ciphertext.length, 512);
  assert.equal(JSON.stringify(record).includes('000000018'), false);
  for (const operation of [
    'portalSensitiveRetrieval',
    'portalTestMailbox',
    'portalSendVerification',
    'portalDisposal',
  ])
    await deny(
      runtime(request(contractorToken, operation)),
      'failed-precondition',
    );
});
test('cloud direct Firestore access is denied for every role, schema/ownership attack and subcollection', async () => {
  for (const ctx of [
    rules.unauthenticatedContext(),
    rules.authenticatedContext(request(contractorToken).auth.uid),
    rules.authenticatedContext(request(adminToken).auth.uid),
  ]) {
    const client = ctx.firestore('mi-sin-portal');
    for (const path of [
      'policy/cloud-test',
      'roles/forged',
      'encryptedRecords/any',
      'portalSessions/any',
      'allowlist/any',
      'submissions/any',
      'submissions/any/nested/doc',
    ]) {
      const d = doc(client, path);
      await assertFails(getDoc(d));
      await assertFails(
        setDoc(d, {
          ownerUID: 'someone-else',
          extra: 'x'.repeat(10000),
          status: 'completed',
          active: true,
        }),
      );
      await assertFails(
        updateDoc(d, { active: true, createdAt: 'wrong type' }),
      );
      await assertFails(deleteDoc(d));
    }
    await assertFails(getDocs(collection(client, 'encryptedRecords')));
  }
  const other = rules
    .authenticatedContext('staff')
    .firestore('existing-app-sentinel');
  await assertFails(
    setDoc(doc(other, 'submissions', 'any'), { status: 'submitted' }),
  );
});
test('revocation, wrong email/provider binding and test budget are enforced before operations', async () => {
  const uid = request(contractorToken).auth.uid,
    r = db.doc(`testIdentities/${uid}`);
  await r.update({ active: false });
  await deny(
    runtime(request(contractorToken, 'portalContext')),
    'permission-denied',
  );
  await r.update({ active: true, email: 'wrong@example.net' });
  await deny(
    runtime(request(contractorToken, 'portalContext')),
    'permission-denied',
  );
  await r.update({
    email: 'cloud@example.net',
    providerUids: { 'google.com': 'wrong' },
  });
  await deny(
    runtime(request(contractorToken, 'portalContext')),
    'permission-denied',
  );
  await r.update({ providerUids: { 'google.com': 'cloud-test-google' } });
  await db
    .doc('testLimits/global')
    .set({ count: 1000, until: Timestamp.fromMillis(Date.now() + 60000) });
  await deny(
    runtime(request(contractorToken, 'portalContext')),
    'resource-exhausted',
  );
});
