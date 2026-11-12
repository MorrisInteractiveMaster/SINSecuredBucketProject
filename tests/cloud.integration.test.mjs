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
      'staffWorkspace/v1/requestsV2/v1/assignments/any',
      'staffWorkspace/v1/requestsV2/v1/payloads/any',
      'staffWorkspace/v1/requestsV2/v1/templates/any',
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
  const contractorEmail = 'one-time-fixture@example.org';
  const contractor = await token('google.com', contractorEmail, 'one-time-fictional', true);
  const staffPolicy = db.doc('staffWorkspace/v1/policy/access');
  const release = db.doc('staffWorkspace/v1/policy/sin-release');
  const role = db.doc('staffWorkspace/v1/roles/' + staffUid);
  const id = randomUUID();
  const entry = db.doc('staffWorkspace/v1/allowlist/' + emailKey(contractorEmail));
  const payload = db.doc('staffWorkspace/v1/sealedSin/' + id);
  const metadata = db.doc('staffWorkspace/v1/submissions/' + id);
  let unwrapFails = false;
  let delivered;
  const wrappingMask = Buffer.alloc(32, 42);
  const transform = (key) => Buffer.from(key.map((byte, i) => byte ^ wrappingMask[i]));
  await Promise.all([
    staffPolicy.set({ ...policy, version: 1, invitationImportApproved: true, privacyApprovalReference: guid }),
    role.set({ active: true, objectId: guid, tenantId: guid, emailKey: emailKey(admin), statusViewing: true, invitationManagement: true }),
    entry.set({ invitationId: id, email: contractorEmail, status: 'active', expiresAt: Timestamp.fromMillis(Date.now() + 3600000) }),
  ]);
  const live = createCloudRuntime({
    db, auth, projectId: 'demo-mi-sin-portal', emulator: true,
    staffRoster: [{ key: emailKey(admin), label: 'Fictional staff' }],
    verifyMicrosoft: async () => ({ tenantId: guid, objectId: guid, member: true, accountEmail: admin }),
    verificationSecret: () => 'ab'.repeat(32),
    mailer: async (email, code) => { delivered = { email, code }; },
    credential: { getAccessToken: async () => ({ access_token: 'fixture-only' }) },
    kmsFetcher: async (url, options) => {
      assert.match(url, /^https:\/\/cloudkms\.googleapis\.com\/v1\/projects\/fictional-keys\/locations\/northamerica-northeast1\//);
      const request = JSON.parse(options.body);
      assert.ok(request.additionalAuthenticatedData);
      const encrypt = url.endsWith(':encrypt');
      if (!encrypt && unwrapFails) return { ok: false };
      const key = transform(Buffer.from(request[encrypt ? 'plaintext' : 'ciphertext'], 'base64'));
      return { ok: true, json: async () => ({ [encrypt ? 'ciphertext' : 'plaintext']: key.toString('base64') }) };
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
  assert.notEqual((await call(contractor, 'portalSubmitSin', { value: '000000018', revision: 'initial' })).code, 200);
  await release.set({ enabled: true, approvalReference: guid,
    kmsKey: 'projects/fictional-keys/locations/northamerica-northeast1/keyRings/fixture/cryptoKeys/fixture',
  });
  assert.equal((await call(contractor, 'portalContext')).body.result.needsVerification, true);
  assert.equal((await call(contractor, 'portalSubmitSin', { value: '000000018', revision: 'initial' })).code, 403);
  assert.equal((await call(outsiderToken, 'portalBucketSendCode')).code, 403);
  assert.equal((await call(contractor, 'portalBucketSendCode')).code, 200);
  assert.equal(delivered.email, contractorEmail);
  const wrong = delivered.code === '12345678' ? '87654321' : '12345678';
  assert.equal((await call(contractor, 'portalBucketVerifyCode', { code: wrong })).code, 403);
  assert.equal((await call(contractor, 'portalBucketSendCode')).code, 429);
  assert.equal((await call(contractor, 'portalBucketVerifyCode', { code: delivered.code })).body.result.needsVerification, false);
  assert.equal((await call(contractor, 'portalBucketVerifyCode', { code: delivered.code })).code, 403);
  const proof = (await db.doc('staffWorkspace/v1/bucketMailboxProof/' + emailKey(contractorEmail)).get()).data();
  assert.equal(proof.hash, null);
  assert.equal(JSON.stringify(proof).includes(delivered.code), false);
  assert.equal((await call(contractor, 'portalSubmitSin', { value: '000000019', revision: 'initial' })).code, 400);
  assert.equal((await call(outsiderToken, 'portalSubmitSin', { value: '000000018', revision: 'initial' })).code, 403);
  const submit = () => call(contractor, 'portalSubmitSin', { value: '000000018', revision: 'initial' });
  assert.deepEqual((await Promise.all([submit(), submit()])).map((r) => r.code).sort(), [200, 409]);
  const sealed = (await payload.get()).data();
  assert.equal(sealed.ciphertext.length, 9);
  assert.equal(JSON.stringify(sealed).includes('000000018'), false);
  assert.equal((await call(contractor, 'portalContext')).body.result.submitted, true);
  assert.equal((await call(contractor, 'portalBucketReveal', { invitationId: id })).code, 403);
  assert.notEqual((await call(adminToken, 'portalRevealSin', { invitationId: id })).code, 200);
  assert.equal((await payload.get()).exists, true);
  const reveal = () => call(adminToken, 'portalBucketReveal', { invitationId: id });
  const results = await Promise.all([reveal(), reveal()]);
  assert.equal(results.filter((r) => r.code === 200).length, 1);
  assert.equal(results.find((r) => r.code === 200).body.result.value, '000000018');
  assert.notEqual((await reveal()).code, 200);
  assert.equal((await payload.get()).exists, false);
  assert.equal((await metadata.get()).data().retrievalStatus, 'retrieved');
  assert.equal((await metadata.get()).data().disposalStatus, 'disposed');
  assert.equal((await submit()).code, 409);
  const trustedEmail = 'other-fixture@gmail.com';
  const trusted = await token('google.com', trustedEmail, 'other-fixture', true);
  const trustedEntry = db.doc('staffWorkspace/v1/allowlist/' + emailKey(trustedEmail));
  for (const [type, sample, invalid] of [
    ['account', '000-AC 123', 'abc!'],
    ['code', 'XyZ-!42', 'two words'],
    ['text', 'Confidential café 🗝️\nSecond line', ''],
  ]) {
    const nextId = randomUUID();
    await trustedEntry.set({ invitationId: nextId, email: trustedEmail, status: 'active', expiresAt: Timestamp.fromMillis(Date.now() + 3600000) });
    assert.equal((await call(trusted, 'portalBucketConfigure', { label: 'Forbidden', type })).code, 403);
    const configured = await call(adminToken, 'portalBucketConfigure', { label: 'Requested value', type });
    assert.equal(configured.code, 200);
    const field = (await call(trusted, 'portalContext')).body.result.bucketField;
    assert.equal(field.type, type);
    assert.equal((await call(trusted, 'portalContext')).body.result.needsVerification, false);
    assert.notEqual((await call(trusted, 'portalSubmitSin', { value: sample, revision: 'initial' })).code, 200);
    assert.equal((await call(trusted, 'portalSubmitSin', { value: invalid, revision: field.revision })).code, 400);
    assert.equal((await call(trusted, 'portalSubmitSin', { value: sample, revision: field.revision })).code, 200);
    unwrapFails = type === 'code';
    const received = await call(adminToken, 'portalBucketReveal', { invitationId: nextId });
    if (unwrapFails) assert.equal(received.body.error.details.stage, 'sin-delivery');
    else assert.equal(received.body.result.value, sample);
    assert.equal((await db.doc('staffWorkspace/v1/sealedSin/' + nextId).get()).exists, false);
    unwrapFails = false;
    assert.notEqual((await call(adminToken, 'portalBucketReveal', { invitationId: nextId })).code, 200);
  }
  const audit = await db.collection('staffWorkspace/v1/auditEvents').get();
  assert.equal(audit.docs.filter((doc) => doc.data().event === 'sin_reveal_consumed').length, 4);
  assert.equal(JSON.stringify(audit.docs.map((doc) => doc.data())).includes('000000018'), false);
});

test('assigned requests isolate contractors and preserve independent persistent and one-time lifecycles', async () => {
  const admin = 'staff@example.org';
  const staffUid = request(adminToken).auth.uid;
  const firstEmail = 'requests-one@gmail.com';
  const secondEmail = 'requests-two@gmail.com';
  const first = await token('google.com', firstEmail, 'requests-one', true);
  const second = await token('google.com', secondEmail, 'requests-two', true);
  const firstId = randomUUID(), secondId = randomUUID();
  const ns = 'staffWorkspace/v1/';
  const root = 'requestsV2/v1/';
  await db.doc(ns + 'policy/access').set({ ...policy, version: 1, invitationImportApproved: true, privacyApprovalReference: guid });
  await db.doc(ns + 'policy/sin-release').set({ enabled: true, approvalReference: guid,
    kmsKey: 'projects/fictional-keys/locations/northamerica-northeast1/keyRings/fixture/cryptoKeys/fixture' });
  await db.doc(ns + 'roles/' + staffUid).set({ active: true, tenantId: guid, objectId: guid,
    emailKey: emailKey(admin), statusViewing: true, invitationManagement: true });
  const legacyId = randomUUID();
  await db.doc(ns + 'submissions/' + legacyId).set({ status: 'submitted', retrievalStatus: 'retrieved' });
  for (const [email, invitationId] of [[firstEmail, firstId], [secondEmail, secondId]])
    await db.doc(ns + 'allowlist/' + emailKey(email)).set({ email, invitationId, status: 'active', expiresAt: Timestamp.fromMillis(Date.now() + 3600000) });
  let unwrapFails = false;
  let timeline = Date.now();
  const fileCalls = [];
  let scanReady = false;
  await db.doc('staffLimits/member_' + staffUid).delete();
  const calls = createCloudRuntime({ db, auth, clock: () => timeline, projectId: 'demo-mi-sin-portal', emulator: true,
    staffRoster: [{ key: emailKey(admin), label: 'Fictional Staff' }],
    verifyMicrosoft: async () => ({ tenantId: guid, objectId: guid, member: true, accountEmail: admin }),
    custody: (_, operation) => operation === 'encrypt' ? { wrap: async (key) => Buffer.from(key) } :
      { unwrap: async (key) => { if (unwrapFails) throw new Error('fixture failure'); return Buffer.from(key); } },
    files: {
      validate: () => {}, upload: async () => ({ url: 'https://storage.example.org/fixture' }),
      inspect: async () => { if (!scanReady) throw new Error('quarantine'); return { generation: '123', clean: true }; },
      deliver: async (_, action) => { fileCalls.push(action); return { url: 'https://storage.example.org/clean' }; },
      delete: async () => {},
    },
  });
  const call = (t, operation, payload = {}) => calls(request(t, operation, payload));
  await assert.rejects(call(first, 'portalRequestList'));
  await db.doc(ns + 'policy/requests-v2').set({ enabled: true, cutover: true, approvalReference: guid, filesEnabled: true });
  const save = (type, label, maxLength) => call(adminToken, 'portalRequestTemplate', { type, label, maxLength, instructions: 'Fictional request', status: 'active' });
  const sin = await save('sin', 'SIN', 24), phone = await save('phone', 'Phone', 32), pdf = await save('file', 'Signed agreement', 1000);
  const assign = () => call(adminToken, 'portalRequestAssign', { invitationIds: [firstId], templateIds: [sin.id, phone.id, pdf.id] });
  const pair = await Promise.all([assign(), assign()]);
  assert.equal(pair.reduce((total, result) => total + result.created, 0), 3);
  await call(adminToken, 'portalRequestAssign', { invitationIds: [secondId], templateIds: [phone.id] });
  assert.equal((await call(first, 'portalContext')).bucketField, undefined);
  const one = (await call(first, 'portalRequestList')).assignments;
  const two = (await call(second, 'portalRequestList')).assignments;
  assert.equal(one.length, 3); assert.equal(two.length, 1);
  const phoneOne = one.find((a) => a.template.type === 'phone');
  const sinOne = one.find((a) => a.template.type === 'sin');
  const fileOne = one.find((a) => a.template.type === 'file');
  await assert.rejects(call(second, 'portalRequestSubmit', { assignmentId: phoneOne.id, value: '3065550100' }));
  await assert.rejects(call(second, 'portalRequestReveal', { assignmentId: phoneOne.id }));
  await assert.rejects(call(first, 'portalSubmitSin', { value: '000000018', revision: 'initial' }));
  await call(first, 'portalRequestSubmit', { assignmentId: phoneOne.id, value: '3065550100' });
  assert.equal((await call(first, 'portalRequestList')).assignments.find((a) => a.id === sinOne.id).status, 'pending');
  assert.equal(JSON.stringify((await db.doc(ns + root + 'payloads/' + phoneOne.id).get()).data()).includes('3065550100'), false);
  for (let i = 0; i < 2; i++) assert.equal((await call(adminToken, 'portalRequestReveal', { assignmentId: phoneOne.id })).value, '3065550100');
  assert.equal((await db.doc(ns + root + 'payloads/' + phoneOne.id).get()).exists, true);
  await call(adminToken, 'portalRequestTemplate', { id: phone.id, type: 'phone', label: 'Updated phone label', maxLength: 20, instructions: 'New instructions', status: 'active' });
  assert.equal((await call(first, 'portalRequestList')).assignments.find((a) => a.id === phoneOne.id).template.label, 'Phone');
  timeline += 61000;
  const reentered = await token('google.com', firstEmail, 'requests-one', true);
  await assert.rejects(call(reentered, 'portalRequestSubmit', { assignmentId: sinOne.id, value: '000000019' }));
  const submit = () => call(reentered, 'portalRequestSubmit', { assignmentId: sinOne.id, value: '000000018' });
  assert.equal((await Promise.allSettled([submit(), submit()])).filter((r) => r.status === 'fulfilled').length, 1);
  const reveal = () => call(adminToken, 'portalRequestReveal', { assignmentId: sinOne.id });
  assert.equal((await Promise.allSettled([reveal(), reveal()])).filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal((await db.doc(ns + root + 'payloads/' + sinOne.id).get()).exists, false);
  const failedType = await save('sin', 'Separate failure test', 24);
  await call(adminToken, 'portalRequestAssign', { invitationIds: [firstId], templateIds: [failedType.id] });
  const failed = (await call(first, 'portalRequestList')).assignments.find((a) => a.templateId === failedType.id);
  await call(first, 'portalRequestSubmit', { assignmentId: failed.id, value: '000000026' });
  unwrapFails = true;
  await assert.rejects(call(adminToken, 'portalRequestReveal', { assignmentId: failed.id }));
  unwrapFails = false;
  await assert.rejects(call(adminToken, 'portalRequestReveal', { assignmentId: failed.id }));
  timeline += 61000;
  const uploadData = { assignmentId: fileOne.id, name: 'fictional.pdf', size: 50, mime: 'application/pdf' };
  await assert.rejects(call(second, 'portalRequestUpload', uploadData));
  const upload = await call(first, 'portalRequestUpload', uploadData);
  await assert.rejects(call(adminToken, 'portalRequestFilePreview', { assignmentId: fileOne.id }));
  await assert.rejects(call(first, 'portalRequestFinishUpload', { assignmentId: fileOne.id, uploadId: upload.uploadId }));
  scanReady = true;
  await call(first, 'portalRequestFinishUpload', { assignmentId: fileOne.id, uploadId: upload.uploadId });
  await call(adminToken, 'portalRequestFilePreview', { assignmentId: fileOne.id });
  await call(adminToken, 'portalRequestFileDownload', { assignmentId: fileOne.id });
  await call(adminToken, 'portalRequestFilePreview', { assignmentId: fileOne.id });
  assert.deepEqual(fileCalls, ['preview', 'download', 'preview']);
  const phoneTwo = two[0];
  await call(adminToken, 'portalRequestCancel', { assignmentId: phoneTwo.id });
  await assert.rejects(call(second, 'portalRequestSubmit', { assignmentId: phoneTwo.id, value: '3065550100' }));
  await assert.rejects(call(adminToken, 'portalRequestCancel', { assignmentId: phoneOne.id }));
  const overview = await call(adminToken, 'portalRequestsOverview');
  assert.equal(JSON.stringify(overview).includes('3065550100'), false);
  assert.equal(JSON.stringify(overview).includes('wrappedKey'), false);
  assert.equal((await db.doc(ns + 'submissions/' + legacyId).get()).data().retrievalStatus, 'retrieved');
  await db.doc(ns + 'policy/requests-v2').update({ enabled: false });
  await assert.rejects(call(first, 'portalRequestList'));
  await assert.rejects(call(first, 'portalSubmitSin', { value: '000000018', revision: 'initial' }));
  await assert.rejects(call(adminToken, 'portalRequestReveal', { assignmentId: phoneOne.id }));
});

test('file capabilities require verified active ownership and expire before and after quarantine scanning', { timeout: 25000 }, async () => {
  const ns = 'staffWorkspace/v1/', root = ns + 'requestsV2/v1/';
  const staffUid = request(adminToken).auth.uid;
  const email = 'file-security@gmail.com', otherEmail = 'phone-only@gmail.com';
  const first = await token('google.com', email, 'file-security', true);
  const second = await token('google.com', otherEmail, 'phone-only', true);
  const unverified = await token('google.com', 'file-security@example.org', 'custom-unverified', false);
  const outsider = await token('google.com', 'file-outsider@gmail.com', 'file-outsider', true);
  let now = Date.now(), scans = 0, signings = 0, onScan = async () => {}, onSign = async () => {};
  const entry = db.doc(ns + 'allowlist/' + emailKey(email));
  const invitationId = randomUUID(), otherInvitation = randomUUID(), customInvitation = randomUUID();
  for (const [address, invitation] of [[email, invitationId], [otherEmail, otherInvitation], ['file-security@example.org', customInvitation]])
    await db.doc(ns + 'allowlist/' + emailKey(address)).set({ email: address, invitationId: invitation, status: 'active', expiresAt: Timestamp.fromMillis(now + 3600000) });
  await db.doc(ns + 'policy/requests-v2').set({ enabled: true, cutover: true, approvalReference: guid, filesEnabled: true });
  await db.doc(ns + 'roles/' + staffUid).set({ active: true, tenantId: guid, objectId: guid,
    emailKey: emailKey('staff@example.org'), statusViewing: true, invitationManagement: true });
  await db.doc('staffLimits/member_' + staffUid).delete();
  const runtime = createCloudRuntime({ db, auth, clock: () => now, projectId: 'demo-mi-sin-portal', emulator: true,
    staffRoster: [{ key: emailKey('staff@example.org'), label: 'Fictional Staff' }],
    verifyMicrosoft: async () => ({ tenantId: guid, objectId: guid, member: true, accountEmail: 'staff@example.org' }),
    custody: (_, operation) => operation === 'encrypt' ? { wrap: async (key) => Buffer.from(key) } : { unwrap: async (key) => Buffer.from(key) },
    files: {
      validate: () => {},
      upload: async (_assignment, _upload, _size, _policy, expiresAt) => {
        signings++; await onSign(); return { url: 'https://storage.example.org/fictional', expiresAt };
      },
      inspect: async () => { scans++; await onScan(); return { generation: '456', clean: true }; },
      deliver: async () => ({ url: 'https://storage.example.org/approved' }),
      delete: async () => { throw new Error('Viewing must never delete'); },
    },
  });
  const call = (identity, operation, payload = {}) => runtime(request(identity, operation, payload));
  const save = async (type, label, maxLength) => call(adminToken, 'portalRequestTemplate', { type, label, maxLength, instructions: '', status: 'active' });
  const file = await save('file', 'Security PDF', 1000), phone = await save('phone', 'Security phone', 32), sin = await save('sin', 'Security SIN', 24);
  await call(adminToken, 'portalRequestAssign', { invitationIds: [invitationId, customInvitation], templateIds: [file.id, sin.id] });
  await call(adminToken, 'portalRequestAssign', { invitationIds: [otherInvitation], templateIds: [phone.id] });
  const rows = (await call(first, 'portalRequestList')).assignments;
  const fileRow = rows.find((a) => a.template.type === 'file'), sinRow = rows.find((a) => a.template.type === 'sin');
  const phoneRow = (await call(second, 'portalRequestList')).assignments[0];
  const customRows = await db.collection(root + 'assignments').where('invitationId', '==', customInvitation).get();
  const customFile = customRows.docs.find((a) => a.data().template.type === 'file').id;
  const upload = (identity, assignmentId = fileRow.id) => call(identity, 'portalRequestUpload', { assignmentId, name: 'fictional.pdf', size: 50, mime: 'application/pdf' });
  const finish = (identity, grant, assignmentId = fileRow.id) => call(identity, 'portalRequestFinishUpload', { assignmentId, uploadId: grant.uploadId });
  await assert.rejects(runtime({ ...request(first, 'portalRequestUpload', {}), auth: undefined }));
  for (const [identity, assignmentId] of [[second, fileRow.id], [second, phoneRow.id], [first, sinRow.id], [unverified, customFile], [outsider, fileRow.id]])
    await assert.rejects(upload(identity, assignmentId));
  await assert.rejects(call(first, 'portalRequestUpload', { assignmentId: fileRow.id, name: 'fictional.pdf', size: 50, mime: 'application/pdf', email: email }));
  for (const change of [{ status: 'revoked' }, { status: 'active', expiresAt: Timestamp.fromMillis(now - 1) },
    { expiresAt: Timestamp.fromMillis(now + 3600000), invitationId: randomUUID() }]) {
    await entry.update(change); await assert.rejects(upload(first));
  }
  await entry.update({ status: 'active', invitationId, expiresAt: Timestamp.fromMillis(now + 3600000) });
  assert.equal(signings, 0, 'rejected identities and non-file assignments never reach signing');
  now += 61000;
  const simultaneous = await Promise.allSettled([upload(first), upload(first)]);
  assert.equal(simultaneous.filter((r) => r.status === 'fulfilled').length, 1);
  const initial = simultaneous.find((r) => r.status === 'fulfilled').value;
  assert.equal(initial.expiresAt, now + 300000);
  await assert.rejects(finish(second, initial));
  await assert.rejects(finish(first, { uploadId: randomUUID() }));
  now = initial.expiresAt;
  await assert.rejects(finish(first, initial));
  assert.equal(scans, 0, 'expired reservation is denied before object inspection');
  const afterExpiry = await upload(first);
  await assert.rejects(finish(first, initial));
  onScan = async () => { now += 300001; };
  await assert.rejects(finish(first, afterExpiry));
  assert.equal((await db.doc(root + 'assignments/' + fileRow.id).get()).data().status, 'quarantined');
  const beforeRevocation = await upload(first);
  onScan = async () => { await entry.update({ status: 'revoked' }); };
  await assert.rejects(finish(first, beforeRevocation));
  await entry.update({ status: 'active' }); onScan = async () => {};
  now += 300001;
  const current = await upload(first);
  await Promise.all([finish(first, current), finish(first, current)]);
  await finish(first, current); // acknowledgment retry is idempotent, not a new upload
  await assert.rejects(upload(first));
  now = Date.now(); // Start a fresh staff authorization period after advancing upload-expiry fixtures.
  for (const op of ['portalRequestFilePreview', 'portalRequestFileDownload']) {
    await assert.rejects(call(second, op, { assignmentId: fileRow.id }));
    assert.ok((await call(adminToken, op, { assignmentId: fileRow.id })).url);
  }
  await assert.rejects(call(first, 'portalRequestFilePreview', { assignmentId: fileRow.id }));
  await db.doc(ns + 'roles/' + staffUid).update({ active: false });
  await assert.rejects(call(adminToken, 'portalRequestFileDownload', { assignmentId: fileRow.id }));
  await db.doc(ns + 'roles/' + staffUid).update({ active: true });
  const events = await db.collection(ns + 'auditEvents').where('assignmentId', '==', fileRow.id).get();
  assert.equal(events.docs.filter((event) => event.data().event === 'request_file_accepted').length, 1);
  assert.equal((await db.doc(root + 'assignments/' + fileRow.id).get()).data().status, 'viewed');
  // A cancellation/revocation while keyless signing is in flight must not return a capability.
  const extra = await save('file', 'Cancelled security PDF', 1000);
  await call(adminToken, 'portalRequestAssign', { invitationIds: [invitationId], templateIds: [extra.id] });
  const next = (await call(first, 'portalRequestList')).assignments.find((a) => a.templateId === extra.id);
  onSign = async () => { await entry.update({ status: 'revoked' }); };
  await assert.rejects(upload(first, next.id));
  await entry.update({ status: 'active' }); onSign = async () => {};
  await call(adminToken, 'portalRequestCancel', { assignmentId: next.id });
  now += 61000;
  await assert.rejects(upload(first, next.id));
});
