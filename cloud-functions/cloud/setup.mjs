import { createHash, generateKeyPair, randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { Timestamp } from 'firebase-admin/firestore';
import { deny, emailKey, sameDigest, checkFresh } from '../../functions/lib/security.mjs';
import { initialRoster, initialOwnerKey } from '../../functions/lib/admin-roster.mjs';
import { TARGET, assertRelease, exactKeys } from './gates.mjs';

const keyPair = promisify(generateKeyPair);
const hour = 3600000;
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function activationConfigured(config, now) {
  const expiry = Date.parse(config?.expiresAt);
  return /^[0-9a-f]{64}$/.test(config?.digest || '') &&
    guid.test(config?.tenantId || '') && guid.test(config?.clientId || '') &&
    expiry > now && expiry <= now + 24 * hour;
}
function roleFor(who, owner) {
  return {
    active: true,
    tenantId: who.organization.tenantId,
    objectId: who.organization.objectId,
    displayLabel: who.email.split('@')[0],
    invitationManagement: true,
    statusViewing: true,
    correctionManagement: true,
    metadataCopy: true,
    metadataExport: true,
    auditViewing: true,
    workflowManagement: true,
    administratorManagement: owner,
    sensitiveRetrieval: false,
  };
}
function writeBinding(tx, db, who, owner, now) {
  tx.create(db.doc('roles/' + who.uid), roleFor(who, owner));
  tx.create(db.doc('testIdentities/' + who.uid), {
    email: who.email,
    active: true,
    purpose: 'dedicated-synthetic-test',
    ownershipVerified: true,
    providerIds: ['microsoft.com'],
    providerUids: { 'microsoft.com': who.providerUid },
    attestedAt: Timestamp.fromMillis(now),
  });
}
function audit(tx, db, who, event, now) {
  tx.create(db.collection('auditEvents').doc(), {
    actorUid: who.uid, event, at: Timestamp.fromMillis(now), invitationId: null,
  });
}
export function createSetup({ db, clock, projectId, emulator, config, verifyMicrosoft, roster = initialRoster, ownerKey = initialOwnerKey }) {
  const lockRef = db.doc('policy/bootstrap');
  const policyRef = db.doc('policy/cloud-test');
  const mvpRef = db.doc('policy/mvp');
  const rosterRef = (key) => db.doc('approvedAdministrators/' + key);
  const approved = (who) => roster.some(({ key }) => key === emailKey(who.email));
  const isOwner = (who) => emailKey(who.email) === ownerKey;
  async function proof(who, token, tenantId, clientId) {
    if (who.providerId !== 'microsoft.com' || !who.microsoftMailboxMatched || !approved(who)) deny();
    checkFresh(who.authTime, clock(), 600);
    const org = await verifyMicrosoft(token, { tenantId, clientId, providerUid: who.providerUid });
    if (!org.member || org.tenantId !== tenantId || org.objectId !== who.providerUid || org.accountEmail !== who.email) deny();
    return { ...who, organization: org };
  }
  async function activate(who, token, data) {
    exactKeys(data, ['code']);
    if (!isOwner(who) || !activationConfigured(config, clock())) deny();
    const member = await proof(who, token, config.tenantId, config.clientId);
    const attemptRef = db.doc('testLimits/owner-activation');
    await db.runTransaction(async (tx) => {
      const previous = await tx.get(attemptRef);
      const now = clock();
      const active = previous.data()?.until?.toMillis() > now;
      const count = active ? previous.data().count : 0;
      if (count >= 6) deny('resource-exhausted', 'Wait a minute before retrying owner activation.');
      const attempt = { count: count + 1, until: active ? previous.data().until : Timestamp.fromMillis(now + 60000) };
      if (previous.exists) tx.update(attemptRef, attempt);
      else tx.create(attemptRef, attempt);
    });
    if (typeof data.code !== 'string' || !/^[0-9a-f]{64}$/.test(data.code) ||
        !sameDigest(createHash('sha256').update(data.code).digest('hex'), config.digest)) deny();
    const current = await lockRef.get();
    if (current.data()?.phase4 === true) deny('failed-precondition', 'Owner setup has already been completed.');
    const { publicKey } = current.exists ? {} : await keyPair('rsa', { modulusLength: 4096 });
    await db.runTransaction(async (tx) => {
      const roleRef = db.doc('roles/' + member.uid);
      const identityRef = db.doc('testIdentities/' + member.uid);
      const [lock, policy, mvp, role, identity, ...rosterSnapshots] = await tx.getAll(
        lockRef, policyRef, mvpRef, roleRef, identityRef, ...roster.map(({ key }) => rosterRef(key)),
      );
      const now = clock();
      if (!activationConfigured(config, now) || lock.data()?.phase4 || rosterSnapshots.some((s) => s.exists)) deny();
      if (lock.exists) {
        const previous = policy.data();
        const priorRole = role.data();
        const priorIdentity = identity.data();
        if (lock.data().adminUid !== member.uid || previous?.adminUid !== member.uid ||
            previous.projectId !== TARGET.projectId || previous.databaseId !== TARGET.databaseId ||
            previous.mode !== TARGET.mode || previous.tenantId !== config.tenantId ||
            previous.microsoftClientId !== config.clientId || previous.realCollectionEnabled !== false ||
            previous.sensitiveRetrievalEnabled !== false || previous.disposalEnabled !== false ||
            !mvp.exists || !priorRole?.active || priorRole.tenantId !== config.tenantId ||
            priorRole.objectId !== member.providerUid || priorIdentity?.email !== member.email ||
            priorIdentity.active !== true || priorIdentity.providerUids?.['microsoft.com'] !== member.providerUid ||
            (previous.adminUids || [member.uid]).some((uid) => uid !== member.uid)) {
          deny('failed-precondition', 'The existing portal setup requires an owner migration review.');
        }
        tx.update(lockRef, { phase4: true });
        tx.update(roleRef, roleFor(member, true));
        tx.update(policyRef, { adminUids: [member.uid] });
      } else {
        if (policy.exists || mvp.exists || role.exists || identity.exists || !publicKey) deny();
        const release = {
          projectId: TARGET.projectId, databaseId: TARGET.databaseId, mode: TARGET.mode,
          adminUid: member.uid, adminUids: [member.uid], tenantId: config.tenantId,
          microsoftClientId: config.clientId, enabled: true,
          financialReviewApproved: true, isolationReviewApproved: true,
          realCollectionEnabled: false, sensitiveRetrievalEnabled: false, disposalEnabled: false,
          expiresAt: Timestamp.fromMillis(Date.parse(config.expiresAt)),
        };
        assertRelease(release, projectId, now, emulator);
        tx.create(lockRef, { phase4: true, adminUid: member.uid, at: Timestamp.fromMillis(now) });
        tx.create(policyRef, { ...release, enabled: false });
        tx.create(mvpRef, { mode: TARGET.mode, keyId: randomUUID(), publicKey: publicKey.export({ format: 'jwk' }) });
        writeBinding(tx, db, member, true, now);
      }
      for (const { key, label } of roster) {
        tx.create(rosterRef(key), {
          key, label, active: true, owner: key === ownerKey,
          ...(key === ownerKey ? { uid: member.uid, objectId: member.providerUid } : {}),
        });
      }
      audit(tx, db, member, 'portal_setup_completed', now);
    });
    return { activated: true };
  }
  async function enroll(who, token, policy) {
    if (!approved(who)) deny();
    const member = await proof(who, token, policy.tenantId, policy.microsoftClientId);
    await db.runTransaction(async (tx) => {
      const ref = rosterRef(emailKey(member.email));
      const [row, release, role, identity] = await tx.getAll(ref, policyRef,
        db.doc('roles/' + member.uid), db.doc('testIdentities/' + member.uid));
      const latest = assertRelease(release.data(), projectId, clock(), emulator);
      const entry = row.data();
      if (!entry?.active || entry.key !== emailKey(member.email) || entry.owner ||
          latest.tenantId !== policy.tenantId || latest.microsoftClientId !== policy.microsoftClientId) deny();
      if (entry.uid) {
        if (entry.uid !== member.uid || entry.objectId !== member.providerUid ||
            !role.data()?.active || !identity.data()?.active ||
            !latest.adminUids?.includes(member.uid)) deny();
        return;
      }
      if (role.exists || identity.exists || !Array.isArray(latest.adminUids) || latest.adminUids.length >= 4) deny();
      tx.update(ref, { uid: member.uid, objectId: member.providerUid });
      writeBinding(tx, db, member, false, clock());
      tx.update(policyRef, { adminUids: [...latest.adminUids, member.uid] });
      audit(tx, db, member, 'administrator_enrolled', clock());
    });
    return member;
  }
  async function manage(who, service, data) {
    exactKeys(data, ['key', 'active']);
    return db.runTransaction(async (tx) => {
      await service.authorizeTx(tx, who, 'administratorManagement');
      const refs = roster.map(({ key }) => rosterRef(key));
      const rows = (await tx.getAll(...refs)).map((s) => s.data()).filter(Boolean);
      if (Object.keys(data).length) {
        const entry = rows.find((row) => row.key === data.key);
        if (!entry || entry.owner || typeof data.active !== 'boolean') deny();
        if (entry.active !== data.active) {
          tx.update(rosterRef(entry.key), { active: data.active });
          if (entry.uid) {
            tx.update(db.doc('roles/' + entry.uid), { active: data.active, sensitiveRetrieval: false });
            tx.update(db.doc('testIdentities/' + entry.uid), { active: data.active });
          }
          audit(tx, db, who, data.active ? 'administrator_access_restored' : 'administrator_revoked', clock());
          entry.active = data.active;
        }
      }
      return { administrators: rows.map(({ key, label, owner, active, uid }) => ({ key, label, owner, active, connected: Boolean(uid) })) };
    });
  }
  async function window(who, token, data) {
    exactKeys(data, ['action', 'confirmed']);
    if (!isOwner(who)) deny();
    const lock = (await lockRef.get()).data();
    const policy = (await policyRef.get()).data();
    if (!lock?.phase4 || lock.adminUid !== who.uid || policy?.adminUid !== who.uid) deny();
    const member = await proof(who, token, policy.tenantId, policy.microsoftClientId);
    return db.runTransaction(async (tx) => {
      const [release, role, setupLock, ownerBinding] = await tx.getAll(policyRef, db.doc('roles/' + who.uid), lockRef, rosterRef(emailKey(who.email)));
      const current = release.data();
      const binding = role.data();
      const now = clock();
      if (setupLock.data()?.adminUid !== who.uid || !ownerBinding.data()?.active || ownerBinding.data()?.uid !== who.uid ||
          current?.adminUid !== who.uid || current.tenantId !== member.organization.tenantId ||
          current.microsoftClientId !== policy.microsoftClientId || !binding?.active ||
          !binding.administratorManagement || binding.objectId !== who.providerUid) deny();
      const next = { ...current, enabled: true, expiresAt: Timestamp.fromMillis(now + 2 * hour) };
      assertRelease(next, projectId, now, emulator);
      if (data.action === 'open' && data.confirmed === true) {
        tx.update(policyRef, { enabled: true, expiresAt: next.expiresAt });
        audit(tx, db, who, 'synthetic_window_opened', now);
        return { enabled: true, expiresAt: next.expiresAt.toMillis() };
      }
      if (data.action === 'close') {
        tx.update(policyRef, { enabled: false, expiresAt: Timestamp.fromMillis(now) });
        audit(tx, db, who, 'synthetic_window_closed', now);
        return { enabled: false, expiresAt: now };
      }
      if (Object.keys(data).length) deny('invalid-argument');
      const expiresAt = current.expiresAt?.toMillis() || 0;
      return { enabled: current.enabled === true && expiresAt > now, expiresAt };
    });
  }
  async function verifyDedicatedTester(who) {
    const ref = db.doc('allowlist/' + emailKey(who.email));
    await db.runTransaction(async (tx) => {
      const entry = (await tx.get(ref)).data();
      if (entry?.dedicatedTestApproved !== true || entry.status !== 'active' ||
          (entry.expiresAt?.toMillis() || 0) <= clock() ||
          (entry.dedicatedTestUid && (entry.dedicatedTestUid !== who.uid ||
            entry.dedicatedTestProviderUid !== who.providerUid))) deny();
      if (!entry.dedicatedTestUid) {
        tx.update(ref, { dedicatedTestUid: who.uid, dedicatedTestProviderUid: who.providerUid });
        audit(tx, db, who, 'synthetic_tester_bound', clock());
      }
    });
  }
  async function status(who, token, data) {
    exactKeys(data, []);
    if (!isOwner(who) || !activationConfigured(config, clock()) ||
        (await lockRef.get()).data()?.phase4) deny();
    await proof(who, token, config.tenantId, config.clientId);
    return { eligible: true };
  }
  return { activate, enroll, manage, window, verifyDedicatedTester, status };
}
