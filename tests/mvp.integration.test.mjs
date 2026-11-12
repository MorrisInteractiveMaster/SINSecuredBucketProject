import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { deleteApp as deleteAdminApp } from 'firebase-admin/app';
import { initializeApp, deleteApp } from 'firebase/app';
import {
  initializeFirestore,
  connectFirestoreEmulator,
  memoryLocalCache,
  getDoc,
  doc,
  setDoc,
} from 'firebase/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import { seedMvp } from '../scripts/seed-mvp.mjs';
import { createContractorAccess } from '../cloud-functions/cloud/contractors.mjs';
import { createService } from '../functions/lib/service.mjs';
import { emailKey } from '../functions/lib/security.mjs';
if (
  process.env.GCLOUD_PROJECT !== 'demo-mi-sin-portal' ||
  process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099'
)
  throw new Error('Demo emulators required');
let db,
  auth,
  adminApp,
  service,
  now = Date.now();
const mailbox = new Map();
const who = (
  providerId = 'microsoft.com',
  uid = 'contractor-ms',
  email = 'contractor@example.com',
) => ({
  uid,
  email,
  providerId,
  emailTrusted: false,
  authTime: Math.floor(now / 1000),
});
const admin = () => ({
  ...who('microsoft.com', 'mi-admin', 'admin@example.com'),
  organization: {
    member: true,
    tenantId: 'emulator-mi-tenant',
    objectId: 'emulator-mi-member',
  },
});
const bad = async (p, code) => {
  await assert.rejects(p, (e) => e.code === code);
};
const encrypted = () => Buffer.alloc(512, 11).toString('base64');
async function prove(w) {
  await service.beginVerification(w);
  await service.verify(w, mailbox.get(w.uid).code);
}
before(async () => {
  const r = await fetch(
    'http://127.0.0.1:8080/emulator/v1/projects/demo-mi-sin-portal/databases/mi-sin-portal/documents',
    { method: 'DELETE' },
  );
  assert.ok(r.ok);
  const seed = await seedMvp();
  db = seed.db;
  auth = seed.auth;
  adminApp = seed.app;
  service = createService({
    db,
    clock: () => now,
    pepper: 'test-pepper-not-production',
    tenantId: 'emulator-mi-tenant',
    sendCode: async (mail) => mailbox.set(mail.uid, mail),
  });
});
after(() => deleteAdminApp(adminApp));
test('allowlist rejects unauthorized identity, ignores claimed organization/domain privileges and separates roles', async () => {
  await bad(
    service.context(who('google.com', 'outsider', 'outsider@example.org')),
    'permission-denied',
  );
  await bad(
    service.importCsv(
      { ...admin(), providerId: 'google.com' },
      'name,email,status\nNew,new@example.org,active',
    ),
    'permission-denied',
  );
  await bad(
    service.importCsv(
      {
        ...admin(),
        organization: { ...admin().organization, tenantId: 'wrong' },
      },
      'name,email,status\nNew,new@example.org,active',
    ),
    'permission-denied',
  );
  assert.equal((await service.context(admin())).kind, 'admin');
  await db.doc('roles/mi-admin').update({ statusViewing: false });
  await bad(service.list(admin()), 'permission-denied');
  await service.importCsv(
    admin(),
    'name,email,status\nNew,new@example.org,active',
  );
  await db.doc('roles/mi-admin').update({ statusViewing: true });
});
test('unverified ownership cannot submit; mismatched code, expiry, resend limits and replay enforced', async () => {
  const w = who(),
    c = await service.context(w);
  assert.equal(c.needsVerification, true);
  await bad(
    service.submit(w, {
      ...c,
      syntheticValue: '000000018',
      ciphertext: encrypted(),
    }),
    'failed-precondition',
  );
  await service.beginVerification(w);
  const old = mailbox.get(w.uid).code;
  await bad(service.beginVerification(w), 'resource-exhausted');
  const wrong = old === '99999999' ? '99999998' : '99999999';
  await bad(service.verify(w, wrong), 'permission-denied');
  await service.verify(w, old);
  await bad(service.verify(w, old), 'permission-denied');
  now += 61000;
  await service.beginVerification(w);
  now += 601000;
  await bad(service.verify(w, mailbox.get(w.uid).code), 'permission-denied');
  now += 3600000;
  w.authTime = Math.floor(now / 1000);
  await prove(w);
  assert.equal((await service.context(w)).needsVerification, false);
});
test('revocation and removal immediately deny backend and Firestore access; new provider requires new proof', async () => {
  const w = who();
  await proveAfterCooldown(w);
  const c = await service.context(w);
  const app = initializeApp(
    { projectId: 'demo-mi-sin-portal', apiKey: 'demo-only' },
    'rules-live-revocation',
  );
  const client = initializeFirestore(
    app,
    { localCache: memoryLocalCache() },
    'mi-sin-portal',
  );
  connectFirestoreEmulator(client, '127.0.0.1', 8080, {
    mockUserToken: {
      sub: w.uid,
      email: w.email,
      email_verified: false,
      firebase: { sign_in_provider: 'microsoft.com' },
    },
  });
  await getDoc(doc(client, 'portalSessions', w.uid));
  await service.importCsv(
    admin(),
    'name,email,status\nDemo,contractor@example.com,revoked',
  );
  await bad(service.context(w), 'permission-denied');
  await assert.rejects(
    getDoc(doc(client, 'portalSessions', w.uid)),
    (e) => e.code === 'permission-denied',
  );
  await bad(service.importCsv(admin(), 'name,email,status\nDemo,contractor@example.com,active'), 'failed-precondition');
  const access = createContractorAccess({ db, clock: () => now }), actor = admin();
  const authorize = (tx) => service.authorizeTx(tx, actor, 'invitationManagement');
  const review = await access.review(actor, { action: 'restore', invitationIds: [c.invitationId] }, authorize);
  await access.apply(actor, { reviewId: review.reviewId, confirmation: 'RESTORE ACCESS' }, authorize);
  const switched = who('google.com', 'different-uid');
  assert.equal((await service.context(switched)).needsVerification, true);
  await bad(
    service.verify(switched, mailbox.get(w.uid).code),
    'permission-denied',
  );
  await assert.rejects(
    setDoc(doc(client, 'allowlist', emailKey(w.email)), { status: 'active' }),
    (e) => e.code === 'permission-denied',
  );
  await deleteApp(app);
  assert.equal((await service.context(w)).invitationId, c.invitationId);
});
async function proveAfterCooldown(w) {
  now += 3600001;
  w.authTime = Math.floor(now / 1000);
  await prove(w);
}
test('20 concurrent backend submissions create one record; provider switching and reimport cannot reopen it', async () => {
  const w = who();
  await proveAfterCooldown(w);
  const c = await service.context(w),
    data = { ...c, ciphertext: encrypted(), syntheticValue: '000000018' };
  const results = await Promise.allSettled(
    Array.from({ length: 20 }, () => service.submit(w, data)),
  );
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const record = (
    await db.doc(`encryptedRecords/${c.invitationId}`).get()
  ).data();
  assert.ok(Buffer.isBuffer(record.ciphertext));
  assert.equal(JSON.stringify(record).includes('000000018'), false);
  const switched = who('google.com', 'different-google-uid');
  await proveAfterCooldown(switched);
  const cc = await service.context(switched);
  assert.equal(cc.invitationId, c.invitationId);
  assert.equal(cc.submitted, true);
  await bad(
    service.submit(switched, { ...data, revision: cc.revision }),
    'already-exists',
  );
  await service.importCsv(admin(), 'name,email,status\nChanged,contractor@example.com,removed');
  await bad(service.context(switched), 'permission-denied');
  await bad(service.importCsv(admin(), 'name,email,status\nChanged,contractor@example.com,active'), 'failed-precondition');
  await bad(service.context(switched), 'permission-denied');
  await service.correction(admin(), c.invitationId);
  assert.equal(
    (await db.doc(`submissions/${c.invitationId}`).get()).data().status,
    'correction_requested',
  );
  assert.equal(
    (await db.doc(`submissionSlots/${c.invitationId}`).get()).exists,
    true,
  );
});

test('expired invitations, stale authentication, ownership mismatch and attempt exhaustion fail closed', async () => {
  const w = who('google.com', 'contractor-google', 'google@example.net');
  await bad(
    service.context({ ...w, providerId: 'password' }),
    'permission-denied',
  );
  await bad(
    service.context({ ...w, authTime: Math.floor(now / 1000) - 1801 }),
    'unauthenticated',
  );
  const r = db.doc(`allowlist/${emailKey(w.email)}`),
    original = (await r.get()).data().expiresAt;
  await r.update({ expiresAt: Timestamp.fromMillis(now - 1) });
  await bad(service.context(w), 'permission-denied');
  await r.update({ expiresAt: original });
  await service.beginVerification(w);
  const valid = mailbox.get(w.uid).code,
    wrong = valid === '99999999' ? '99999998' : '99999999';
  for (let i = 0; i < 5; i++)
    await bad(service.verify(w, wrong), 'permission-denied');
  await bad(service.verify(w, valid), 'permission-denied');
  await bad(
    service.verify({ ...w, email: 'new@example.org' }, valid),
    'permission-denied',
  );
});
test('MVP Rules deny ciphertext and client writes for anonymous, contractor and admin identities; another database stays closed', async () => {
  for (const identity of [null, who(), admin()]) {
    const app = initializeApp(
      { projectId: 'demo-mi-sin-portal', apiKey: 'demo-only' },
      `rules-boundary-${identity?.uid || 'anonymous'}`,
    );
    const client = initializeFirestore(
      app,
      { localCache: memoryLocalCache() },
      'mi-sin-portal',
    );
    connectFirestoreEmulator(
      client,
      '127.0.0.1',
      8080,
      identity
        ? {
            mockUserToken: {
              sub: identity.uid,
              email: identity.email,
              email_verified: true,
              firebase: { sign_in_provider: identity.providerId },
            },
          }
        : undefined,
    );
    await assert.rejects(
      getDoc(doc(client, 'encryptedRecords', 'any')),
      (e) => e.code === 'permission-denied',
    );
    await assert.rejects(
      setDoc(doc(client, 'roles', 'forged'), {
        active: true,
        sensitiveRetrieval: true,
      }),
      (e) => e.code === 'permission-denied',
    );
    await deleteApp(app);
  }
  const app = initializeApp(
    { projectId: 'demo-mi-sin-portal', apiKey: 'demo-only' },
    'mvp-wrong-database',
  );
  const client = initializeFirestore(
    app,
    { localCache: memoryLocalCache() },
    'existing-app-sentinel',
  );
  connectFirestoreEmulator(client, '127.0.0.1', 8080, {
    mockUserToken: {
      sub: 'mi-admin',
      firebase: { sign_in_provider: 'microsoft.com' },
    },
  });
  await assert.rejects(
    setDoc(doc(client, 'submissions', 'forged'), { status: 'submitted' }),
    (e) => e.code === 'permission-denied',
  );
  await deleteApp(app);
});
test('sensitive retrieval remains blocked and audit fields contain no request payload or provider tokens', async () => {
  await bad(service.sensitive(admin()), 'permission-denied');
  await db.doc('roles/mi-admin').update({ sensitiveRetrieval: true });
  await bad(service.sensitive(admin()), 'failed-precondition');
  const events = await db.collection('auditEvents').get();
  for (const e of events.docs)
    assert.deepEqual(Object.keys(e.data()).sort(), [
      'actorUid',
      'at',
      'event',
      'invitationId',
    ]);
});
function jwt(payload) {
  return `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.`;
}
async function signIdp(providerId, email, sub) {
  const response = await fetch(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=emulator-only',
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
            name: 'Synthetic test identity',
            iss: 'https://accounts.google.com',
            aud: 'emulator-only',
          }),
        }).toString(),
        returnSecureToken: true,
        returnIdpCredential: true,
      }),
    },
  );
  const b = await response.json();
  assert.ok(response.ok, `Emulator identity rejected: ${b.error?.message}`);
  return b.idToken;
}
async function call(name, token, data = {}) {
  const r = await fetch(
    `http://127.0.0.1:5001/demo-mi-sin-portal/northamerica-northeast1/${name}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ data }),
      signal: AbortSignal.timeout(15000),
    },
  );
  return { status: r.status, body: await r.json() };
}
test(
  'actual callable/Auth emulator boundary denies anonymous/unauthorized accounts and authorizes seeded Microsoft staff',
  { skip: !process.env.MVP_HTTP_URL },
  async () => {
    assert.equal((await call('portalContext', null)).status, 401);
    const out = await signIdp(
      'google.com',
      'outsider@example.org',
      'emulator-outsider',
    );
    assert.equal((await call('portalContext', out)).status, 403);
    const staff = await signIdp(
      'microsoft.com',
      'admin@example.com',
      'emulator-mi-member',
    );
    const result = await call('portalContext', staff);
    assert.equal(result.status, 200);
    assert.equal(result.body.result.kind, 'admin');
  },
);
