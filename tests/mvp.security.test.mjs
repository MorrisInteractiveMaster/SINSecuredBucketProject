import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAllowlistCsv, normalizeEmail } from '../functions/lib/csv.mjs';
import {
  trustsEmail,
  normalizeSin,
  assertSynthetic,
  challengeHash,
  sameDigest,
} from '../functions/lib/security.mjs';
import { readFileSync } from 'node:fs';
test('CSV handles BOM, quoted commas and escapes, canonical duplicates and bounded values', () => {
  assert.deepEqual(
    parseAllowlistCsv(
      '\uFEFFname,email,status\r\n"Doe, \"\"Alex\"\"", ALEX@example.com ,active\r\n',
    ),
    [{ name: 'Doe, "Alex"', email: 'alex@example.com', status: 'active' }],
  );
  for (const text of [
    'email,name,status\nx,y,z',
    'name,email,status\na,a@example.com,active\nb,A@example.com,active',
    'name,email,status\na,a@example.com,admin',
    'name,email,status\n"bad,a@example.com,active',
    'x'.repeat(65537),
  ])
    assert.throws(() => parseAllowlistCsv(text));
  assert.equal(
    normalizeEmail('person+work@example.com'),
    'person+work@example.com',
  );
});
test('only trusted signed provider/email ownership assertions bypass supplementary verification', () => {
  assert.equal(trustsEmail('google.com', 'test@gmail.com', true), true);
  assert.equal(trustsEmail('microsoft.com', 'test@hotmail.com', true), true);
  for (const [p, e, v] of [
    ['google.com', 'test@example.com', true],
    ['microsoft.com', 'test@example.com', true],
    ['google.com', 'test@gmail.com', false],
    ['password', 'test@gmail.com', true],
  ])
    assert.equal(trustsEmail(p, e, v), false);
});
test('SIN normalization/checksum and local fixture guard reject arbitrary real input', () => {
  assert.equal(normalizeSin('000-000 018'), '000000018');
  assert.equal(assertSynthetic('000000026'), '000000026');
  for (const v of [
    '000000000',
    '000000019',
    '１２３４５６７８９',
    'one',
    '000000018extra',
  ])
    assert.throws(() => normalizeSin(v));
  assert.throws(() => assertSynthetic('123456782'));
});
test('code digest is bound to UID, provider and nonce; no reversible code storage', () => {
  const h = challengeHash(
    'synthetic-pepper',
    'uid',
    'microsoft.com',
    'nonce',
    '00000001',
  );
  assert.equal(h.length, 64);
  assert.equal(
    sameDigest(
      h,
      challengeHash(
        'synthetic-pepper',
        'uid',
        'google.com',
        'nonce',
        '00000001',
      ),
    ),
    false,
  );
  assert.equal(sameDigest(h, h), true);
});
test('no account auto-link, password auth or default database path in Phase 2 client', () => {
  const c = readFileSync(
    new URL('../src/app/firebase.ts', import.meta.url),
    'utf8',
  );
  assert.ok(c.includes("new OAuthProvider('microsoft.com')"));
  assert.ok(c.includes('new GoogleAuthProvider()'));
  assert.match(
    c,
    /initializeFirestore\([\s\S]*?memoryLocalCache\(\)[\s\S]*?'mi-sin-portal'/,
  );
  for (const unsafe of [
    'linkWithCredential',
    'createUserWithEmailAndPassword',
    'signInWithEmailAndPassword',
    'localStorage',
    'sessionStorage',
  ])
    assert.equal(c.includes(unsafe), false, unsafe);
  const server = readFileSync(
    new URL('../functions/index.mjs', import.meta.url),
    'utf8',
  );
  assert.match(server, /CLOUD_MVP_ENABLED\s*=\s*false/);
  assert.match(server, /verifyIdToken\(header.slice\(7\),\s*true\)/);
});

test('browser encryption uses randomized RSA-OAEP and binds the invitation in encrypted content', async () => {
  const { encryptSin } = await import('../src/app/encryption.ts');
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 4096,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt'],
  );
  const context = {
    invitationId: 'synthetic-invitation',
    reference: 'synthetic-reference',
    keyId: 'ephemeral-test-key',
    publicKey: await crypto.subtle.exportKey('jwk', pair.publicKey),
  };
  const ciphertext = await encryptSin('000-000 018', context);
  assert.notEqual(ciphertext, await encryptSin('000000018', context));
  const decrypted = await crypto.subtle.decrypt(
    { name: 'RSA-OAEP', label: new TextEncoder().encode('MI-SIN-PORTAL:v1') },
    pair.privateKey,
    Buffer.from(ciphertext, 'base64'),
  );
  assert.deepEqual(JSON.parse(new TextDecoder().decode(decrypted)), {
    v: 1,
    invitationId: context.invitationId,
    reference: context.reference,
    keyId: context.keyId,
    sin: '000000018',
  });
  await assert.rejects(
    crypto.subtle.decrypt(
      {
        name: 'RSA-OAEP',
        label: new TextEncoder().encode('incorrect-context'),
      },
      pair.privateKey,
      Buffer.from(ciphertext, 'base64'),
    ),
  );
  await assert.rejects(encryptSin('123456782', context));
});
