import { randomUUID, randomInt, createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { parseAllowlistCsv } from './csv.mjs';
import {
  emailKey,
  checkProvider,
  checkFresh,
  challengeHash,
  sameDigest,
  assertSynthetic,
  deny,
} from './security.mjs';
const ms = (value) =>
  typeof value?.toMillis === 'function' ? value.toMillis() : 0;
export function createService({
  db,
  clock = Date.now,
  pepper,
  sendCode,
  tenantId,
  policyMode = 'synthetic-emulator-only',
  invitationWriteGuard,
}) {
  const ref = (c, id) => db.collection(c).doc(id);
  const audit = (tx, who, event, invitationId = null) =>
    tx.create(ref('auditEvents', randomUUID()), {
      actorUid: who.uid,
      event,
      invitationId,
      at: Timestamp.fromMillis(clock()),
    });
  const loadEntry = async (tx, who) => {
    checkProvider(who.providerId);
    checkFresh(who.authTime, clock());
    const key = emailKey(who.email),
      r = ref('allowlist', key),
      s = await tx.get(r),
      entry = s.data();
    if (!entry || entry.status !== 'active' || ms(entry.expiresAt) <= clock())
      deny();
    return { entry, key, r };
  };
  const admin = async (tx, who, permission) => {
    if (
      who.providerId !== 'microsoft.com' ||
      !who.organization?.member ||
      who.organization.tenantId !== tenantId
    )
      deny();
    checkFresh(who.authTime, clock());
    const s = await tx.get(ref('roles', who.uid)),
      role = s.data();
    if (
      !role?.active ||
      role.tenantId !== tenantId ||
      role.objectId !== who.organization.objectId ||
      role[permission] !== true
    )
      deny();
    return role;
  };
  const owned = async (tx, who) => {
    const a = await loadEntry(tx, who),
      s = (await tx.get(ref('portalSessions', who.uid))).data();
    if (
      !s ||
      s.emailKey !== a.key ||
      s.providerId !== who.providerId ||
      s.revision !== a.entry.revision ||
      ms(s.proofExpiresAt) <= clock() ||
      s.ownershipVerified !== true
    )
      deny('failed-precondition', 'Verify your approved email to continue.');
    return a;
  };
  const publishSession = (tx, who, a) =>
    tx.set(ref('portalSessions', who.uid), {
      uid: who.uid,
      email: who.email,
      emailKey: a.key,
      invitationId: a.entry.invitationId,
      providerId: who.providerId,
      revision: a.entry.revision,
      ownershipVerified: true,
      proofExpiresAt: Timestamp.fromMillis(clock() + 15 * 60000),
    });
  return {
    authorizeTx: admin,
    async authorize(who, permission) {
      return db.runTransaction((tx) => admin(tx, who, permission));
    },
    async context(who) {
      // Admin check does not infer privileges from email, provider alone or a domain.
      const role = await db.runTransaction(async (tx) => {
        try {
          return await admin(tx, who, 'statusViewing');
        } catch {
          return null;
        }
      });
      // Managers who lack status permission may still import but cannot list contractors.
      const manageRole =
        role ||
        (await db.runTransaction(async (tx) => {
          try {
            return await admin(tx, who, 'invitationManagement');
          } catch {
            return null;
          }
        }));
      if (manageRole)
        return {
          kind: 'admin',
          uid: who.uid,
          displayLabel: manageRole.displayLabel || 'MI administrator',
          permissions: {
            administratorManagement: manageRole.administratorManagement === true,
            invitationManagement: manageRole.invitationManagement === true,
            statusViewing: manageRole.statusViewing === true,
            sensitiveRetrieval: manageRole.sensitiveRetrieval === true,
            correctionManagement: manageRole.correctionManagement === true,
            metadataCopy: manageRole.metadataCopy === true,
            metadataExport: manageRole.metadataExport === true,
            auditViewing: manageRole.auditViewing === true,
            workflowManagement: manageRole.workflowManagement === true,
          },
        };
      return db.runTransaction(async (tx) => {
        const a = await loadEntry(tx, who),
          slot = (
            await tx.get(ref('submissionSlots', a.entry.invitationId))
          ).data(),
          session = (await tx.get(ref('portalSessions', who.uid))).data(),
          policy = (await tx.get(ref('policy', 'mvp'))).data();
        if (!policy?.publicKey || policy.mode !== policyMode)
          deny('failed-precondition', 'Local setup is incomplete.');
        const proof =
          who.emailTrusted === true ||
          (session?.emailKey === a.key &&
            session.providerId === who.providerId &&
            session.revision === a.entry.revision &&
            session.ownershipVerified === true &&
            ms(session.proofExpiresAt) > clock());
        if (proof && (a.entry.lastAuthenticatedAt || 0) < who.authTime) {
          tx.update(a.r, {
            firstSignInAt:
              a.entry.firstSignInAt || Timestamp.fromMillis(clock()),
            lastSignInAt: Timestamp.fromMillis(clock()),
            lastAuthenticatedAt: who.authTime,
            authenticationProvider: who.providerId,
            lastSignInUid: who.uid,
          });
          audit(tx, who, 'contractor_signed_in', a.entry.invitationId);
        }
        if (proof && who.emailTrusted === true) publishSession(tx, who, a);
        return {
          kind: 'contractor',
          email: who.email,
          authorized: true,
          needsVerification: !proof,
          submitted: proof && !!slot,
          invitationId: a.entry.invitationId,
          reference: a.entry.reference,
          revision: a.entry.revision,
          keyId: policy.keyId,
          publicKey: proof ? policy.publicKey : null,
        };
      });
    },
    async beginVerification(who) {
      const code = String(randomInt(10000000, 100000000)),
        nonce = randomUUID();
      const result = await db.runTransaction(async (tx) => {
        const a = await loadEntry(tx, who),
          limitRef = ref('mailLimits', a.key),
          l = (await tx.get(limitRef)).data() || {},
          now = clock();
        const hourly = ms(l.hourStart) > now - 3600000 ? l.hourCount : 0,
          daily = ms(l.dayStart) > now - 86400000 ? l.dayCount : 0;
        if (ms(l.nextSend) > now || hourly >= 3 || daily >= 10)
          deny('resource-exhausted', 'Wait before requesting another code.');
        tx.set(limitRef, {
          nextSend: Timestamp.fromMillis(now + 60000),
          hourStart: hourly ? l.hourStart : Timestamp.fromMillis(now),
          hourCount: hourly + 1,
          dayStart: daily ? l.dayStart : Timestamp.fromMillis(now),
          dayCount: daily + 1,
        });
        tx.set(ref('verificationChallenges', who.uid), {
          emailKey: a.key,
          providerId: who.providerId,
          revision: a.entry.revision,
          nonce,
          digest: challengeHash(pepper, who.uid, who.providerId, nonce, code),
          attempts: 0,
          expiresAt: Timestamp.fromMillis(now + 600000),
          consumed: false,
        });
        return { email: who.email };
      });
      try {
        await sendCode({ uid: who.uid, to: result.email, code });
      } catch {
        await db.runTransaction(async (tx) => {
          const r = ref('verificationChallenges', who.uid),
            s = await tx.get(r);
          if (s.data()?.nonce === nonce) tx.delete(r);
        });
        deny('unavailable', 'The verification email could not be sent.');
      }
      return { sent: true };
    },
    async verify(who, code) {
      if (typeof code !== 'string' || !/^\d{8}$/.test(code))
        deny('invalid-argument', 'Enter the eight-digit code.');
      const accepted = await db.runTransaction(async (tx) => {
        const a = await loadEntry(tx, who),
          r = ref('verificationChallenges', who.uid),
          s = (await tx.get(r)).data();
        if (
          !s ||
          s.consumed ||
          s.attempts >= 5 ||
          ms(s.expiresAt) <= clock() ||
          s.emailKey !== a.key ||
          s.providerId !== who.providerId ||
          s.revision !== a.entry.revision
        )
          return false;
        const valid = sameDigest(
          s.digest,
          challengeHash(pepper, who.uid, who.providerId, s.nonce, code),
        );
        tx.update(r, { attempts: s.attempts + 1, consumed: valid });
        if (valid) publishSession(tx, who, a);
        return valid;
      });
      if (!accepted)
        deny('permission-denied', 'The code is invalid or expired.');
      return { verified: true };
    },
    async importCsv(who, csv, { approveDedicatedTesters = false, createOnly = false, renameOnly = false } = {}) {
      let rows;
      try {
        rows = parseAllowlistCsv(csv);
      } catch (error) {
        deny('invalid-argument', error.message, 'invitation-csv');
      }
      if (approveDedicatedTesters && rows.some((row) =>
        !row.email.endsWith('@gmail.com') || !['', 'Test account', 'Test Google'].includes(row.name)
      )) deny('invalid-argument', 'Use dedicated Gmail test accounts and synthetic labels.');
      const newIds = rows.map(() => ({
        invitationId: randomUUID(),
        reference: randomUUID(),
      }));
      await db.runTransaction(async (tx) => {
        await admin(tx, who, 'invitationManagement');
        if (invitationWriteGuard) await invitationWriteGuard(tx, who);
        if (approveDedicatedTesters) await admin(tx, who, 'administratorManagement');
        const refs = rows.map((row) => ref('allowlist', emailKey(row.email))),
          snapshots = await tx.getAll(...refs);
        rows.forEach((row, i) => {
          const old = snapshots[i].data();
          if (createOnly && old) deny('already-exists',
            'Row ' + (i + 2) + ' already has an invitation. Edit the existing contractor instead.', 'invitation-duplicate');
          if (renameOnly) {
            if (!old) deny('not-found', 'The contractor invitation no longer exists.');
            tx.update(refs[i], { name: row.name, updatedAt: Timestamp.fromMillis(clock()) });
            audit(tx, who, 'invitation_updated', old.invitationId);
            return;
          }
          // Reimport/soft removal NEVER deletes a consumed slot or issues a fresh ID.
          tx.set(refs[i], {
            ...row,
            dedicatedTestApproved: approveDedicatedTesters || old?.dedicatedTestApproved === true,
            ...(old?.dedicatedTestUid ? {
              dedicatedTestUid: old.dedicatedTestUid,
              dedicatedTestProviderUid: old.dedicatedTestProviderUid,
            } : {}),
            ...(old
              ? { invitationId: old.invitationId, reference: old.reference }
              : newIds[i]),
            revision: (old?.revision || 0) + 1,
            expiresAt:
              old?.expiresAt || Timestamp.fromMillis(clock() + 72 * 3600000),
            createdAt: old
              ? old.createdAt || null
              : Timestamp.fromMillis(clock()),
            responsibleAdminUid: old?.responsibleAdminUid || who.uid,
            ...(old
              ? {
                  firstSignInAt: old.firstSignInAt || null,
                  lastSignInAt: old.lastSignInAt || null,
                  lastAuthenticatedAt: old.lastAuthenticatedAt || 0,
                  authenticationProvider: old.authenticationProvider || null,
                  lastSignInUid: old.lastSignInUid || null,
                }
              : {}),
            updatedAt: Timestamp.fromMillis(clock()),
          });
          audit(
            tx,
            who,
            old
              ? row.status === 'revoked'
                ? 'invitation_revoked'
                : row.status === 'removed'
                  ? 'invitation_removed'
                  : 'invitation_updated'
              : 'invitation_created',
            old?.invitationId || newIds[i].invitationId,
          );
        });
        audit(tx, who, 'allowlist_imported');
      });
      return { imported: rows.length };
    },
    async list(who) {
      return db.runTransaction(async (tx) => {
        await admin(tx, who, 'statusViewing');
        const entries = await tx.get(db.collection('allowlist').limit(100));
        const slotRefs = entries.docs.map((x) =>
            ref('submissionSlots', x.data().invitationId),
          ),
          statusRefs = entries.docs.map((x) =>
            ref('submissions', x.data().invitationId),
          );
        const all = slotRefs.length
            ? await tx.getAll(...slotRefs, ...statusRefs)
            : [],
          slots = all.slice(0, slotRefs.length),
          statuses = all.slice(slotRefs.length);
        return {
          contractors: entries.docs.map((d, i) => {
            const e = d.data();
            return {
              name: e.name,
              email: e.email,
              status: e.status,
              invitationId: e.invitationId,
              reference: e.reference,
              revision: e.revision,
              submissionStatus:
                statuses[i]?.data()?.status ||
                (slots[i]?.exists ? 'submitted' : 'pending'),
            };
          }),
        };
      });
    },
    async submit(who, data) {
      // Only synthetic values may reach this local MVP. Not a production ciphertext-content proof.
      assertSynthetic(data.syntheticValue);
      if (
        typeof data.ciphertext !== 'string' ||
        !/^([A-Za-z0-9+/]{4}){170}[A-Za-z0-9+/]{3}=$/.test(data.ciphertext) ||
        Buffer.from(data.ciphertext, 'base64').length !== 512 ||
        typeof data.invitationId !== 'string' ||
        typeof data.keyId !== 'string'
      )
        deny('invalid-argument', 'Invalid encrypted submission.');
      await db.runTransaction(async (tx) => {
        const a = await owned(tx, who),
          slotRef = ref('submissionSlots', a.entry.invitationId),
          slot = await tx.get(slotRef),
          policy = (await tx.get(ref('policy', 'mvp'))).data();
        if (
          a.entry.invitationId !== data.invitationId ||
          data.revision !== a.entry.revision ||
          policy?.keyId !== data.keyId
        )
          deny();
        if (slot.exists)
          deny('already-exists', 'This invitation has already been submitted.');
        const at = Timestamp.fromMillis(clock());
        tx.create(slotRef, { uid: who.uid, reference: a.entry.reference, at });
        tx.create(ref('encryptedRecords', a.entry.invitationId), {
          ciphertext: Buffer.from(data.ciphertext, 'base64'),
          keyId: data.keyId,
          version: 1,
          at,
          retentionDueAt: Timestamp.fromMillis(clock() + 7 * 86400000),
        });
        tx.create(ref('submissions', a.entry.invitationId), {
          uid: who.uid,
          emailKey: a.key,
          reference: a.entry.reference,
          status: 'submitted',
          at,
        });
        audit(tx, who, 'submission_accepted', a.entry.invitationId);
      });
      return { submitted: true };
    },
    async correction(who, invitationId) {
      if (typeof invitationId !== 'string' || invitationId.length !== 36)
        deny('invalid-argument');
      await db.runTransaction(async (tx) => {
        await admin(tx, who, 'correctionManagement');
        const es = await tx.get(
          db
            .collection('allowlist')
            .where('invitationId', '==', invitationId)
            .limit(1),
        );
        const slot = await tx.get(ref('submissionSlots', invitationId)),
          status = await tx.get(ref('submissions', invitationId));
        if (es.empty || !slot.exists || !status.exists)
          deny('failed-precondition', 'No completed submission is eligible.');
        const e = es.docs[0];
        tx.update(e.ref, {
          status: 'revoked',
          revision: e.data().revision + 1,
          updatedAt: Timestamp.fromMillis(clock()),
        });
        tx.update(status.ref, { status: 'correction_requested' });
        audit(tx, who, 'correction_requested', invitationId);
        // No deletion, reissue or second submission; disposal and new invitation require review.
      });
      return { requested: true };
    },
    async sensitive(who) {
      await db.runTransaction((tx) => admin(tx, who, 'sensitiveRetrieval'));
      deny(
        'failed-precondition',
        'Sensitive retrieval remains disabled pending step-up and security review.',
      );
    },
  };
}
