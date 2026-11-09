import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createProductionWorkflow } from '../design/production/workflow.mjs';

const id = '11111111-1111-1111-1111-111111111111';
const receipt = '22222222-2222-2222-2222-222222222222';
const now = 1000000;
function fixture(options = {}) {
  let record;
  let queue = Promise.resolve();
  const invitation = { uid: 'tester', active: true, expiresAt: now + 1, noticeAccepted: 'v1' };
  const audit = [];
  const workflow = createProductionWorkflow({
    clock: () => now,
    releaseEnabled: true,
    approval: { security: true, privacy: true, cryptography: true, operations: true, expiresAt: now + 1, noticeVersion: 'v1' },
    authenticate: async () => ({ uid: 'tester', mfaAt: now, permissions: ['submit', 'retrieve', 'transfer', 'dispose'] }),
    verifyTransfer: async ({ receipt: value }) => value === receipt,
    keyCustody: {
      // Local test double only. Never use this adapter to protect real data.
      wrap: async (key) => Buffer.from(key),
      unwrap: async (key) => Buffer.from(key),
    },
    store: { atomic(fn) {
      const attempt = queue.then(() => fn({
        invitation: async () => invitation,
        consumeInvitation: () => { invitation.consumed = true; },
        record: async () => record,
        createRecord: (_, value) => { record = value; },
        updateRecord: (_, value) => { record = { ...record, ...value }; },
        replaceRecord: (_, value) => { record = value; },
        audit: (event) => audit.push(event),
      }));
      queue = attempt.catch(() => {});
      return attempt;
    } },
    ...options,
  });
  return { workflow, audit, record: () => record };
}
test('candidate is closed without release approval and requires fresh MFA', async () => {
  await assert.rejects(fixture({ releaseEnabled: false }).workflow.submit({}, id, '000000018'));
  await assert.rejects(fixture({ authenticate: async () => ({ uid: 'staff', permissions: ['retrieve'], mfaAt: 0 }) }).workflow.retrieve({}, id));
});
test('concurrent submission and retrieval each succeed once, with approved transfer and active disposal', async () => {
  const { workflow, record, audit } = fixture();
  const pair = (fn) => Promise.allSettled([fn(), fn()]);
  assert.equal((await pair(() => workflow.submit({}, id, '000000018'))).filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(record().state, 'sealed');
  await assert.rejects(workflow.dispose({}, id));
  const outcomes = await pair(() => workflow.retrieve({}, id));
  assert.deepEqual(outcomes.filter((r) => r.status === 'fulfilled').map((r) => r.value), ['000000018']);
  await workflow.confirmTransfer({}, id, receipt);
  await workflow.confirmTransfer({}, id, receipt);
  await workflow.dispose({}, id);
  await workflow.dispose({}, id);
  assert.equal(record().envelope, undefined);
  assert.equal(audit.length, 5);
  assert.equal(JSON.stringify(audit).includes('000000018'), false);
});
test('failed unwrap consumes the retrieval attempt', async () => {
  const { workflow, record } = fixture({ keyCustody: {
    wrap: async (key) => Buffer.from(key),
    unwrap: async () => { throw new Error('internal detail'); },
  } });
  await workflow.submit({}, id, '000000018');
  await assert.rejects(workflow.retrieve({}, id), /could not be completed/);
  assert.equal(record().state, 'retrieval-consumed');
  await assert.rejects(workflow.retrieve({}, id));
});
