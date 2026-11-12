import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { ref, uploadBytes, getBytes, listAll, deleteObject, updateMetadata } from 'firebase/storage';

if (process.env.GCLOUD_PROJECT !== 'demo-mi-sin-portal' || process.env.FIREBASE_STORAGE_EMULATOR_HOST !== '127.0.0.1:9199')
  throw new Error('Only the demo Storage emulator may run these tests');

test('portal bucket denies direct unauthenticated, contractor and admin Storage access', { timeout: 20000 }, async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-mi-sin-portal', storage: {
    host: '127.0.0.1', port: 9199, rules: readFileSync('storage.mi-secure-bucket.rules', 'utf8'),
  } });
  const bucket = 'gs://gen-lang-client-0948635471-mi-secure-bucket';
  const path = 'quarantine/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222.pdf';
  try {
    await env.withSecurityRulesDisabled(async (ctx) => uploadBytes(ref(ctx.storage(bucket), path), new TextEncoder().encode('%PDF-fictional')));
    for (const ctx of [env.unauthenticatedContext(), env.authenticatedContext('contractor', { email_verified: true }), env.authenticatedContext('admin', { admin: true })]) {
      const storage = ctx.storage(bucket), object = ref(storage, path);
      await assertFails(getBytes(object));
      await assertFails(listAll(ref(storage, 'quarantine')));
      await assertFails(uploadBytes(object, new Uint8Array([1])));
      await assertFails(uploadBytes(ref(storage, path + '-new'), new Uint8Array([1])));
      await assertFails(updateMetadata(object, { customMetadata: { firebaseStorageDownloadTokens: 'forged' } }));
      await assertFails(deleteObject(object));
    }
    const config = JSON.parse(readFileSync('firebase.mi-secure-bucket.storage.json'));
    assert.deepEqual(config, { storage: [{ bucket: bucket.slice(5), rules: 'storage.mi-secure-bucket.rules' }] });
  } finally { await env.cleanup(); }
});
