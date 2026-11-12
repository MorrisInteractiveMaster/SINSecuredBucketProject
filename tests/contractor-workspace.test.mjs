import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accessStatus, DEFAULT_INVITATION_DAYS } from '../functions/lib/contractor-access.mjs';
import { previewContractorCsv, assignmentBatches, creationBatches } from '../functions/lib/contractor-workspace.mjs';
import { invitationExpiry } from '../cloud-functions/cloud/contractors.mjs';
import { Timestamp } from 'firebase-admin/firestore';
test('access distinguishes revoked and removed from expired; new default is 30 days', () => {
  const now = Date.now(), expiresAt = Timestamp.fromMillis(now - 1);
  assert.equal(accessStatus({ status: 'revoked', expiresAt }, now), 'revoked');
  assert.equal(accessStatus({ status: 'removed', expiresAt }, now), 'removed');
  assert.equal(accessStatus({ status: 'active', expiresAt }, now), 'expired');
  assert.equal(accessStatus({ status: 'active' }, now), 'invalid');
  assert.equal(invitationExpiry(undefined, now).toMillis(), now + DEFAULT_INVITATION_DAYS * 86400000);
  for (const expiry of [null, now + 1, 'invalid', new Date(now - 1).toISOString(), new Date(now + 367 * 86400000).toISOString()]) assert.throws(() => invitationExpiry(expiry, now));
});
test('CSV preview exposes new/existing/revoked/expired/duplicate/invalid without modifying records', () => {
  const existing = ['active', 'revoked', 'expired', 'removed'].map((status, i) => ({ email: `person${i}@example.org`, name: 'Preserved name', invitationId: String(i), invitationStatus: status }));
  const before = structuredClone(existing);
  const rows = previewContractorCsv('name,email,status\n,New@example.org,active\nChanged,person0@example.org,active\n,person1@example.org,active\n,person2@example.org,active\n,person3@example.org,active\n,NEW@example.org,active\n,bad,active', existing);
  assert.deepEqual(rows.map((r) => r.category), ['new', 'active', 'revoked', 'expired', 'removed', 'duplicate', 'invalid']);
  assert.deepEqual(rows.map((r) => r.eligible), [true, true, false, false, false, false, false]);
  assert.equal(rows[0].name, 'New'); assert.equal(rows[1].name, 'Preserved name');
  assert.deepEqual(existing, before);
  assert.throws(() => previewContractorCsv('name,email,status\n"unfinished', []));
  assert.equal(previewContractorCsv('email\nnew@example.org', [])[0].eligible, true);
});
test('assignment and creation batching retains <=50 assignments and <=25 new contractors', () => {
  const choices = Array.from({ length: 49 }, (_, i) => ({ invitationId: String(i), templateIds: ['sin', 'phone', 'pdf'] }));
  const batches = assignmentBatches(choices);
  assert.deepEqual(batches.map((b) => b.invitationIds.length), [16, 16, 16, 1]);
  assert.equal(batches.flatMap((b) => b.invitationIds).length, 49);
  for (const batch of batches) assert.ok(batch.invitationIds.length * batch.templateIds.length <= 50);
  const created = creationBatches(choices);
  assert.deepEqual(created.map((b) => b.rows.length), [16, 16, 16, 1]);
  assert.deepEqual(creationBatches(choices.map((r) => ({ ...r, templateIds: ['phone'] }))).map((b) => b.rows.length), [25, 24]);
  assert.throws(() => creationBatches([{ templateIds: [] }]));
  assert.equal(assignmentBatches([{ invitationId: 'one', templateIds: [] }]).length, 0);
});
