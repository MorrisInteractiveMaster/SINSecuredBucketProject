import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { deny, emailKey } from '../../functions/lib/security.mjs';

const lifetime = 10 * 60_000;
const binding = (who, entry) => ({
  uid: who.uid, provider: who.providerId, providerUid: who.providerUid,
  authTime: who.authTime, invitationId: entry.invitationId, revision: entry.revision ?? 0,
});
const matches = (saved, who, entry) =>
  Object.entries(binding(who, entry)).every(([key, value]) => saved?.[key] === value);

export function createMailboxProof({ db, clock, mailer, secret }) {
  const refFor = (who) => db.doc('bucketMailboxProof/' + emailKey(who.email));
  const digest = (key, nonce, code) => createHmac('sha256', key)
    .update('bucket-mailbox-v1\0' + nonce + '\0' + code).digest();
  const ready = () => {
    const key = secret?.();
    if (typeof key !== 'string' || !/^[a-f0-9]{64}$/i.test(key) || !mailer)
      deny('unavailable', 'Mailbox verification is unavailable.', 'bucket-mail');
    return Buffer.from(key, 'hex');
  };
  return {
    async verified(tx, who, entry) {
      if (who.verifiedLinkedMailbox) return true;
      const proof = (await tx.get(refFor(who))).data();
      return proof?.verified === true && matches(proof, who, entry) && proof.expiresAt.toMillis() > clock();
    },
    async issue(who, authorize) {
      const key = ready();
      const code = String(randomInt(0, 100_000_000)).padStart(8, '0');
      const nonce = randomUUID();
      await db.runTransaction(async (tx) => {
        const { entry } = await authorize(tx);
        const ref = refFor(who);
        const previous = (await tx.get(ref)).data();
        const at = clock();
        const day = Math.floor(at / 86_400_000);
        const count = previous?.day === day ? previous.count : 0;
        if ((previous?.sentAt ?? 0) + 60_000 > at || count >= 8)
          deny('resource-exhausted', 'Wait before requesting a new code.', 'bucket-mail-rate');
        tx.set(ref, { ...binding(who, entry), nonce, hash: digest(key, nonce, code),
          sentAt: at, expiresAt: Timestamp.fromMillis(at + lifetime), day, count: count + 1,
          attempts: 0, verified: false });
      });
      try {
        await mailer(who.email, code, nonce);
      } catch {
        deny('unavailable', 'Verification email could not be sent. Wait a minute and try again.', 'bucket-mail');
      }
      return { sent: true };
    },
    async confirm(who, code, authorize) {
      if (typeof code !== 'string' || !/^\d{8}$/.test(code))
        deny('invalid-argument', 'Enter the eight-digit verification code.', 'bucket-code');
      const key = ready();
      const verified = await db.runTransaction(async (tx) => {
        const { entry } = await authorize(tx);
        const ref = refFor(who);
        const current = (await tx.get(ref)).data();
        if (!matches(current, who, entry) || current.verified || current.attempts >= 5 ||
            current.expiresAt.toMillis() <= clock()) return false;
        const valid = timingSafeEqual(Buffer.from(current.hash), digest(key, current.nonce, code));
        tx.update(ref, valid ? { verified: true, hash: null } : { attempts: current.attempts + 1 });
        return valid;
      });
      if (!verified) deny('permission-denied', 'The code is invalid or expired.', 'bucket-code');
    },
  };
}
