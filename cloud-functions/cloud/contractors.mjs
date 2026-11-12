import { randomUUID } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { deny, checkFresh } from '../../functions/lib/security.mjs';
import { accessStatus, accessExplanation, DEFAULT_INVITATION_DAYS } from '../../functions/lib/contractor-access.mjs';
import { exactKeys } from './gates.mjs';
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const phrases = { restore: 'RESTORE ACCESS', renew: 'RENEW INVITATIONS', revoke: 'REVOKE ACCESS' };
export function invitationExpiry(value, now) {
  const expiry = value === undefined ? now + DEFAULT_INVITATION_DAYS * 86400000 : typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(expiry) || expiry <= now || expiry > now + 366 * 86400000)
    deny('invalid-argument', 'Choose a future expiry within the next year.', 'contractor-manage');
  return Timestamp.fromMillis(expiry);
}
const fingerprint = (entry) => JSON.stringify([entry.invitationId, entry.status, entry.revision ?? null, entry.expiresAt?.toMillis() ?? null]);
export function createContractorAccess({ db, clock }) {
  const at = () => Timestamp.fromMillis(clock());
  const audit = (tx, who, event, invitationId, extra = {}) => tx.create(db.collection('auditEvents').doc(), { actorUid: who.uid, event, invitationId, at: at(), ...extra });
  return {
    async review(who, data, authorize) {
      checkFresh(who.authTime, clock(), 300);
      exactKeys(data, ['action', 'invitationIds', 'expiresAt']);
      if (!Object.hasOwn(phrases, data.action) || !Array.isArray(data.invitationIds) || !data.invitationIds.length || data.invitationIds.length > 25 ||
          new Set(data.invitationIds).size !== data.invitationIds.length || data.invitationIds.some((id) => typeof id !== 'string' || !uuid.test(id)))
        deny('invalid-argument', 'Review 1–25 distinct contractor records at a time.', 'contractor-manage');
      if (data.action !== 'renew' && data.expiresAt !== undefined) deny('invalid-argument');
      const expiry = data.action === 'renew' ? invitationExpiry(data.expiresAt, clock()) : null;
      const reviewId = randomUUID();
      return db.runTransaction(async (tx) => {
        await authorize(tx);
        const docs = await tx.get(db.collection('allowlist').where('invitationId', 'in', data.invitationIds));
        if (docs.size !== data.invitationIds.length) deny('failed-precondition', 'A contractor record changed. Refresh and review again.', 'contractor-manage');
        const legacy = await tx.getAll(...docs.docs.map((d) => db.doc('submissions/' + d.data().invitationId)));
        const reviewed = docs.docs.map((doc, i) => {
          const entry = doc.data(), status = accessStatus(entry, clock());
          let reason = '';
          if (data.action === 'restore') {
            if (entry.status !== 'revoked') reason = 'Only explicitly revoked records can be restored. ' + accessExplanation(status);
            else if (legacy[i].data()?.status === 'correction_requested') reason = 'A submission correction hold requires owner review. It cannot be restored here.';
          } else if (data.action === 'renew') {
            if (entry.status !== 'active') reason = 'Restore revoked approval in a separate review before renewing. Removed or invalid records require owner review.';
          } else if (!['active', 'revoked'].includes(entry.status)) reason = 'Removed or invalid records cannot be changed here.';
          return { doc, entry, status, reason };
        });
        const eligible = reviewed.filter((r) => !r.reason);
        if (eligible.length) {
          tx.create(db.doc('contractorReviews/' + reviewId), { actorUid: who.uid, action: data.action, expiresAt: Timestamp.fromMillis(clock() + 600000),
            newExpiry: expiry, applied: false, entries: eligible.map((r) => ({ key: r.doc.id, invitationId: r.entry.invitationId, fingerprint: fingerprint(r.entry) })),
            skipped: reviewed.filter((r) => r.reason).map((r) => ({ invitationId: r.entry.invitationId, reason: r.reason })) });
          audit(tx, who, 'contractor_access_reviewed', null, { action: data.action, reviewId, count: eligible.length });
        }
        return { reviewId: eligible.length ? reviewId : null, action: data.action, requiredConfirmation: phrases[data.action],
          newExpiry: expiry?.toDate().toISOString() ?? null,
          rows: reviewed.map((r) => ({ invitationId: r.entry.invitationId, name: r.entry.name || '', email: r.entry.email,
            accessStatus: r.status, expiresAt: r.entry.expiresAt?.toDate().toISOString() ?? null, eligible: !r.reason, reason: r.reason ||
              (data.action === 'restore' ? 'Expiry is unchanged. Expired access still requires a separate renewal.' : data.action === 'renew' ? 'Only the expiry date will change.' : 'Access will be revoked; assignments and submissions stay intact.') })) };
      });
    },
    async apply(who, data, authorize) {
      checkFresh(who.authTime, clock(), 300);
      exactKeys(data, ['reviewId', 'confirmation']);
      if (typeof data.reviewId !== 'string' || data.reviewId.length !== 36 || !uuid.test(data.reviewId)) deny('invalid-argument');
      return db.runTransaction(async (tx) => {
        await authorize(tx);
        const ref = db.doc('contractorReviews/' + data.reviewId), snapshot = await tx.get(ref), review = snapshot.data();
        if (!review || review.actorUid !== who.uid || data.confirmation !== phrases[review.action])
          deny('permission-denied', 'This review is not authorized for this administrator.', 'contractor-manage');
        if (review.applied) return { ...review.result, replayed: true };
        if (review.expiresAt.toMillis() <= clock()) deny('failed-precondition', 'The review expired. Preview the action again.', 'contractor-manage');
        const docs = await tx.getAll(...review.entries.map((e) => db.doc('allowlist/' + e.key)));
        const legacy = await tx.getAll(...review.entries.map((e) => db.doc('submissions/' + e.invitationId)));
        docs.forEach((doc, i) => {
          if (!doc.exists || fingerprint(doc.data()) !== review.entries[i].fingerprint ||
              (review.action === 'restore' && legacy[i].data()?.status === 'correction_requested'))
            deny('failed-precondition', 'A reviewed record changed. Refresh and preview again; nothing was applied.', 'contractor-manage');
        });
        if (review.action === 'renew' && review.newExpiry.toMillis() <= clock()) deny('failed-precondition', 'Choose a new future expiry.', 'contractor-manage');
        for (const doc of docs) {
          const entry = doc.data();
          const change = review.action === 'restore' ? { status: 'active' } : review.action === 'renew' ? { expiresAt: review.newExpiry } :
            { status: 'revoked', revision: (Number.isSafeInteger(entry.revision) ? entry.revision : 0) + 1 };
          // Update only approved access fields. Never touch IDs, bindings, slots,
          // ciphertext, file metadata, consumed payloads or existing assignments.
          tx.update(doc.ref, { ...change, updatedAt: at() });
          audit(tx, who, { restore: 'contractor_access_restored', renew: 'invitation_renewed', revoke: 'invitation_revoked' }[review.action], entry.invitationId,
            { reviewId: data.reviewId, previousStatus: entry.status, previousExpiry: entry.expiresAt ?? null, newExpiry: change.expiresAt ?? entry.expiresAt ?? null });
        }
        const result = { action: review.action, applied: review.entries.map((r) => r.invitationId), skipped: review.skipped };
        tx.update(ref, { applied: true, appliedAt: at(), result });
        return { ...result, replayed: false };
      });
    },
  };
}
