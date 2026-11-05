import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  validEnvelope,
  createTransportHandler,
} from '../cloud-functions/cloud/transport.mjs';
import { clientConfiguration } from '../src/app/release-config.mjs';
import {
  TARGET,
  assertRelease,
  assertTestIdentity,
  submissionFixture,
} from '../cloud-functions/cloud/gates.mjs';
import { assertDatabase } from '../scripts/preflight-cloud-test.mjs';
import { checkScope, checkManifest } from '../scripts/check-cloud-release.mjs';
const json = (p) =>
  JSON.parse(readFileSync(new URL('../' + p, import.meta.url)));
const env = {
  VITE_PORTAL_MODE: 'cloud-test',
  VITE_REAL_COLLECTION_ENABLED: 'false',
  VITE_FIREBASE_PROJECT_ID: TARGET.projectId,
  VITE_FIREBASE_APP_ID: TARGET.appId,
  VITE_FIREBASE_AUTH_DOMAIN: 'gen-lang-client-0948635471.firebaseapp.com',
  VITE_FIREBASE_API_KEY: 'AIza' + 'a'.repeat(35),
  VITE_APPCHECK_SITE_KEY: '6' + 'b'.repeat(30),
  VITE_MI_TENANT_ID: '11111111-1111-1111-1111-111111111111',
};
const policy = () => ({
  ...TARGET,
  enabled: true,
  financialReviewApproved: true,
  isolationReviewApproved: true,
  realCollectionEnabled: false,
  sensitiveRetrievalEnabled: false,
  disposalEnabled: false,
  adminUid: 'approved-admin',
  tenantId: env.VITE_MI_TENANT_ID,
  microsoftClientId: env.VITE_MI_TENANT_ID,
  expiresAt: { toMillis: () => Date.now() + 60000 },
});
test('cloud client requires exact registered app, explicit test mode and complete public configuration', () => {
  assert.equal(clientConfiguration(env).firebase.appId, TARGET.appId);
  assert.equal(clientConfiguration({}).mode, 'emulator');
  for (const change of [
    { VITE_PORTAL_MODE: 'cloud' },
    { VITE_PORTAL_MODE: 'production' },
    { VITE_REAL_COLLECTION_ENABLED: 'true' },
    { VITE_FIREBASE_PROJECT_ID: 'other' },
    { VITE_FIREBASE_APP_ID: 'wrong' },
    { VITE_APPCHECK_SITE_KEY: '' },
    { VITE_FIREBASE_API_KEY: 'placeholder' },
    { VITE_MI_TENANT_ID: '' },
  ])
    assert.throws(() => clientConfiguration({ ...env, ...change }));
});
test('backend release gate fails closed for missing approval, expiry, wrong project/database and any real-data mode', () => {
  assertRelease(policy(), TARGET.projectId);
  for (const change of [
    { enabled: false },
    { financialReviewApproved: false },
    { isolationReviewApproved: false },
    { databaseId: '(default)' },
    { projectId: 'other' },
    { realCollectionEnabled: true },
    { sensitiveRetrievalEnabled: true },
    { disposalEnabled: true },
    { mode: 'production' },
    { expiresAt: { toMillis: () => 0 } },
    { expiresAt: { toMillis: () => Date.now() + 25 * 3600000 } },
  ])
    assert.throws(() =>
      assertRelease({ ...policy(), ...change }, TARGET.projectId),
    );
  assert.throws(() => assertRelease(policy(), 'other'));
  assert.throws(() => assertRelease(policy(), 'demo-mi-sin-portal'));
});
test('cloud submit accepts fixture IDs only, never SIN or attacker ciphertext including alongside a valid fixture', () => {
  const good = {
    fixtureId: 'fixture-a',
    invitationId: '11111111-1111-1111-1111-111111111111',
    revision: 1,
  };
  assert.equal(submissionFixture(good), '000000018');
  for (const change of [
    { fixtureId: '000000034' },
    { fixtureId: '__proto__' },
    { sin: '000000034' },
    { syntheticValue: '000000018' },
    { ciphertext: 'arbitrary-hidden-data' },
    { keyId: 'own-key' },
    { revision: 0 },
    { invitationId: 'other' },
  ])
    assert.throws(() => submissionFixture({ ...good, ...change }));
});
test('dedicated test UID must match independently attested email and exact provider identity', () => {
  const who = {
      email: 'test@example.com',
      providerId: 'google.com',
      providerUid: 'provider-test',
    },
    record = {
      active: true,
      ownershipVerified: true,
      purpose: 'dedicated-synthetic-test',
      email: who.email,
      providerIds: ['google.com'],
      providerUids: { 'google.com': 'provider-test' },
    };
  assertTestIdentity(record, who);
  for (const change of [
    { active: false },
    { ownershipVerified: false },
    { purpose: 'contractor' },
    { email: 'wrong@example.com' },
    { providerIds: ['microsoft.com'] },
    { providerUids: { 'google.com': 'wrong' } },
  ])
    assert.throws(() => assertTestIdentity({ ...record, ...change }, who));
});
test('cloud manifest targets one named database, separate Hosting and one Node 22 codebase', () => {
  const cfg = json('firebase.mi-sin-portal.cloud-test.json'),
    bindings = {
      targets: {
        [TARGET.projectId]: { hosting: { 'mi-sin-portal': ['mi-sin-portal'] } },
      },
    };
  checkScope(cfg, bindings);
  for (const mutate of [
    (c) => (c.firestore[0].database = '(default)'),
    (c) => (c.firestore[0].rules = 'firestore.mi-sin-portal.mvp.rules'),
    (c) => (c.functions[0].source = 'functions'),
    (c) => (c.functions[0].runtime = 'nodejs24'),
    (c) => (c.auth = {}),
    (c) => (c.hosting.target = 'default'),
    (c) => (c.hosting.public = 'dist'),
  ]) {
    const c = structuredClone(cfg);
    mutate(c);
    assert.throws(() => checkScope(c, bindings));
  }
  const wrong = structuredClone(bindings);
  wrong.targets[TARGET.projectId].hosting['mi-sin-portal'] = ['existing-site'];
  assert.throws(() => checkScope(cfg, wrong));
  const manifest = {
    mode: TARGET.mode,
    projectId: TARGET.projectId,
    appId: TARGET.appId,
    databaseId: TARGET.databaseId,
    siteId: TARGET.siteId,
    realCollectionEnabled: false,
    sensitiveRetrievalEnabled: false,
    disposalEnabled: false,
  };
  checkManifest(manifest);
  assert.throws(() =>
    checkManifest({ ...manifest, realCollectionEnabled: true }),
  );
});
test('cloud runtime exposes one bounded App Check callable and cannot deploy local mailbox/SMTP or default service account', () => {
  const entry = readFileSync(
    new URL('../cloud-functions/index.mjs', import.meta.url),
    'utf8',
  );
  assert.equal((entry.match(/export const /g) || []).length, 1);
  assert.match(entry, /getAppCheck\(app\)\.verifyToken\(appToken\)/);
  assert.match(entry, /mi-sin-cloud-test@/);
  assert.match(entry, /maxInstances:\s*1/);
  assert.match(entry, /minInstances:\s*0/);
  for (const forbidden of [
    'portalTestMailbox',
    'nodemailer',
    'CLOUD_MVP_ENABLED = true',
    'roles/editor',
    'console.log(request',
  ])
    assert.equal(entry.includes(forbidden), false);
});

test('read-only preflight rejects missing, default, Enterprise, non-Native and unreviewed locations', () => {
  const good = {
    name: `projects/${TARGET.projectId}/databases/mi-sin-portal`,
    type: 'FIRESTORE_NATIVE',
    databaseEdition: 'STANDARD',
    locationId: 'northamerica-northeast1',
  };
  assertDatabase(good);
  for (const change of [
    { name: `projects/${TARGET.projectId}/databases/(default)` },
    { databaseEdition: 'ENTERPRISE' },
    { type: 'DATASTORE_MODE' },
    { locationId: 'us-central1' },
    { locationId: 'northamerica-northeast2' },
  ])
    assert.throws(() => assertDatabase({ ...good, ...change }));
  assert.throws(() => assertDatabase(undefined));
});

test('deploy staging includes only the one cloud handler and locked runtime, never the emulator index', () => {
  execFileSync(process.execPath, ['scripts/prepare-cloud.mjs']);
  assert.deepEqual(readdirSync('.deploy/functions').sort(), [
    'cloud',
    'index.mjs',
    'lib',
    'package-lock.json',
    'package.json',
  ]);
  const entry = readFileSync('.deploy/functions/index.mjs', 'utf8');
  assert.match(entry, /export const miSinSynthetic/);
  assert.equal(entry.includes('portalTestMailbox'), false);
  assert.equal(entry.includes('../functions/'), false);
  const runtime = readFileSync('.deploy/functions/cloud/runtime.mjs', 'utf8');
  assert.equal(runtime.includes('../../functions/'), false);
  assert.equal(runtime.includes('nodemailer'), false);
  const pkg = JSON.parse(readFileSync('.deploy/functions/package.json'));
  assert.equal(pkg.engines.node, '22');
  assert.equal(pkg.dependencies.nodemailer, undefined);
});

test('transport rejects body pollution and typed decoder payloads before any request logging SDK decoder', () => {
  assert.equal(
    validEnvelope({ data: { operation: 'portalContext', payload: {} } }),
    true,
  );
  for (const data of [
    { other: '000000034' },
    { data: { payload: { '@type': 'unsupported', value: '000000034' } } },
    { data: { operation: 'portalContext' }, extra: '000000034' },
    { data: [] },
    { data: { payload: 'x'.repeat(80001) } },
  ])
    assert.equal(validEnvelope(data), false);
  const entry = readFileSync('cloud-functions/index.mjs', 'utf8');
  assert.equal(entry.includes('onCall('), false);
  const transport = readFileSync('cloud-functions/cloud/transport.mjs', 'utf8');
  assert.ok(
    transport.indexOf('validEnvelope(req.body)') <
      transport.indexOf('await verifyAppToken'),
  );
});

test('cloud HTTP protocol verifies App Check, returns SDK-compatible results and never copies hostile SDK errors', async () => {
  const response = () => ({
    headers: {},
    statusCode: 0,
    body: null,
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(s) {
      this.statusCode = s;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
  });
  const req = (body, token) => ({
    method: 'POST',
    body,
    is: () => true,
    get: () => token,
    headers: {},
  });
  let calls = 0;
  const handler = createTransportHandler({
    verifyAppToken: async (token) => {
      calls++;
      if (token === 'bad') throw Error('000000034');
      return { appId: TARGET.appId };
    },
    dispatch: async (r) => ({ approved: r.app.appId === TARGET.appId }),
  });
  let res = response();
  await handler(req({ wrong: '000000034' }, 'valid'), res);
  assert.equal(calls, 0);
  assert.equal(res.statusCode, 400);
  assert.equal(JSON.stringify(res.body).includes('000000034'), false);
  res = response();
  await handler(req({ data: { operation: 'portalContext' } }, undefined), res);
  assert.equal(calls, 0);
  assert.equal(res.statusCode, 401);
  res = response();
  await handler(req({ data: { operation: 'portalContext' } }, 'bad'), res);
  assert.equal(res.statusCode, 403);
  assert.equal(JSON.stringify(res.body).includes('000000034'), false);
  res = response();
  await handler(req({ data: { operation: 'portalContext' } }, 'valid'), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { result: { approved: true } });
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

test('Firebase httpsCallable client interoperates with the cloud JSON success and safe error protocol', async () => {
  const { createServer } = await import('node:http');
  const { initializeApp, deleteApp } = await import('firebase/app');
  const { getFunctions, connectFunctionsEmulator, httpsCallable } =
    await import('firebase/functions');
  const { PortalError } = await import('../functions/lib/security.mjs');
  const handler = createTransportHandler({
    verifyAppToken: async () => ({ appId: TARGET.appId }),
    dispatch: async (r) => {
      if (r.data.operation === 'blocked')
        throw new PortalError('permission-denied', 'Access denied.');
      return { synthetic: true };
    },
  });
  const server = createServer(async (req, res) => {
    let text = '';
    for await (const part of req) text += part;
    req.body = JSON.parse(text);
    req.is = () => true;
    req.get = () => 'test-attestation';
    res.status = (s) => {
      res.statusCode = s;
      return res;
    };
    res.json = (b) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(b));
      return res;
    };
    await handler(req, res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const app = initializeApp(
    { projectId: 'demo-mi-sin-portal', apiKey: 'demo-only' },
    'cloud-protocol-interop',
  );
  try {
    const fn = getFunctions(app, 'northamerica-northeast1');
    connectFunctionsEmulator(fn, '127.0.0.1', server.address().port);
    assert.deepEqual(
      (
        await httpsCallable(
          fn,
          'miSinSynthetic',
        )({ operation: 'portalContext', payload: {} })
      ).data,
      { synthetic: true },
    );
    await assert.rejects(
      httpsCallable(fn, 'miSinSynthetic')({ operation: 'blocked' }),
      (error) => error.code === 'functions/permission-denied',
    );
  } finally {
    await deleteApp(app);
    await new Promise((resolve) => server.close(resolve));
  }
});
