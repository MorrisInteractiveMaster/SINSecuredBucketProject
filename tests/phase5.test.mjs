import assert from 'node:assert/strict';
import { generateKeyPair, SignJWT } from 'jose';
import { verifyOrganizationalAssertion } from '../functions/lib/microsoft.mjs';
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
const prefix = 'staffWorkspace/v1/';
const slotPath = prefix + 'approvedAdministrators/' + role.emailKey;
const rolePath = prefix + 'roles/' + who.uid;
const assertion = { member: true, objectId, tenantId, accountEmail: who.email, appRoles: ['MiSinPortal.Staff'] };
function fixture({ version = 1, verifyMicrosoft = async () => assertion } = {}) {
  const rows = new Map([[prefix + 'policy/access', { ...policy, version }]]);
  if (version === 1) rows.set(rolePath, role);
  else rows.set(slotPath, { key: role.emailKey, active: true });
  let queue = Promise.resolve();
  let sequence = 0;
  const db = {
    doc: (path) => ({
      path, get: async () => ({ exists: rows.has(path), data: () => structuredClone(rows.get(path)) }),
      collection: (name) => ({ doc: (id = ++sequence) => db.doc(path + '/' + name + '/' + id) }),
    }),
    getAll: (...refs) => Promise.all(refs.map((r) => r.get())),
    runTransaction(action) {
      const result = queue.then(async () => {
        const writes = [];
        const value = await action({
          get: (ref) => ref.get(),
          getAll: db.getAll,
          create: (ref, data) => {
            assert.equal(rows.has(ref.path), false);
            writes.push([ref.path, data]);
          },
          set: (ref, data) => writes.push([ref.path, data]),
          update: (ref, data) => writes.push([ref.path, { ...rows.get(ref.path), ...data }]),
        });
        writes.forEach(([path, data]) => rows.set(path, data));
        return value;
      });
      queue = result.catch(() => {});
      return result;
    },
  };
  const staff = createStaffWorkspace({ db, clock: Date.now, verifyMicrosoft,
    roster: [{ key: role.emailKey, label: 'Fictional Staff' }],
  });
  const signIn = (user = who, op = 'portalContext') => staff.resolve(user, 'mock-signed-assertion', op, async () => {});
  return { rows, staff, signIn };
}
test('pinned staff context works without a synthetic window and never grants sensitive actions', async () => {
  const { staff, rows, signIn } = fixture();
  assert.equal(initialRoster.length, 4);
  assert.equal(validStaffPolicy({ ...policy, realCollectionEnabled: true }), false);
  const bound = await signIn();
  const context = await staff.dispatch(bound, 'portalContext', {});
  assert.equal(context.workspace, 'staff');
  assert.equal(context.permissions.invitationManagement, false);
  assert.equal(context.permissions.sensitiveRetrieval, undefined);
  await assert.rejects(staff.dispatch(bound, 'portalSubmit', { fixtureId: 'fixture-a' }));
  rows.set('staffWorkspace/v1/roles/' + who.uid, { ...role, active: false });
  await assert.rejects(staff.dispatch(bound, 'portalContext', {}));
});
test('invitation import requires a recorded approval, rejects duplicates and preserves identity when editing', async () => {
  const { staff, rows, signIn } = fixture();
  const bound = await signIn();
  const csv = 'name,email,status\nFictional Person,contractor@example.org,active';
  await assert.rejects(staff.dispatch(bound, 'portalImportAllowlist', { csv }),
    (error) => error.code === 'failed-precondition');
  const path = 'staffWorkspace/v1/allowlist/' + emailKey('contractor@example.org');
  assert.equal(rows.has(path), false);
  rows.set('staffWorkspace/v1/policy/access', { ...policy, invitationImportApproved: true });
  await assert.rejects(staff.dispatch(bound, 'portalImportAllowlist', { csv }),
    (error) => error.code === 'failed-precondition');
  rows.set('staffWorkspace/v1/policy/access', { ...policy, invitationImportApproved: true, privacyApprovalReference: objectId });
  assert.deepEqual(await staff.dispatch(bound, 'portalImportAllowlist', { csv }), { imported: 1 });
  assert.equal(rows.get(path).name, 'Fictional Person');
  await staff.dispatch(bound, 'portalImportAllowlist', { csv: 'name,email,status\n   ,Les.Ter+work@example.org,active' });
  assert.equal(rows.get('staffWorkspace/v1/allowlist/' + emailKey('les.ter+work@example.org')).name, 'Les.Ter+work');
  const invitationId = rows.get(path).invitationId;
  await assert.rejects(staff.dispatch(bound, 'portalImportAllowlist', { csv }),
    (error) => error.code === 'already-exists');
  await staff.dispatch(bound, 'portalImportAllowlist', {
    csv: csv.replace('Fictional Person', 'Updated Name').replace('active', 'revoked'), mode: 'rename',
  });
  assert.equal(rows.get(path).status, 'active');
  assert.equal(rows.get(path).name, 'Updated Name');
  assert.equal(rows.get(path).invitationId, invitationId);
});
test('staff binding rejects Google, mismatched identity and revoked roles', async () => {
  const { signIn, rows } = fixture();
  await assert.rejects(signIn({ ...who, providerId: 'google.com' }));
  await assert.rejects(signIn({ ...who, providerUid: tenantId }));
  await assert.rejects(signIn({ ...who, email: 'other@example.org' }));
  rows.set(rolePath, { ...role, active: false });
  await assert.rejects(signIn());
});
test('first sign-in atomically enrolls once and pins the immutable identity', async () => {
  const { rows, staff, signIn } = fixture({ version: 2, verifyMicrosoft: async (_, options) => {
    assert.equal(options.tenantId, tenantId);
    assert.equal(options.clientId, policy.microsoftClientId);
    return { ...assertion, objectId: options.providerUid };
  } });
  await assert.rejects(signIn(who, 'portalOverview'));
  assert.equal(rows.has(rolePath), false);
  const [actor, repeat] = await Promise.all([signIn(), signIn()]);
  assert.deepEqual(actor, repeat);
  assert.equal((await staff.dispatch(actor, 'portalContext', {})).workspace, 'staff');
  assert.equal(rows.get(slotPath).uid, who.uid);
  assert.equal(rows.get(prefix + 'objectBindings/' + objectId).uid, who.uid);
  assert.equal([...rows.values()].filter((row) => row.event === 'staff_identity_enrolled').length, 1);
  await assert.rejects(signIn({ ...who, uid: 'replacement' }));
  await assert.rejects(signIn({ ...who, providerUid: tenantId }));
  rows.set(slotPath, { ...rows.get(slotPath), active: false });
  await assert.rejects(signIn());
  await assert.rejects(staff.dispatch(actor, 'portalContext', {}));
});
test('pending revocation, conflicting mailboxes and incomplete Entra assertions never bind', async () => {
  const pending = fixture({ version: 2 });
  assert.equal(await pending.signIn({ ...who, email: 'unknown@example.org' }), null);
  await assert.rejects(pending.signIn({ ...who, linkedMailboxConflict: true }));
  pending.rows.set(slotPath, { key: role.emailKey, active: false });
  await assert.rejects(pending.signIn());
  assert.equal(pending.rows.has(rolePath), false);
  for (const bad of [
    { accountEmail: null }, { accountEmail: 'other@example.org' }, { member: false },
    { tenantId: objectId }, { objectId: tenantId }, { appRoles: [] }, { appRoles: ['MiSinPortal.Owner'] },
  ]) {
    const { signIn, rows } = fixture({ version: 2, verifyMicrosoft: async () => ({ ...assertion, ...bad }) });
    await assert.rejects(signIn());
    assert.equal(rows.has(rolePath), false);
  }
});
test('Microsoft proof verifies RSA signature, audience, issuer, member claim and linked oid', async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const foreign = await generateKeyPair('RS256');
  const clientId = policy.microsoftClientId;
  const claims = {
    iss: 'https://login.microsoftonline.com/' + tenantId + '/v2.0',
    aud: clientId, tid: tenantId, oid: objectId, acct: 0,
    preferred_username: who.email, roles: assertion.appRoles,
  };
  const sign = (overrides = {}, key = privateKey) => new SignJWT({ ...claims, ...overrides })
    .setProtectedHeader({ alg: 'RS256' }).setIssuedAt().setExpirationTime('5m').sign(key);
  const verify = (token) => verifyOrganizationalAssertion(token, { tenantId, clientId, providerUid: objectId }, publicKey);
  assert.deepEqual(await verify(await sign()), assertion);
  for (const bad of [
    { aud: tenantId }, { iss: claims.iss.replace(tenantId, objectId) }, { tid: objectId },
    { oid: tenantId }, { acct: 1 }, { acct: undefined },
  ]) await assert.rejects(verify(await sign(bad)));
  await assert.rejects(verify(await sign({}, foreign.privateKey)));
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

test('backfill previews and updates only placeholder and empty contractor names', async () => {
  const { backfillContractorNames } = await import('../scripts/backfill-contractor-names.mjs');
  const records = [
    { name: 'Test account', email: 'lester@example.org', invitationId: 'keep' },
    { name: '  ', email: 'Case+tag@example.org' },
    { name: null, email: 'null-name@example.org' },
    { email: 'missing-name@example.org' },
    { name: 'Original Name', email: 'original@example.org' },
    { name: 'Test account', email: 'bad-email' },
    { name: '', email: 'concurrent@example.org' },
  ];
  const docs = records.map((row, ref) => ({ ref, data: () => ({ ...row }) }));
  const db = {
    collection: (path) => {
      assert.ok(['allowlist', 'staffWorkspace/v1/allowlist'].includes(path));
      return { orderBy: () => ({ limit: () => ({ get: async () => {
        const selected = path === 'allowlist' ? docs.slice(5) : docs.slice(0, 5);
        return { docs: selected, size: selected.length, empty: false };
      } }) }) };
    },
    runTransaction: (fn) => fn({
      get: async (ref) => ({ data: () => ref === 6 ? { ...records[ref], name: 'Concurrent edit' } : records[ref] }),
      update: (ref, patch) => Object.assign(records[ref], patch),
    }),
  };
  assert.deepEqual(await backfillContractorNames(db, false), { scanned: 7, candidates: 5, updated: 0 });
  assert.equal(records[0].name, 'Test account');
  assert.deepEqual(await backfillContractorNames(db, true), { scanned: 7, candidates: 5, updated: 4 });
  assert.deepEqual(records.map(({ name }) => name),
    ['lester', 'Case+tag', 'null-name', 'missing-name', 'Original Name', 'Test account', '']);
  assert.equal(records[0].invitationId, 'keep');
  assert.deepEqual(await backfillContractorNames(db, true), { scanned: 7, candidates: 1, updated: 0 });
});

test('tracker copy and Excel exports omit responsible administrator even when it exists in storage', async () => {
  const { createAdminOperations } = await import('../functions/lib/admin-operations.mjs');
  const { Workbook } = await import('exceljs-community');
  const record = { name: 'Lester', email: 'lester@example.org', invitationId: objectId,
    responsibleAdminUid: 'staff-id-should-not-leave' };
  const db = {
    collection: (name) => ({
      orderBy() { return this; },
      limit() { return this; },
      async get() {
        const docs = name === 'allowlist' ? [{ data: () => record }] : [];
        return { docs, size: docs.length };
      },
      doc: () => ({ id: 'audit', create: async () => {} }),
    }),
    doc: () => ({ create: async () => {} }),
    getAll: async () => [{ data: () => undefined }],
  };
  const operations = createAdminOperations({ db, service: { authorize: async () => {} } });
  const copy = await operations.output(who, { kind: 'copy', scope: 'all' });
  assert.doesNotMatch(copy.text, /Responsible administrator|staff-id-should-not-leave/);
  assert.match(copy.text, /Lester/);
  const result = await operations.output(who, { kind: 'xlsx', scope: 'all' });
  const workbook = new Workbook();
  await workbook.xlsx.load(Buffer.from(result.base64, 'base64'));
  const sheet = workbook.worksheets[0];
  assert.doesNotMatch(JSON.stringify(sheet.getRows(3, 2).map((row) => row.values)),
    /Responsible administrator|staff-id-should-not-leave/);
  await assert.rejects(operations.output(who, { kind: 'xlsx', scope: 'all', fields: ['responsibleAdminUid'] }),
    (error) => error.code === 'permission-denied');
});
