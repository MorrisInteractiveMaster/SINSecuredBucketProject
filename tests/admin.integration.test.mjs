import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { deleteApp } from 'firebase-admin/app';
import { randomUUID } from 'node:crypto';
import { seedMvp } from '../scripts/seed-mvp.mjs';
import { createService } from '../functions/lib/service.mjs';
import { createAdminOperations } from '../functions/lib/admin-operations.mjs';
import {
  neutralCell,
  META_FIELDS,
  filterRows,
} from '../functions/lib/metadata.mjs';
if (
  process.env.GCLOUD_PROJECT !== 'demo-mi-sin-portal' ||
  process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080'
)
  throw Error('Demo emulators required');
let seed,
  ops,
  now = Date.now(),
  rows;
const who = {
  uid: 'mi-admin',
  email: 'admin@example.com',
  providerId: 'microsoft.com',
  authTime: Math.floor(now / 1000),
  organization: {
    member: true,
    tenantId: 'emulator-mi-tenant',
    objectId: 'emulator-mi-member',
  },
};
const denied = (promise, code = 'permission-denied') =>
  assert.rejects(promise, (e) => e.code === code);
before(async () => {
  await fetch(
    'http://127.0.0.1:8080/emulator/v1/projects/demo-mi-sin-portal/databases/mi-sin-portal/documents',
    { method: 'DELETE' },
  );
  seed = await seedMvp({ rich: true });
  const service = createService({
    db: seed.db,
    clock: () => now,
    pepper: 'test-only',
    tenantId: 'emulator-mi-tenant',
    sendCode: async () => {},
  });
  ops = createAdminOperations({ db: seed.db, service, clock: () => now });
  rows = (await ops.overview(who)).rows;
});
after(async () => {
  await deleteApp(seed.app);
});
test('overview counts are actual database records and omit ciphertext and identity bindings', async () => {
  const out = await ops.overview(who);
  assert.equal(out.rows.length, 12);
  assert.equal(out.metrics.submitted, 4);
  assert.equal(out.metrics.retrieved, 0);
  assert.equal(out.metrics.disposed, 0);
  assert.equal(out.rows.filter((r) => !r.invitationAt).length, 2);
  assert.ok(
    !JSON.stringify(out).match(/ciphertext|objectId|tenantId|000000018/),
  );
});
test('metadata operations require independent Microsoft role permissions', async () => {
  for (const altered of [
    { ...who, uid: 'outsider' },
    { ...who, providerId: 'google.com' },
    { ...who, organization: { ...who.organization, objectId: 'wrong' } },
  ])
    await denied(ops.overview(altered));
  await denied(ops.overview({ ...who, authTime: 0 }), 'unauthenticated');
  await seed.db
    .doc('roles/mi-admin')
    .update({
      metadataCopy: false,
      metadataExport: false,
      auditViewing: false,
      workflowManagement: false,
    });
  await denied(
    ops.output(who, { kind: 'copy', scope: 'all', fields: ['email'] }),
  );
  await denied(
    ops.output(who, { kind: 'xlsx', scope: 'all', fields: ['email'] }),
  );
  await denied(ops.activity(who));
  await denied(
    ops.workflow(who, {
      kind: 'burn',
      invitationId: rows.find((r) => r.submittedAt).invitationId,
    }),
  );
  await seed.db
    .doc('roles/mi-admin')
    .update({
      metadataCopy: true,
      metadataExport: true,
      auditViewing: true,
      workflowManagement: true,
    });
});
test('copy rejects sensitive or hidden fields, unknown IDs and duplicate selections', async () => {
  for (const field of ['sin', 'ciphertext', 'privateKey', 'token'])
    await denied(
      ops.output(who, { kind: 'copy', scope: 'all', fields: [field] }),
    );
  await denied(
    ops.output(who, {
      kind: 'copy',
      scope: 'selected',
      ids: [randomUUID()],
      fields: ['email'],
    }),
  );
  await denied(
    ops.output(who, {
      kind: 'copy',
      scope: 'selected',
      ids: [rows[0].invitationId, rows[0].invitationId],
      fields: ['email'],
    }),
    'invalid-argument',
  );
});
test('visible/selected/filtered/all scopes return exactly approved metadata; copy is audited without contents', async () => {
  const chosen = rows.find((r) => r.submittedAt);
  const out = await ops.output(who, {
    kind: 'copy',
    scope: 'selected',
    ids: [chosen.invitationId],
    fields: ['email', 'submissionStatus'],
  });
  assert.equal(out.count, 1);
  assert.equal(out.text.split('\n').length, 2);
  assert.equal(out.fields.length, 2);
  const all = await ops.output(who, {
    kind: 'copy',
    scope: 'all',
    filter: { search: 'not-a-match' },
    fields: ['email'],
  });
  assert.equal(all.count, 12);
  const filtered = await ops.output(who, {
    kind: 'copy',
    scope: 'filtered',
    filter: { status: 'submitted' },
    fields: ['email'],
  });
  assert.equal(filtered.count, 4);
  const event = (
    await seed.db.doc(`auditEvents/${out.auditReference}`).get()
  ).data();
  assert.deepEqual(
    Object.keys(event).sort(),
    ['actorUid', 'at', 'count', 'event', 'invitationId', 'outputId'].sort(),
  );
  assert.ok(!JSON.stringify(event).includes(chosen.email));
  await ops.acknowledge(who, {
    outputId: out.outputId,
    outcome: 'client_failed',
  });
  await denied(
    ops.acknowledge(who, {
      outputId: out.outputId,
      outcome: 'client_confirmed',
    }),
  );
});
test('output acknowledgments are actor-bound, expiring and checked against current role', async () => {
  const out = await ops.output(who, {
    kind: 'copy',
    scope: 'all',
    fields: ['name'],
  });
  await seed.db
    .doc('roles/second')
    .set({
      ...(await seed.db.doc('roles/mi-admin').get()).data(),
      objectId: 'second-object',
    });
  const other = {
    ...who,
    uid: 'second',
    organization: { ...who.organization, objectId: 'second-object' },
  };
  await denied(
    ops.acknowledge(other, {
      outputId: out.outputId,
      outcome: 'client_confirmed',
    }),
  );
  await seed.db.doc('roles/mi-admin').update({ metadataCopy: false });
  await denied(
    ops.acknowledge(who, {
      outputId: out.outputId,
      outcome: 'client_confirmed',
    }),
  );
  await seed.db.doc('roles/mi-admin').update({ metadataCopy: true });
  now += 600001;
  await denied(
    ops.acknowledge(
      { ...who, authTime: Math.floor(now / 1000) },
      { outputId: out.outputId, outcome: 'client_confirmed' },
    ),
  );
  now -= 600001;
});
test('formatted XLSX contains string cells only and neutralizes formulas and delimiters', async () => {
  const doc = (await seed.db.collection('allowlist').limit(1).get()).docs[0];
  await doc.ref.update({ name: '=HYPERLINK("https://example.org")\t\n' });
  const out = await ops.output(who, {
    kind: 'xlsx',
    scope: 'all',
    fields: ['name', 'email', 'auditReference'],
  });
  const { default: ExcelJS } = await import('exceljs-community');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(out.base64, 'base64'));
  const sheet = workbook.worksheets[0];
  assert.equal(sheet.rowCount, 15);
  assert.equal(sheet.getRow(3).getCell(1).value, 'Name');
  assert.ok(sheet.autoFilter);
  let found = false;
  sheet.eachRow((row) =>
    row.eachCell((cell) => {
      assert.notEqual(typeof cell.value, 'object');
      if (String(cell.value).includes('HYPERLINK')) {
        assert.match(cell.value, /^'=/);
        assert.ok(!cell.value.match(/[\t\n]/));
        found = true;
      }
    }),
  );
  assert.ok(found);
  assert.ok(
    !JSON.stringify(sheet.model).match(/000000018|ciphertext|privateKey/),
  );
  assert.ok(!META_FIELDS.includes('sin'));
  assert.equal(neutralCell(' @SUM(1)'), "' @SUM(1)");
});
test('bulk changes are atomic, bounded and preserve encrypted payloads and permanent slots', async () => {
  const chosen = rows.find((r) => r.submittedAt),
    before = (
      await seed.db.doc(`encryptedRecords/${chosen.invitationId}`).get()
    ).data();
  await denied(
    ops.bulk(who, {
      action: 'revoke',
      ids: [chosen.invitationId, randomUUID()],
    }),
  );
  const initial = (await ops.overview(who)).rows.find(
    (r) => r.invitationId === chosen.invitationId,
  );
  assert.equal(initial.invitationStatus, 'active');
  await ops.bulk(who, { action: 'assign_self', ids: [chosen.invitationId] });
  await ops.bulk(who, { action: 'revoke', ids: [chosen.invitationId] });
  assert.deepEqual(
    (await seed.db.doc(`encryptedRecords/${chosen.invitationId}`).get()).data(),
    before,
  );
  assert.ok(
    (await seed.db.doc(`submissionSlots/${chosen.invitationId}`).get()).exists,
  );
  await denied(
    ops.bulk(who, {
      action: 'revoke',
      ids: Array.from({ length: 26 }, () => randomUUID()),
    }),
    'invalid-argument',
  );
});
test('Burn, retrieval and transfer requests are explicitly blocked and audited; no payload deletion', async () => {
  const chosen = rows.find((r) => r.submittedAt);
  for (const kind of ['burn', 'retrieval', 'transfer']) {
    const out = await ops.workflow(who, {
      kind,
      invitationId: chosen.invitationId,
    });
    assert.equal(out.outcome, 'blocked');
    assert.ok(out.auditReference);
  }
  assert.ok(
    (await seed.db.doc(`encryptedRecords/${chosen.invitationId}`).get()).exists,
  );
  assert.equal(
    (await seed.db.doc(`submissions/${chosen.invitationId}`).get()).data()
      .disposalStatus,
    undefined,
  );
  const out = await ops.activity(who, { invitationId: chosen.invitationId });
  assert.ok(out.events.some((e) => e.event === 'burn_request_blocked'));
  assert.ok(!JSON.stringify(out).includes('ciphertext'));
});
test('date filters exclude legacy missing dates; filters never create new records', () => {
  assert.equal(filterRows(rows, { from: '2000-01-01' }).length, 10);
  assert.equal(filterRows(rows, { search: 'nonexistent' }).length, 0);
});
