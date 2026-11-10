import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
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
  await files.upload(assignmentId, uploadId, size, policy);
  assert.deepEqual(state.calls[0].config.extensionHeaders, { 'x-goog-if-generation-match': '0', 'content-length': String(size) });
  const file = await files.inspect(assignmentId, uploadId, size, policy);
  assert.equal(file.clean, true);
  await files.deliver(file, 'preview', policy);
  await files.deliver(file, 'download', policy);
  assert.equal(state.calls[1].options.generation, '123');
  assert.match(state.calls[1].config.responseDisposition, /^inline/);
  assert.match(state.calls[2].config.responseDisposition, /^attachment/);
  assert.equal(state.calls[2].config.expires, 1060000);
  assert.equal(state.calls.includes('deleted'), false);
  await files.delete(file, policy);
  assert.equal(state.calls.at(-1), 'deleted');
});
test('unscanned, infected, stale, mismatched or unavailable files cannot be delivered', async () => {
  for (const verdict of [{ clean: false }, { generation: '124' }, { sha256: 'bad' }, { definitionsAt: -86400001 }]) {
    const { files, state, size } = fixture(); state.verdict = verdict;
    await assert.rejects(files.inspect(assignmentId, uploadId, size, policy));
  }
  const { files, state, size } = fixture();
  state.failScan = true;
  await assert.rejects(files.inspect(assignmentId, uploadId, size, policy));
  await assert.rejects(files.deliver({ object: 'quarantine/x', generation: '123' }, 'preview', policy));
  await assert.rejects(files.upload(assignmentId, uploadId, size, { ...policy, filesEnabled: false }));
  await assert.rejects(files.upload(assignmentId, uploadId, size, { ...policy, storageBucket: 'unrelated-app' }));
  state.bucket.iamConfiguration.publicAccessPrevention = 'inherited';
  await assert.rejects(files.upload(assignmentId, uploadId, size, policy));
});
test('unsafe names, wrong MIME, oversize objects and false content metadata are rejected', async () => {
  const { files, state, size } = fixture();
  for (const name of ['../contract.pdf', 'path\\contract.pdf', 'document.docx', 'document\n.pdf', 'document.pdf\n'])
    assert.throws(() => files.validate({ name, size, mime: 'application/pdf' }, 1000));
  assert.throws(() => files.validate({ name: 'fictional.pdf', size: 1001, mime: 'application/pdf' }, 1000));
  assert.throws(() => files.validate({ name: 'fictional.pdf', size, mime: 'text/html' }, 1000));
  state.metadata.size = size + 1;
  await assert.rejects(files.inspect(assignmentId, uploadId, size, policy));
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
