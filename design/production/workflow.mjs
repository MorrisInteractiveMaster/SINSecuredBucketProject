// Review candidate. This directory is outside both Firebase release artifacts.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { normalizeSin } from '../../functions/lib/security.mjs';

const minute = 60_000;
const failure = () => new Error('The secure workflow request could not be completed.');
const recordId = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const requiredApprovals = ['security', 'privacy', 'cryptography', 'operations'];

function aad(id) {
  return Buffer.from('mi-sin-production:v1:' + id);
}
async function encrypt(keyCustody, id, value) {
  const key = randomBytes(32);
  const plaintext = Buffer.from(value, 'ascii');
  try {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(aad(id));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const wrappedKey = await keyCustody.wrap(key, aad(id));
    return { iv, ciphertext, tag: cipher.getAuthTag(), wrappedKey };
  } finally {
    key.fill(0);
    plaintext.fill(0);
  }
}
async function decrypt(keyCustody, id, envelope) {
  const key = await keyCustody.unwrap(envelope.wrappedKey, aad(id));
  let partial;
  let final;
  try {
    const cipher = createDecipheriv('aes-256-gcm', key, envelope.iv);
    cipher.setAAD(aad(id));
    cipher.setAuthTag(envelope.tag);
    partial = cipher.update(envelope.ciphertext);
    final = cipher.final();
    // An authenticated SIN is nine bytes. Return only after GCM authentication.
    if (partial.length !== 9 || final.length !== 0) throw failure();
    return partial.toString('ascii');
  } finally {
    key.fill(0);
    partial?.fill(0);
    final?.fill(0);
  }
}

// Store contract: all reads, mutations and audit writes within atomic() commit
// together with optimistic conflict detection. External calls stay outside it.
// Identity and transfer verifiers must derive their results independently.
export function createProductionWorkflow({
  releaseEnabled = false, approval, store, keyCustody, authenticate, verifyTransfer, clock = Date.now,
}) {
  async function access(request, operation, id) {
    if (!releaseEnabled || !requiredApprovals.every((key) => approval?.[key] === true) ||
        !Number.isFinite(approval?.expiresAt) || approval.expiresAt <= clock() ||
        typeof id !== 'string' || !recordId.test(id)) throw failure();
    const actor = await authenticate(request, operation);
    if (!actor?.uid || !actor.permissions?.includes(operation)) throw failure();
    if (operation !== 'submit' &&
        (!Number.isFinite(actor.mfaAt) || actor.mfaAt > clock() ||
         clock() - actor.mfaAt > 5 * minute)) throw failure();
    return actor;
  }
  function event(tx, actor, id, action) {
    tx.audit({ actorUid: actor.uid, recordId: id, action, at: clock() });
  }
  return {
    async submit(request, id, number) {
      const actor = await access(request, 'submit', id);
      const envelope = await encrypt(keyCustody, id, normalizeSin(number));
      await store.atomic(async (tx) => {
        const invitation = await tx.invitation(id);
        if (invitation?.uid !== actor.uid || invitation.active !== true ||
            !Number.isFinite(invitation.expiresAt) || invitation.expiresAt <= clock() ||
            invitation.consumed || !(invitation.noticeAccepted === approval.noticeVersion && approval.noticeVersion)) throw failure();
        tx.consumeInvitation(id);
        tx.createRecord(id, { state: 'sealed', envelope, submittedAt: clock() });
        event(tx, actor, id, 'submitted');
      });
      return { accepted: true };
    },
    async retrieve(request, id) {
      const actor = await access(request, 'retrieve', id);
      const envelope = await store.atomic(async (tx) => {
        const record = await tx.record(id);
        if (record?.state !== 'sealed') throw failure();
        tx.updateRecord(id, { state: 'retrieval-consumed', retrievedBy: actor.uid });
        event(tx, actor, id, 'retrieval-consumed');
        return record.envelope;
      });
      // A crash, lost response or unwrap failure does not restore retrieval.
      const value = await decrypt(keyCustody, id, envelope).catch(() => { throw failure(); });
      await store.atomic(async (tx) => {
        const record = await tx.record(id);
        if (record?.state !== 'retrieval-consumed' || record.retrievedBy !== actor.uid) throw failure();
        tx.updateRecord(id, { state: 'release-authorized' });
        event(tx, actor, id, 'release-authorized');
      });
      return value;
    },
    async confirmTransfer(request, id, receipt) {
      const actor = await access(request, 'transfer', id);
      if (typeof receipt !== 'string' || !recordId.test(receipt) ||
          !await verifyTransfer({ recordId: id, receipt, actorUid: actor.uid })) throw failure();
      await store.atomic(async (tx) => {
        const record = await tx.record(id);
        if (record?.state === 'transferred' && record.retrievedBy === actor.uid && record.receipt === receipt) return;
        if (record?.state !== 'release-authorized' || record.retrievedBy !== actor.uid) throw failure();
        tx.updateRecord(id, { state: 'transferred', receipt });
        event(tx, actor, id, 'transfer-confirmed');
      });
    },
    async dispose(request, id) {
      const actor = await access(request, 'dispose', id);
      await store.atomic(async (tx) => {
        const record = await tx.record(id);
        if (record?.state === 'disposed') return;
        if (record?.state !== 'transferred') throw failure();
        // Atomically remove ciphertext and wrapped key from the active record.
        tx.replaceRecord(id, { state: 'disposed', disposedAt: clock() });
        event(tx, actor, id, 'active-payload-disposed');
      });
    },
  };
}
