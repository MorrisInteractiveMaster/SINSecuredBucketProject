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
  assert.equal(
    clientConfiguration(env).appCheckProvider,
    'recaptcha-enterprise',
  );
  assert.equal(
    clientConfiguration(env).appCheckSiteKey,
    env.VITE_APPCHECK_SITE_KEY,
  );
  assert.equal(clientConfiguration({}).mode, 'emulator');
  for (const change of [
    { VITE_PORTAL_MODE: 'cloud' },
    { VITE_PORTAL_MODE: 'production' },
    { VITE_REAL_COLLECTION_ENABLED: 'true' },
    { VITE_FIREBASE_PROJECT_ID: 'other' },
    { VITE_FIREBASE_APP_ID: 'wrong' },
    { VITE_APPCHECK_SITE_KEY: '' },
    { VITE_APPCHECK_SITE_KEY: 'projects/example/keys/' + 'x'.repeat(30) },
    { VITE_APPCHECK_SITE_KEY: 'x'.repeat(257) },
    { VITE_APPCHECK_SITE_KEY: 'not a valid public key' },
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
    appCheckProvider: 'recaptcha-enterprise',
    realCollectionEnabled: false,
    sensitiveRetrievalEnabled: false,
    disposalEnabled: false,
  };
  checkManifest(manifest);
  assert.throws(() =>
    checkManifest({ ...manifest, appCheckProvider: 'recaptcha-v3' }),
  );
  const { appCheckProvider, ...oldManifest } = manifest;
  assert.throws(() => checkManifest(oldManifest));
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

test('Enterprise App Check uses the public site key with CSP coverage and no shared enforcement configuration', () => {
  const client = readFileSync('src/app/firebase.ts', 'utf8');
  assert.match(
    client.replace(/\s+/g, ''),
    /new\s*ReCaptchaEnterpriseProvider\(config.appCheckSiteKey\)/,
  );
  assert.equal(client.includes('ReCaptchaV3Provider'), false);
  const config = json('firebase.mi-sin-portal.cloud-test.json');
  assert.equal(Object.hasOwn(config, 'auth'), false);
  assert.equal(Object.hasOwn(config, 'appCheck'), false);
  const csp = config.hosting.headers
    .flatMap((h) => h.headers)
    .find((h) => h.key === 'Content-Security-Policy').value;
  const directives = Object.fromEntries(
    csp
      .split(';')
      .map((d) => d.trim().split(/\s+/))
      .filter((d) => d[0])
      .map(([name, ...sources]) => [name, sources]),
  );
  for (const url of [
    'https://www.google.com/recaptcha/enterprise.js',
    'https://www.gstatic.com/recaptcha/releases/test/recaptcha__en.js',
  ])
    assert.ok(directives['script-src'].some((s) => url.startsWith(s)));
  for (const directive of ['frame-src', 'connect-src'])
    assert.ok(
      directives[directive].includes('https://www.google.com/recaptcha/'),
    );
  // Firebase Auth popup loads gapi; Enterprise App Check exchanges the attestation.
  // Keep these as exact HTTPS origins; don't widen to *.googleapis.com.
  assert.ok(directives['script-src'].includes('https://apis.google.com'));
  assert.ok(
    directives['connect-src'].includes('https://content-firebaseappcheck.googleapis.com'),
  );
  assert.ok(directives['connect-src'].includes('https://www.googleapis.com'));
  for (const directive of ['script-src', 'connect-src']) {
    assert.equal(directives[directive].includes('*'), false);
    assert.equal(directives[directive].includes('https://*.googleapis.com'), false);
  }
  assert.equal(directives['script-src'].includes("'unsafe-inline'"), false);
  assert.equal(directives['script-src'].includes('*'), false);
  const backend = readFileSync('cloud-functions/index.mjs', 'utf8');
  assert.match(backend, /getAppCheck\(app\)\.verifyToken\(appToken\)/);
  const gate = readFileSync('cloud-functions/cloud/runtime.mjs', 'utf8');
  assert.match(gate, /request.app\?\.appId !== TARGET.appId/);
});

test('metadata transport accepts bounded field/selection arrays but not abusive nesting or typed wrappers', () => {
  assert.equal(
    validEnvelope({
      data: {
        operation: 'portalMetadataOutput',
        payload: {
          fields: ['name', 'email'],
          ids: ['11111111-1111-1111-1111-111111111111'],
        },
      },
    }),
    true,
  );
  assert.equal(
    validEnvelope({ data: { payload: { ids: Array(101).fill('id') } } }),
    false,
  );
  assert.equal(
    validEnvelope({ data: { payload: { ids: [{ '@type': 'unsupported' }] } } }),
    false,
  );
  assert.equal(
    validEnvelope({
      data: { payload: { a: { b: { c: { d: { e: { f: 'too deep' } } } } } } },
    }),
    false,
  );
});
test('Phase 3 preserves isolation, server-only workbook generation and disabled sensitive workflows', () => {
  const client = readFileSync('src/app/firebase.ts', 'utf8');
  assert.match(
    client.replace(/\s+/g, ''),
    /initializeFirestore\(app,\{localCache:memoryLocalCache\(\)\},'mi-sin-portal',?\)/,
  );
  const dashboard = readFileSync('src/ui/Dashboard.tsx', 'utf8');
  assert.equal(dashboard.includes("import('exceljs-community')"), false);
  const ops = readFileSync('functions/lib/admin-operations.mjs', 'utf8');
  assert.match(
    ops.replace(/\s+/g, ''),
    /awaitservice.authorize\(who,data.kind==='copy'\?'metadataCopy':'metadataExport',?\)/,
  );
  assert.equal(ops.includes('.delete('), false);
  assert.match(ops, /outcome:\s*'blocked'/);
  const provision = readFileSync('scripts/phase3-admin.mjs', 'utf8');
  assert.match(provision, /sensitiveRetrieval:\s*false/);
  assert.equal(provision.includes('setCustomUserClaims'), false);
  const rules = readFileSync(
    'firestore.mi-sin-portal.cloud-test.rules',
    'utf8',
  );
  assert.match(rules, /allow read, write: if false/);
});

test('verification mail sends only a mailbox code through the configured HTTPS provider', async () => {
  const { createVerificationMailer, verificationMailConfig } = await import('../cloud-functions/cloud/verification-mail.mjs');
  assert.equal(verificationMailConfig('{}'), undefined);
  const config = verificationMailConfig(JSON.stringify({
    apiKey: 're_fixture_key_only_123', from: 'portal@example.org', hmacKey: 'ab'.repeat(32),
  }));
  const send = createVerificationMailer(() => config, async (url, request) => {
    assert.equal(url, 'https://api.resend.com/emails');
    assert.equal(request.headers['Idempotency-Key'], 'bucket-mailbox/fixture');
    assert.equal(request.redirect, 'error');
    const mail = JSON.parse(request.body);
    assert.deepEqual(mail.to, ['contractor@example.org']);
    assert.match(mail.text, /12345678/);
    assert.doesNotMatch(mail.text, /https?:|invitation|SIN/);
    return { ok: true };
  });
  await send('contractor@example.org', '12345678', 'fixture');
});
