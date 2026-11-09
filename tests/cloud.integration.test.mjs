import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
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
import { emailKey } from '../functions/lib/security.mjs';
import { createTransportHandler } from '../cloud-functions/cloud/transport.mjs';
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
async function token(providerId, email, sub, verified = false) {
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
            email_verified: verified,
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

test('multiple approved Microsoft UID bindings remain independent and role revocation is immediate', async () => {
  await db.doc('testLimits/global').delete();
  const primary = request(adminToken).auth.uid,
    objectId = '22222222-2222-2222-2222-222222222222';
  const secondToken = await token(
      'microsoft.com',
      'second-staff@example.org',
      objectId,
    ),
    second = request(secondToken).auth.uid;
  await db
    .doc(`testIdentities/${second}`)
    .set({
      active: true,
      email: 'second-staff@example.org',
      purpose: 'dedicated-synthetic-test',
      ownershipVerified: true,
      providerIds: ['microsoft.com'],
      providerUids: { 'microsoft.com': objectId },
    });
  await db.doc('policy/cloud-test').update({ adminUids: [primary, second] });
  await db
    .doc(`roles/${second}`)
    .set({
      active: true,
      tenantId: guid,
      objectId,
      statusViewing: true,
      invitationManagement: false,
      metadataExport: false,
      sensitiveRetrieval: false,
    });
  const dispatch = createCloudRuntime({
    db,
    auth,
    projectId: 'demo-mi-sin-portal',
    emulator: true,
    verifyMicrosoft: async (assertion) => {
      if (assertion !== 'signed-second') throw Error('Rejected');
      return { member: true, tenantId: guid, objectId };
    },
  });
  assert.equal(
    (
      await dispatch(
        request(
          secondToken,
          'portalContext',
          {},
          { microsoftIdToken: 'signed-second' },
        ),
      )
    ).kind,
    'admin',
  );
  await deny(
    dispatch(
      request(
        secondToken,
        'portalImportAllowlist',
        { csv: 'name,email,status\nTest,test@example.org,active' },
        { microsoftIdToken: 'signed-second' },
      ),
    ),
    'permission-denied',
  );
  await deny(
    dispatch(
      request(
        secondToken,
        'portalMetadataOutput',
        { kind: 'xlsx', scope: 'all', fields: ['email'] },
        { microsoftIdToken: 'signed-second' },
      ),
    ),
    'permission-denied',
  );
  await db.doc(`roles/${second}`).update({ active: false });
  await deny(
    dispatch(
      request(
        secondToken,
        'portalOverview',
        {},
        { microsoftIdToken: 'signed-second' },
      ),
    ),
    'permission-denied',
  );
  assert.ok((await db.doc(`roles/${primary}`).get()).data().active);
  await db.doc('policy/cloud-test').update({ adminUids: [primary] });
});

test('live UI operations through callable transport and named Firestore consume and remove a SIN once', async () => {
  const admin = 'staff@example.org';
  const staffUid = request(adminToken).auth.uid;
  const contractorEmail = 'one-time-fixture@gmail.com';
  const contractor = await token('google.com', contractorEmail, 'one-time-fictional', true);
  const staffPolicy = db.doc('staffWorkspace/v1/policy/access');
  const release = db.doc('staffWorkspace/v1/policy/sin-release');
  const role = db.doc('staffWorkspace/v1/roles/' + staffUid);
  const id = randomUUID();
  const entry = db.doc('staffWorkspace/v1/allowlist/' + emailKey(contractorEmail));
  const payload = db.doc('staffWorkspace/v1/sealedSin/' + id);
  const metadata = db.doc('staffWorkspace/v1/submissions/' + id);
  let unwrapFails = false;
  const wrappingMask = Buffer.alloc(32, 42);
  const transform = (key) => Buffer.from(key.map((byte, i) => byte ^ wrappingMask[i]));
  await Promise.all([
    staffPolicy.set({ ...policy, version: 1, invitationImportApproved: true, privacyApprovalReference: guid }),
    role.set({ active: true, objectId: guid, tenantId: guid, emailKey: emailKey(admin), statusViewing: true }),
    entry.set({ invitationId: id, email: contractorEmail, status: 'active', expiresAt: Timestamp.fromMillis(Date.now() + 3600000) }),
  ]);
  const live = createCloudRuntime({
    db, auth, projectId: 'demo-mi-sin-portal', emulator: true,
    staffRoster: [{ key: emailKey(admin), label: 'Fictional staff' }],
    verifyMicrosoft: async () => ({ tenantId: guid, objectId: guid, member: true, accountEmail: admin }),
    custody: (_, operation) => operation === 'encrypt' ? { wrap: async (key) => transform(key) } : {
      unwrap: async (key) => {
        if (unwrapFails) throw new Error('simulated KMS failure');
        return transform(key);
      },
    },
  });
  const handler = createTransportHandler({
    dispatch: live,
    verifyAppToken: async () => ({ appId: TARGET.appId }),
  });
  async function call(t, op, data = {}) {
    const input = request(t, op, data);
    const response = { setHeader(name, value) { assert.equal(value, 'no-store'); },
      status(code) { this.code = code; return this; },
      json(body) { this.body = body; },
    };
    await handler({ ...input.rawRequest, method: 'POST', is: () => true, get: () => 'fixture-app-check',
      body: { data: input.data },
    }, response);
    return response;
  }
  assert.notEqual((await call(contractor, 'portalSubmitSin', { sin: '000000018' })).code, 200);
  await release.set({ enabled: true, approvalReference: guid,
    kmsKey: 'projects/fictional-keys/locations/northamerica-northeast1/keyRings/fixture/cryptoKeys/fixture',
  });
  assert.equal((await call(contractor, 'portalContext')).body.result.liveSin, true);
  assert.equal((await call(contractor, 'portalSubmitSin', { sin: '000000019' })).code, 400);
  assert.equal((await call(outsiderToken, 'portalSubmitSin', { sin: '000000018' })).code, 403);
  const submit = () => call(contractor, 'portalSubmitSin', { sin: '000000018' });
  assert.deepEqual((await Promise.all([submit(), submit()])).map((r) => r.code).sort(), [200, 409]);
  const sealed = (await payload.get()).data();
  assert.equal(sealed.ciphertext.length, 9);
  assert.equal(JSON.stringify(sealed).includes('000000018'), false);
  assert.equal((await call(contractor, 'portalContext')).body.result.submitted, true);
  assert.equal((await call(contractor, 'portalRevealSin', { invitationId: id })).code, 403);
  const reveal = () => call(adminToken, 'portalRevealSin', { invitationId: id });
  const results = await Promise.all([reveal(), reveal()]);
  assert.equal(results.filter((r) => r.code === 200).length, 1);
  assert.equal(results.find((r) => r.code === 200).body.result.sin, '000000018');
  assert.notEqual((await reveal()).code, 200);
  assert.equal((await payload.get()).exists, false);
  assert.equal((await metadata.get()).data().retrievalStatus, 'retrieved');
  assert.equal((await metadata.get()).data().disposalStatus, 'disposed');
  assert.equal((await submit()).code, 409);
  const second = randomUUID();
  await entry.update({ invitationId: second });
  assert.equal((await submit()).code, 200);
  unwrapFails = true;
  assert.notEqual((await call(adminToken, 'portalRevealSin', { invitationId: second })).code, 200);
  assert.equal((await db.doc('staffWorkspace/v1/sealedSin/' + second).get()).exists, false);
  unwrapFails = false;
  assert.notEqual((await call(adminToken, 'portalRevealSin', { invitationId: second })).code, 200);
  const audit = await db.collection('staffWorkspace/v1/auditEvents').get();
  assert.equal(audit.docs.filter((doc) => doc.data().event === 'sin_reveal_consumed').length, 2);
  assert.equal(JSON.stringify(audit.docs.map((doc) => doc.data())).includes('000000018'), false);
});
