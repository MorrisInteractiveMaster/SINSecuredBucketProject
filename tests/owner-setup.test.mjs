import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { createSetup } from '../cloud-functions/cloud/setup.mjs';
import { getPortalIdentity } from '../cloud-functions/cloud/identity.mjs';
import { TARGET } from '../cloud-functions/cloud/gates.mjs';
import { emailKey } from '../functions/lib/security.mjs';

const tenantId = '11111111-1111-1111-1111-111111111111';
const clientId = '22222222-2222-2222-2222-222222222222';
const code = '3'.repeat(64);
const now = Date.parse('2026-11-09T12:00:00Z');
const owner = {
  email: 'owner@example.org', uid: 'owner-test', providerId: 'microsoft.com',
  providerUid: '33333333-3333-3333-3333-333333333333', microsoftMailboxMatched: true,
  authTime: now / 1000,
};
const staff = {
  ...owner, email: 'staff@example.org', uid: 'staff-test',
  providerUid: '44444444-4444-4444-4444-444444444444',
};
function fixture() {
  const rows = new Map();
  let sequence = 0;
  let queue = Promise.resolve();
  const db = {
    doc(path) { return { path, get: async () => snapshot(path) }; },
    collection(path) { return { doc: () => db.doc(path + '/' + ++sequence) }; },
    runTransaction(callback) {
      const attempt = queue.then(async () => {
        const changes = new Map();
        const result = await callback({
          get: (ref) => ref.get(),
          getAll: (...refs) => Promise.all(refs.map((ref) => ref.get())),
          create(ref, value) {
            assert.equal(rows.has(ref.path), false, 'create must be unique');
            changes.set(ref.path, value);
          },
          update(ref, value) {
            assert.equal(rows.has(ref.path), true, 'update requires a record');
            changes.set(ref.path, { ...rows.get(ref.path), ...value });
          },
        });
        changes.forEach((value, path) => rows.set(path, value));
        return result;
      });
      queue = attempt.catch(() => {});
      return attempt;
    },
  };
  function snapshot(path) {
    return { exists: rows.has(path), data: () => rows.has(path) ? { ...rows.get(path) } : undefined };
  }
  const setup = createSetup({
    roster: [owner.email, staff.email, 'staff2@example.org', 'staff3@example.org']
      .map((email, index) => ({ key: emailKey(email), label: 'Fixture ' + index })),
    ownerKey: emailKey(owner.email),
    db, projectId: TARGET.projectId, clock: () => now,
    config: {
      tenantId, clientId, digest: createHash('sha256').update(code).digest('hex'),
      expiresAt: new Date(now + 10000).toISOString(),
    },
    verifyMicrosoft: async (token, { providerUid }) => ({
      member: token !== 'guest', tenantId, objectId: providerUid, accountEmail: token,
    }),
  });
  return { setup, rows };
}
test('owner setup rejects missing trusted proof, wrong account and incorrect code', async () => {
  const { setup, rows } = fixture();
  await assert.rejects(setup.activate(owner, owner.email, { code: '4'.repeat(64) }));
  await assert.rejects(setup.activate(staff, staff.email, { code }));
  await assert.rejects(setup.activate(owner, 'guest', { code }));
  await assert.rejects(setup.activate(owner, staff.email, { code }));
  await assert.rejects(setup.activate({ ...owner, providerId: 'google.com' }, owner.email, { code }));
  assert.equal(rows.has('policy/bootstrap'), false);
  assert.equal(rows.has('roles/' + owner.uid), false);
});
test('activation is atomic, single-use and starts with the synthetic window closed', { timeout: 20000 }, async () => {
  const { setup, rows } = fixture();
  const attempts = await Promise.allSettled([1, 2].map(() => setup.activate(owner, owner.email, { code })));
  assert.equal(attempts.filter((attempt) => attempt.status === 'fulfilled').length, 1);
  assert.equal(rows.get('policy/cloud-test').enabled, false);
  assert.equal(rows.get('policy/cloud-test').realCollectionEnabled, false);
  assert.equal(rows.get('roles/' + owner.uid).sensitiveRetrieval, false);
  assert.equal([...rows.keys()].filter((path) => path.startsWith('approvedAdministrators/')).length, 4);
  assert.equal(JSON.stringify([...rows]).includes(code), false);

  await assert.rejects(setup.window(staff, staff.email, { action: 'open', confirmed: true }));
  await assert.rejects(setup.window(owner, owner.email, { action: 'open' }));
  await setup.window(owner, owner.email, { action: 'open', confirmed: true });
  await setup.enroll(staff, staff.email, rows.get('policy/cloud-test'));
  await assert.rejects(setup.enroll({ ...staff, uid: 'replacement' }, staff.email, rows.get('policy/cloud-test')));
  const service = { authorizeTx: async (_tx, actor, permission) => {
    if (actor.uid !== owner.uid || permission !== 'administratorManagement') throw new Error('Denied');
  } };
  await assert.rejects(setup.manage(staff, service, {}));
  await setup.manage(owner, service, { key: emailKey(staff.email), active: false });
  assert.equal(rows.get('roles/' + staff.uid).active, false);
  await assert.rejects(setup.enroll(staff, staff.email, rows.get('policy/cloud-test')));
  await setup.manage(owner, service, { key: emailKey(staff.email), active: true });
  await setup.enroll(staff, staff.email, rows.get('policy/cloud-test'));
  await setup.window(owner, owner.email, { action: 'close' });
  assert.equal(rows.get('policy/cloud-test').enabled, false);
});
test('synthetic tester must have an active approved invitation and cannot replace its first verified binding', async () => {
  const { setup, rows } = fixture();
  const who = { email: 'dedicated-test@example.org', uid: 'test', providerUid: 'google-test' };
  const path = 'allowlist/' + emailKey(who.email);
  await assert.rejects(setup.verifyDedicatedTester(who));
  rows.set(path, { dedicatedTestApproved: true, status: 'active', expiresAt: Timestamp.fromMillis(now + 1000) });
  await setup.verifyDedicatedTester(who);
  await setup.verifyDedicatedTester(who);
  await assert.rejects(setup.verifyDedicatedTester({ ...who, uid: 'other' }));
  rows.get(path).status = 'revoked';
  await assert.rejects(setup.verifyDedicatedTester(who));
});
test('Firebase Auth errors fail closed and expose only a safe response', async () => {
  const upstream = Object.assign(new Error('UPSTREAM_PRIVATE_BODY'), { code: 'auth/internal-error' });
  const auth = { verifyIdToken: async (_, revoked) => {
    assert.equal(revoked, true);
    throw upstream;
  } };
  await assert.rejects(getPortalIdentity(auth, 'private-token'), (error) =>
    error.code === 'unavailable' && !error.message.includes('UPSTREAM_PRIVATE_BODY'));
});
