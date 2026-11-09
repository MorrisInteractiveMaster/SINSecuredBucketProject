import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { createCloudKmsCustody, cryptoKeyPattern } from '../../functions/lib/kms.mjs';
import { checkFresh, deny, emailKey, normalizeSin } from '../../functions/lib/security.mjs';
import { exactKeys } from './gates.mjs';

const guid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const aad = (id) => Buffer.from('mi-sin-portal:one-time:v1:' + id);
export const liveSinRelease = (policy) => policy?.enabled === true &&
  guid.test(policy.approvalReference || '') && cryptoKeyPattern.test(policy.kmsKey || '');

export function createOneTimeSin({ db, clock, credential, custody }) {
  const releaseRef = db.doc('policy/sin-release');
  const staffPolicyRef = db.doc('policy/access');
  const key = custody ?? ((kmsKey, operation) => createCloudKmsCustody({ cryptoKey: kmsKey, operation, credential }));
  const submission = (id) => db.doc('submissions/' + id);
  const payload = (id) => db.doc('sealedSin/' + id);
  const now = () => Timestamp.fromMillis(clock());
  const policyIn = async (tx) => {
    const policy = (await tx.get(releaseRef)).data();
    const staff = (await tx.get(staffPolicyRef)).data();
    if (!liveSinRelease(policy) || staff?.enabled !== true || staff.invitationImportApproved !== true || !guid.test(staff.privacyApprovalReference || '')) deny('failed-precondition', 'SIN collection and retrieval are closed.');
    return policy;
  };
  const audit = (tx, who, id, event) => tx.create(db.collection('auditEvents').doc(), {
    actorUid: who.uid, invitationId: id, event, at: now(),
  });

  async function invitation(tx, who) {
    if (!who.verifiedLinkedMailbox) deny('permission-denied', 'Use your approved, verified Gmail, Outlook or Hotmail mailbox.', 'sin-mailbox');
    const ref = db.doc('allowlist/' + emailKey(who.email));
    const entry = (await tx.get(ref)).data();
    if (entry?.status !== 'active' || !guid.test(entry.invitationId || '') ||
        entry.expiresAt?.toMillis() <= clock() || !entry.expiresAt) deny();
    return { ref, entry, existing: (await tx.get(submission(entry.invitationId))).data() };
  }
  return {
    enabled: async () => liveSinRelease((await releaseRef.get()).data()),
    context: (who) => db.runTransaction(async (tx) => {
      await policyIn(tx);
      const { existing } = await invitation(tx, who);
      return { kind: 'contractor', liveSin: true, submitted: Boolean(existing) };
    }),
    async submit(who, data) {
      exactKeys(data, ['sin']);
      const number = normalizeSin(data.sin);
      const { id, kmsKey } = await db.runTransaction(async (tx) => {
        const release = await policyIn(tx);
        const { entry, existing } = await invitation(tx, who);
        if (existing) deny('already-exists');
        return { id: entry.invitationId, kmsKey: release.kmsKey };
      });
      const dataKey = randomBytes(32);
      let envelope;
      try {
        const iv = randomBytes(12);
        const cipher = createCipheriv('aes-256-gcm', dataKey, iv);
        cipher.setAAD(aad(id));
        const ciphertext = Buffer.concat([cipher.update(number, 'ascii'), cipher.final()]);
        envelope = { ciphertext, iv, tag: cipher.getAuthTag(),
          wrappedKey: await key(kmsKey, 'encrypt').wrap(dataKey, aad(id)) };
      } finally {
        dataKey.fill(0);
      }
      await db.runTransaction(async (tx) => {
        const release = await policyIn(tx);
        const { ref, entry, existing } = await invitation(tx, who);
        if (entry.invitationId !== id || release.kmsKey !== kmsKey) deny();
        if (existing) deny('already-exists');
        tx.create(payload(id), envelope);
        tx.create(submission(id), { status: 'submitted', at: now() });
        tx.update(ref, { firstSignInAt: entry.firstSignInAt || now(), authenticationProvider: who.providerId });
        audit(tx, who, id, 'submitted');
      });
      return { accepted: true };
    },
    async reveal(who, data, authorizeTx) {
      exactKeys(data, ['invitationId']);
      const id = data.invitationId;
      if (typeof id !== 'string' || !guid.test(id)) deny('invalid-argument');
      checkFresh(who.authTime, clock(), 300);
      const { envelope, kmsKey } = await db.runTransaction(async (tx) => {
        await authorizeTx(tx);
        const release = await policyIn(tx);
        const [metadata, sealed] = await tx.getAll(submission(id), payload(id));
        if (metadata.data()?.status !== 'submitted' || metadata.data()?.retrievalStatus || !sealed.exists)
          deny('failed-precondition', 'This SIN is unavailable or has already been removed.', 'sin-unavailable');
        tx.delete(payload(id));
        tx.update(submission(id), { retrievalStatus: 'retrieved', disposalStatus: 'disposed', revealedAt: now() });
        audit(tx, who, id, 'sin_reveal_consumed');
        return { envelope: sealed.data(), kmsKey: release.kmsKey };
      });
      // The active encrypted payload and key are already gone, including if the response fails.
      let dataKey;
      let plaintext;
      try {
        dataKey = await key(kmsKey, 'decrypt').unwrap(envelope.wrappedKey, aad(id));
        const decipher = createDecipheriv('aes-256-gcm', dataKey, envelope.iv);
        decipher.setAAD(aad(id));
        decipher.setAuthTag(envelope.tag);
        plaintext = decipher.update(envelope.ciphertext);
        decipher.final();
        if (plaintext.length !== 9) throw new Error();
        await db.runTransaction(async (tx) => {
          await authorizeTx(tx);
          await policyIn(tx);
        });
        checkFresh(who.authTime, clock(), 300);
        return { sin: plaintext.toString('ascii') };
      } catch {
        deny('failed-precondition', 'The one-time reveal was consumed, but the value could not be delivered.', 'sin-delivery');
      } finally {
        dataKey?.fill(0);
        plaintext?.fill(0);
      }
    },
  };
}
