import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash, generateKeyPairSync, verify } from 'node:crypto';
import { Storage } from '@google-cloud/storage';
import { createRequestFiles, REQUEST_BUCKET } from '../cloud-functions/cloud/request-files.mjs';
import { validRequestTemplate, validRequestValue } from '../functions/lib/request-types.mjs';
const assignmentId = '11111111-1111-1111-1111-111111111111';
const uploadId = '22222222-2222-2222-2222-222222222222';
const kms = 'projects/fictional-keys/locations/northamerica-northeast1/keyRings/files/cryptoKeys/files';
const policy = { filesEnabled: true, fileApprovalReference: assignmentId, storageBucket: REQUEST_BUCKET, filesKmsKey: kms };
function fixture() {
  const original = Buffer.from('%PDF-1.7\nFictional test document.\n%%EOF');
  const state = { metadata: { generation: '123', size: original.length, contentType: 'application/pdf', kmsKeyName: kms + '/cryptoKeyVersions/1' },
    bucket: { location: 'NORTHAMERICA-NORTHEAST1', iamConfiguration: { uniformBucketLevelAccess: { enabled: true }, publicAccessPrevention: 'enforced' },
      encryption: { defaultKmsKeyName: kms } }, verdict: {}, calls: [], failScan: false };
  const files = createRequestFiles({ clock: () => 1000000, scanner: async (data) => {
    if (state.failScan) throw new Error('scanner unavailable');
    return { ...data, clean: true, engine: 'fixture-only', definitionsAt: 1000000, ...state.verdict };
  }, storage: { bucket: (name) => {
    assert.equal(name, REQUEST_BUCKET);
    return { getMetadata: async () => [state.bucket], file: (object, options) => ({
      getMetadata: async () => [state.metadata],
      download: async () => { assert.equal(options.generation, '123'); return [Buffer.from(original)]; },
      getSignedUrl: async (config) => { state.calls.push({ object, options, config }); return ['https://storage.example.org/fixture']; },
      delete: async (config) => { assert.equal(config.ifGenerationMatch, '123'); state.calls.push('deleted'); },
    }) };
  } } });
  return { files, state, size: original.length };
}
test('file adapter binds upload size, create-only generation, private Canadian CMEK and short delivery', async () => {
  const { files, state, size } = fixture();
  files.validate({ name: 'fictional.pdf', size, mime: 'application/pdf' }, 1000);
  await files.upload(assignmentId, uploadId, size, policy, 1300000);
  assert.deepEqual(state.calls[0].config.extensionHeaders, { 'x-goog-if-generation-match': '0', 'content-length': String(size) });
  const file = await files.inspect(assignmentId, uploadId, size, policy, 1300000);
  assert.equal(file.clean, true);
  await files.deliver(file, 'preview', policy, assignmentId);
  await files.deliver(file, 'download', policy, assignmentId);
  assert.equal(state.calls[1].options.generation, '123');
  assert.match(state.calls[1].config.responseDisposition, /^inline/);
  assert.match(state.calls[2].config.responseDisposition, /^attachment/);
  assert.equal(state.calls[2].config.expires, 1060000);
  assert.equal(state.calls.includes('deleted'), false);
  await files.delete(file, policy, assignmentId);
  assert.equal(state.calls.at(-1), 'deleted');
});
test('unscanned, infected, stale, mismatched or unavailable files cannot be delivered', async () => {
  for (const verdict of [{ clean: false }, { generation: '124' }, { sha256: 'bad' }, { definitionsAt: -86400001 }]) {
    const { files, state, size } = fixture(); state.verdict = verdict;
    await assert.rejects(files.inspect(assignmentId, uploadId, size, policy, 1300000));
  }
  const { files, state, size } = fixture();
  state.failScan = true;
  await assert.rejects(files.inspect(assignmentId, uploadId, size, policy, 1300000));
  await assert.rejects(files.deliver({ object: 'quarantine/x', generation: '123' }, 'preview', policy, assignmentId));
  await assert.rejects(files.upload(assignmentId, uploadId, size, { ...policy, filesEnabled: false }, 1300000));
  await assert.rejects(files.upload(assignmentId, uploadId, size, { ...policy, storageBucket: 'unrelated-app' }, 1300000));
  state.bucket.iamConfiguration.publicAccessPrevention = 'inherited';
  await assert.rejects(files.upload(assignmentId, uploadId, size, policy, 1300000));
});
test('unsafe names, wrong MIME, oversize objects and false content metadata are rejected', async () => {
  const { files, state, size } = fixture();
  for (const name of ['../contract.pdf', 'path\\contract.pdf', 'document.docx', 'document\n.pdf', 'document.pdf\n'])
    assert.throws(() => files.validate({ name, size, mime: 'application/pdf' }, 1000));
  assert.throws(() => files.validate({ name: 'fictional.pdf', size: 1001, mime: 'application/pdf' }, 1000));
  assert.throws(() => files.validate({ name: 'fictional.pdf', size, mime: 'text/html' }, 1000));
  state.metadata.size = size + 1;
  await assert.rejects(files.inspect(assignmentId, uploadId, size, policy, 1300000));
});
test('request snapshots validate phone and text without changing SIN rules', () => {
  assert.equal(validRequestTemplate({ type: 'phone', label: 'Phone', instructions: '', status: 'active', maxLength: 32 }), true);
  assert.equal(validRequestValue('+1 (306) 555-0100', { type: 'phone', maxLength: 32 }), true);
  assert.equal(validRequestValue('12345', { type: 'phone', maxLength: 32 }), false);
  assert.equal(validRequestValue('unbounded', { type: 'text', maxLength: 3 }), false);
  assert.equal(validRequestTemplate({ type: 'docx', label: 'Word', instructions: '', status: 'active', maxLength: 100 }), false);
});

test('legacy migration preserves consumed records and reruns without duplicate assignments', async () => {
  const { migratePendingRequests } = await import('../scripts/requests-operator.mjs');
  const { Timestamp } = await import('firebase-admin/firestore');
  const values = new Map([
    ['allowlist/first', { invitationId: assignmentId, email: 'fictional@example.org', status: 'active', expiresAt: Timestamp.fromMillis(2000000) }],
    ['allowlist/second', { invitationId: uploadId, email: 'another@example.org', status: 'active', expiresAt: Timestamp.fromMillis(2000000) }],
    ['submissions/' + uploadId, { status: 'submitted', retrievalStatus: 'retrieved' }],
  ]);
  let nextId = 0;
  const document = (path) => ({ id: path.split('/').at(-1), path, get: async () => ({ exists: values.has(path), data: () => values.get(path) }) });
  const db = {
    doc: document,
    collection: (path) => ({ doc: () => document(path + '/' + ++nextId), limit: () => ({ get: async () => {
      const docs = [...values.keys()].filter((key) => key.startsWith(path + '/')).map((key) => ({ ...document(key), ref: document(key), data: () => values.get(key) }));
      return { docs, size: docs.length };
    } }) }),
    runTransaction: async (operation) => operation({ get: (ref) => ref.get(), getAll: (...refs) => Promise.all(refs.map((ref) => ref.get())),
      create: (ref, value) => { assert.equal(values.has(ref.path), false); values.set(ref.path, value); } }),
  };
  assert.equal((await migratePendingRequests(db, false, () => 1000000)).pending, 1);
  assert.equal([...values.keys()].filter((key) => key.includes('/assignments/')).length, 0);
  assert.equal((await migratePendingRequests(db, true, () => 1000000)).created, 1);
  values.set('policy/bucket-field', { label: 'Changed globally', type: 'text', revision: 'new' });
  assert.equal((await migratePendingRequests(db, true, () => 1000000)).created, 0);
  assert.equal(values.get('submissions/' + uploadId).retrievalStatus, 'retrieved');
});


test('expired or extended grants, malformed limits and cross-assignment file pointers fail closed', async () => {
  const { files, state, size } = fixture();
  for (const deadline of [undefined, NaN, 1000000, 1300001])
    await assert.rejects(files.upload(assignmentId, uploadId, size, policy, deadline));
  for (const limit of [undefined, NaN, '1000', -1, 10 * 1024 * 1024 + 1])
    assert.throws(() => files.validate({ name: 'fictional.pdf', size, mime: 'application/pdf' }, limit));
  assert.throws(() => files.validate({ name: 'x'.repeat(100) + '.pdf', size, mime: 'application/pdf' }, 1000));
  await assert.rejects(files.upload(assignmentId, uploadId, 10 * 1024 * 1024 + 1, policy, 1300000));
  const file = await files.inspect(assignmentId, uploadId, size, policy, 1300000);
  await assert.rejects(files.deliver(file, 'preview', policy, uploadId));
  await assert.rejects(files.delete(file, policy, uploadId));
  assert.equal(state.calls.length, 0);
});

test('real GCS V4 signatures bind exact path, length, expiry and create-only precondition', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const storage = new Storage({ projectId: 'fictional-keys', credentials: {
    client_email: 'fixture@fictional-keys.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  } });
  const bucket = storage.bucket(REQUEST_BUCKET), fixtureBucket = fixture().state.bucket;
  bucket.getMetadata = async () => [fixtureBucket];
  const now = Date.now(), expiry = now + 290000, size = 50;
  const files = createRequestFiles({ storage: { bucket: () => bucket }, clock: () => now, scanner: async () => {} });
  const grant = await files.upload(assignmentId, uploadId, size, policy, expiry);
  const url = new URL(grant.url), query = new URLSearchParams(url.search);
  const signature = query.get('X-Goog-Signature'); query.delete('X-Goog-Signature');
  const encode = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  const canonicalQuery = [...query].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => encode(k) + '=' + encode(v)).join('&');
  const signedHeaders = 'content-length;content-type;host;x-goog-if-generation-match';
  assert.equal(query.get('X-Goog-SignedHeaders'), signedHeaders);
  assert.equal(grant.expiresAt, expiry);
  assert.ok(Number(query.get('X-Goog-Expires')) <= 290);
  function valid(path, length = size, generation = '0', canonical = canonicalQuery) {
    const headers = `content-length:${length}\ncontent-type:application/pdf\nhost:${url.host}\nx-goog-if-generation-match:${generation}\n`;
    const request = ['PUT', path, canonical, headers, signedHeaders, 'UNSIGNED-PAYLOAD'].join('\n');
    const scope = query.get('X-Goog-Credential').split('/').slice(1).join('/');
    const message = ['GOOG4-RSA-SHA256', query.get('X-Goog-Date'), scope, createHash('sha256').update(request).digest('hex')].join('\n');
    return verify('RSA-SHA256', Buffer.from(message), publicKey, Buffer.from(signature, 'hex'));
  }
  assert.equal(valid(url.pathname), true);
  assert.equal(valid(url.pathname.replace(assignmentId, uploadId)), false);
  assert.equal(valid(url.pathname, size + 1), false);
  assert.equal(valid(url.pathname, size, '123'), false, 'cannot remove the create-only precondition to overwrite');
  assert.equal(valid(url.pathname, size, '0', canonicalQuery.replace(/X-Goog-Expires=[0-9]+/, 'X-Goog-Expires=9999')), false);
  // Actual GCS 403-after-expiry and 412-on-overwrite remain release smoke tests.
});

test('private scanner retries only transient failures within the existing lease and verifies bounded responses', async () => {
  const { privateScanner } = await import('../cloud-functions/cloud/request-files.mjs');
  let now = 1000000, calls = 0, mode = 'transient';
  const fetcher = async (url, config) => {
    if (url.startsWith('http://metadata.google.internal/')) return new Response('fictional-token');
    calls++;
    assert.equal(config.headers['X-MI-Scan-Deadline'], '1100000');
    assert.equal(config.headers['X-Serverless-Authorization'], config.headers.Authorization);
    assert.equal(config.redirect, 'error');
    if (mode === 'transient' && calls === 1) return new Response('', { status: 503 });
    if (mode === 'denied') return new Response('', { status: 403 });
    if (mode === 'timeout') { now += 60001; throw new Error('network'); }
    if (mode === 'oversize') return new Response('x'.repeat(4097));
    return new Response(JSON.stringify({ clean: true }));
  };
  const scanner = privateScanner(fetcher, { clock: () => now, sleep: async (ms) => { now += ms; } });
  const p = { scannerUrl: 'https://mi-scanner-fictional-nn.a.run.app' };
  assert.deepEqual(await scanner({}, p, { deadline: 1100000 }), { clean: true });
  assert.equal(calls, 2);
  for (const failure of ['denied', 'timeout', 'oversize']) {
    now = 1000000; calls = 0; mode = failure;
    await assert.rejects(scanner({}, p, { deadline: 1100000 }));
    assert.equal(calls, 1);
  }
  calls = 0;
  await assert.rejects(scanner({}, p, { deadline: now }));
  await assert.rejects(scanner({}, { scannerUrl: 'http://unrelated.example.org' }, { deadline: 1100000 }));
  assert.equal(calls, 0);
});

test('scanner HTTPS ingress requires IAM, one exact invoker and no portal VPC configuration', async () => {
  const { readFileSync } = await import('node:fs');
  const template = readFileSync('scanner/run-service.template.yaml', 'utf8');
  assert.match(template, /run\.googleapis\.com\/ingress: all/);
  assert.match(template, /run\.googleapis\.com\/invoker-iam-disabled: 'false'/);
  assert.doesNotMatch(template, /vpc-access|network-interfaces|connector/);
  assert.deepEqual(JSON.parse(readFileSync('scanner/invoker-policy.json')), {
    version: 1, bindings: [{ role: 'roles/run.invoker', members: ['serviceAccount:mi-sin-cloud-test@gen-lang-client-0948635471.iam.gserviceaccount.com'] }],
  });
  const endpoint = readFileSync('cloud-functions/index.mjs', 'utf8');
  assert.match(endpoint, /networkInterface: RESET_VALUE/);
  assert.match(endpoint, /timeoutSeconds: 90/);
  assert.doesNotMatch(endpoint, /vpcConnector|vpcEgress|scannerNetworkOptions/);
});
