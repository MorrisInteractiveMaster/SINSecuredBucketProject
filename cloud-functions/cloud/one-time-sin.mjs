import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { createCloudKmsCustody, cryptoKeyPattern } from '../../functions/lib/kms.mjs';
import { checkFresh, deny, emailKey, normalizeSin } from '../../functions/lib/security.mjs';
import { defaultBucketField, bucketFieldTypes, validBucketLabel, validBucketValue } from '../../functions/lib/bucket-field.mjs';
import { createMailboxProof } from './mailbox-proof.mjs';
import { exactKeys } from './gates.mjs';

const guid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const aad = (id) => Buffer.from('mi-sin-portal:one-time:v1:' + id);
export const liveSinRelease = (policy) => policy?.enabled === true &&
  guid.test(policy.approvalReference || '') && cryptoKeyPattern.test(policy.kmsKey || '');

export function createOneTimeSin({ db, clock, credential, custody, kmsFetcher, mailer, verificationSecret }) {
  const releaseRef = db.doc('policy/sin-release');
  const fieldRef = db.doc('policy/bucket-field');
  const mailbox = createMailboxProof({ db, clock, mailer, secret: verificationSecret });
  const readField = async (tx) => (await tx.get(fieldRef)).data() ?? defaultBucketField;
  const staffPolicyRef = db.doc('policy/access');
  const key = custody ?? ((kmsKey, operation) => createCloudKmsCustody({ cryptoKey: kmsKey, operation, credential, fetcher: kmsFetcher }));
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
    const ref = db.doc('allowlist/' + emailKey(who.email));
    const entry = (await tx.get(ref)).data();
    if (entry?.status !== 'active' || !guid.test(entry.invitationId || '') ||
        entry.expiresAt?.toMillis() <= clock() || !entry.expiresAt) deny();
    return { ref, entry, existing: (await tx.get(submission(entry.invitationId))).data() };
  }
  const authorizeMailbox = (who) => async (tx) => {
    await policyIn(tx);
    const result = await invitation(tx, who);
    if (await mailbox.verified(tx, who, result.entry)) deny('failed-precondition');
    return result;
  };
  return {
    mailboxVerified: (tx, who, entry) => mailbox.verified(tx, who, entry),
    enabled: async () => liveSinRelease((await releaseRef.get()).data()),
    field: async () => readField({ get: (ref) => ref.get() }),
    configure: (who, data, authorizeTx) => db.runTransaction(async (tx) => {
      exactKeys(data, ['label', 'type']);
      await authorizeTx(tx);
      if (!validBucketLabel(data.label) || typeof data.type !== 'string' || !Object.hasOwn(bucketFieldTypes, data.type))
        deny('invalid-argument', 'Enter a valid field label and type.');
      const field = { label: data.label.trim(), type: data.type, revision: randomUUID() };
      tx.set(fieldRef, field);
      audit(tx, who, null, 'bucket_field_configured');
      return field;
    }),
    context: (who) => db.runTransaction(async (tx) => {
      await policyIn(tx);
      const { entry, existing } = await invitation(tx, who);
      const verified = await mailbox.verified(tx, who, entry);
      return { kind: 'contractor', liveSin: true, needsVerification: !verified,
        submitted: verified && Boolean(existing), bucketField: await readField(tx) };
    }),
    issueCode(who, data) {
      exactKeys(data, []);
      return mailbox.issue(who, authorizeMailbox(who));
    },
    async verifyCode(who, data) {
      exactKeys(data, ['code']);
      // Check the invitation even when the code is wrong; no disclosure to outsiders.
      await mailbox.confirm(who, data.code, async (tx) => {
        await policyIn(tx);
        return invitation(tx, who);
      });
      return this.context(who);
    },
    async submit(who, data) {
      exactKeys(data, ['value', 'revision']);
      const { id, kmsKey, field } = await db.runTransaction(async (tx) => {
        const release = await policyIn(tx);
        const { entry, existing } = await invitation(tx, who);
        if (!await mailbox.verified(tx, who, entry)) deny('permission-denied', 'Verify your mailbox first.', 'bucket-code');
        if (existing) deny('already-exists');
        const field = await readField(tx);
        if (field.revision !== data.revision) deny('failed-precondition', 'The requested field changed. Reload the portal.', 'bucket-field-changed');
        return { id: entry.invitationId, kmsKey: release.kmsKey, field };
      });
      if (!validBucketValue(data.value, field.type))
        deny('invalid-argument', 'Check the requested value format.', 'bucket-value');
      const value = field.type === 'sin' ? normalizeSin(data.value) : data.value;
      const dataKey = randomBytes(32);
      let envelope;
      try {
        const iv = randomBytes(12);
        const cipher = createCipheriv('aes-256-gcm', dataKey, iv);
        cipher.setAAD(aad(id));
        const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
        envelope = { ciphertext, iv, tag: cipher.getAuthTag(),
          wrappedKey: await key(kmsKey, 'encrypt').wrap(dataKey, aad(id)) };
      } finally {
        dataKey.fill(0);
      }
      await db.runTransaction(async (tx) => {
        const release = await policyIn(tx);
        const { ref, entry, existing } = await invitation(tx, who);
        if (!await mailbox.verified(tx, who, entry)) deny();
        if ((await readField(tx)).revision !== field.revision)
          deny('failed-precondition', 'The requested field changed. Reload the portal.', 'bucket-field-changed');
        if (entry.invitationId !== id || release.kmsKey !== kmsKey) deny();
        if (existing) deny('already-exists');
        tx.create(payload(id), envelope);
        tx.create(submission(id), { status: 'submitted', at: now(), fieldType: field.type });
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
          deny('failed-precondition', 'This value is unavailable or has already been removed.', 'sin-unavailable');
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
        if (plaintext.length < 1 || plaintext.length > 4096) throw new Error();
        await db.runTransaction(async (tx) => {
          await authorizeTx(tx);
          await policyIn(tx);
        });
        checkFresh(who.authTime, clock(), 300);
        return { value: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(plaintext) };
      } catch {
        deny('failed-precondition', 'The one-time reveal was consumed, but the value could not be delivered.', 'sin-delivery');
      } finally {
        dataKey?.fill(0);
        plaintext?.fill(0);
      }
    },
  };
}
