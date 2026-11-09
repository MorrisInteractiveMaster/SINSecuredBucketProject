import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initialRoster } from '../functions/lib/admin-roster.mjs';
import { emailKey } from '../functions/lib/security.mjs';
import { TARGET } from '../cloud-functions/cloud/gates.mjs';
import { createStaffWorkspace, validStaffPolicy } from '../cloud-functions/cloud/staff.mjs';
import { createCloudKmsCustody, createProductionFirestoreStore, createVerifiedMfa } from '../design/production/cloud-adapters.mjs';

const tenantId = '11111111-1111-1111-1111-111111111111';
const objectId = '22222222-2222-2222-2222-222222222222';
const policy = {
  version: 1, projectId: TARGET.projectId, databaseId: TARGET.databaseId,
  tenantId, microsoftClientId: objectId, enabled: true, invitationImportApproved: false,
  realCollectionEnabled: false, sensitiveRetrievalEnabled: false, disposalEnabled: false,
};
const who = { uid: 'fictional-uid', email: 'staff@example.org', providerId: 'microsoft.com', providerUid: objectId, authTime: Date.now() / 1000 };
const role = { active: true, emailKey: emailKey(who.email), objectId, tenantId, statusViewing: true, invitationManagement: true };
function fixture() {
  const rows = new Map([['staffWorkspace/v1/policy/access', policy], ['staffWorkspace/v1/roles/' + who.uid, role]]);
  const db = {
    doc: (path) => ({
      path, get: async () => ({ data: () => rows.get(path) }),
      collection: (name) => ({ doc: (id) => db.doc(path + '/' + name + '/' + id) }),
    }),
    async runTransaction(action) {
      const writes = [];
      const result = await action({
        get: (ref) => ref.get(),
        getAll: (...refs) => Promise.all(refs.map((r) => r.get())),
        create: (ref, value) => writes.push([ref.path, value]),
        set: (ref, value) => writes.push([ref.path, value]),
      });
      writes.forEach(([path, value]) => rows.set(path, value));
      return result;
    },
  };
  return { rows, staff: createStaffWorkspace({ db, clock: Date.now,
    verifyMicrosoft: async () => ({ member: true, objectId, tenantId }),
    roster: [{ key: role.emailKey }],
  }) };
}
test('pinned staff context works without a synthetic window and never grants sensitive actions', async () => {
  const { staff, rows } = fixture();
  assert.equal(initialRoster.length, 4);
  assert.equal(validStaffPolicy({ ...policy, realCollectionEnabled: true }), false);
  const bound = await staff.bind(who, 'mock-signed-assertion', role);
  const context = await staff.dispatch(bound, 'portalContext', {});
  assert.equal(context.workspace, 'staff');
  assert.equal(context.permissions.invitationManagement, false);
  assert.equal(context.permissions.sensitiveRetrieval, undefined);
  await assert.rejects(staff.dispatch(bound, 'portalSubmit', { fixtureId: 'fixture-a' }));
  rows.set('staffWorkspace/v1/roles/' + who.uid, { ...role, active: false });
  await assert.rejects(staff.dispatch(bound, 'portalContext', {}));
});
test('invitation import is guarded by privacy approval and reuses the record on revocation', async () => {
  const { staff, rows } = fixture();
  const bound = await staff.bind(who, 'assertion', role);
  const csv = 'name,email,status\nFictional Person,contractor@example.org,active';
  await assert.rejects(staff.dispatch(bound, 'portalImportAllowlist', { csv }),
    (error) => error.code === 'failed-precondition');
  const path = 'staffWorkspace/v1/allowlist/' + emailKey('contractor@example.org');
  assert.equal(rows.has(path), false);
  rows.set('staffWorkspace/v1/policy/access', { ...policy, invitationImportApproved: true });
  assert.deepEqual(await staff.dispatch(bound, 'portalImportAllowlist', { csv }), { imported: 1 });
  const invitationId = rows.get(path).invitationId;
  await staff.dispatch(bound, 'portalImportAllowlist', { csv: csv.replace('active', 'revoked') });
  assert.equal(rows.get(path).status, 'revoked');
  assert.equal(rows.get(path).invitationId, invitationId);
});
test('staff binding rejects Google, mismatched identity and revoked roles', async () => {
  const { staff } = fixture();
  await assert.rejects(staff.bind({ ...who, providerId: 'google.com' }, 'assertion', role));
  await assert.rejects(staff.bind({ ...who, providerUid: tenantId }, 'assertion', role));
  await assert.rejects(staff.bind(who, 'assertion', { ...role, active: false }));
  await assert.rejects(staff.bind({ ...who, email: 'other@example.org' }, 'assertion', role));
});
test('KMS custody uses a Canadian key, binds AAD and separates wrapping from unwrapping', async () => {
  const cryptoKey = 'projects/fictional-key-project/locations/northamerica-northeast1/keyRings/test/cryptoKeys/test';
  const key = Buffer.alloc(32, 6);
  const aad = Buffer.from('fixture-record');
  const calls = [];
  const options = {
    cryptoKey, credential: { getAccessToken: async () => ({ access_token: 'fictional-token' }) },
    fetcher: async (url, request) => {
      calls.push({ url, body: JSON.parse(request.body) });
      return { ok: true, json: async () => url.endsWith(':encrypt')
        ? { ciphertext: Buffer.from('mock-wrapped-key').toString('base64') }
        : { plaintext: key.toString('base64') } };
    },
  };
  const wrapper = createCloudKmsCustody({ ...options, operation: 'encrypt' });
  const unwrapper = createCloudKmsCustody({ ...options, operation: 'decrypt' });
  const wrapped = await wrapper.wrap(key, aad);
  await assert.rejects(wrapper.unwrap(wrapped, aad));
  assert.deepEqual(await unwrapper.unwrap(wrapped, aad), key);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((entry) => entry.body.additionalAuthenticatedData === aad.toString('base64')));
  assert.throws(() => createCloudKmsCustody({ ...options, operation: 'encrypt', cryptoKey: cryptoKey.replace('northamerica-northeast1', 'us-east1') }));
  assert.throws(() => createProductionFirestoreStore({ formattedName: 'projects/other/databases/(default)' }));
});
test('MFA verifier requires fresh second-factor evidence, not a newly issued token', async () => {
  const now = 1_000_000;
  const token = { uid: who.uid, auth_time: 999, iat: 1000, firebase: {
    sign_in_provider: 'microsoft.com', sign_in_second_factor: 'totp', second_factor_identifier: 'fictional-factor',
  } };
  const auth = { verifyIdToken: async (_, checkRevocation) => { assert.equal(checkRevocation, true); return token; } };
  const mfa = createVerifiedMfa({ auth, allowedFactors: ['totp'], clock: () => now });
  assert.equal(await mfa('fictional-token', who.uid), 999000);
  token.auth_time = 600;
  await assert.rejects(mfa('fictional-token', who.uid));
  token.auth_time = 999;
  delete token.firebase.second_factor_identifier;
  await assert.rejects(mfa('fictional-token', who.uid));
});
