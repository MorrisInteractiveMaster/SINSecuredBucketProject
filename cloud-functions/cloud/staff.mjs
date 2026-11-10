import { Timestamp } from 'firebase-admin/firestore';
import { createAdminOperations } from '../../functions/lib/admin-operations.mjs';
import { createService } from '../../functions/lib/service.mjs';
import { initialRoster, initialOwnerKey } from '../../functions/lib/admin-roster.mjs';
import { deny, emailKey } from '../../functions/lib/security.mjs';
import { exactKeys, TARGET } from './gates.mjs';

export const staffPermissions = Object.freeze([
  'statusViewing', 'invitationManagement', 'metadataCopy', 'metadataExport', 'auditViewing',
]);
export const staffScope = (db) => {
  const scope = db.doc('staffWorkspace/v1');
  return {
    collection: (name) => scope.collection(name),
    doc: (path) => db.doc('staffWorkspace/v1/' + path),
    getAll: (...refs) => db.getAll(...refs),
    runTransaction: (action) => db.runTransaction(action),
  };
};
export const staffGuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
export function validStaffPolicy(policy) {
  return [1, 2].includes(policy?.version) && policy.projectId === TARGET.projectId &&
    policy.databaseId === TARGET.databaseId && staffGuid.test(policy.tenantId || '') &&
    staffGuid.test(policy.microsoftClientId || '') && policy.enabled === true &&
    policy.realCollectionEnabled === false && policy.sensitiveRetrievalEnabled === false &&
    policy.disposalEnabled === false;
}

export function createStaffWorkspace({ db, clock, verifyMicrosoft, roster = initialRoster, sin, requests }) {
  const scoped = staffScope(db);
  const policyRef = scoped.doc('policy/access');
  const roleRef = (uid) => scoped.doc('roles/' + uid);
  const slotRef = (key) => scoped.doc('approvedAdministrators/' + key);
  const objectRef = (oid) => scoped.doc('objectBindings/' + oid);
  const matches = (role, key, organization) => role?.active === true &&
    role.emailKey === key && role.objectId === organization.objectId &&
    role.tenantId === organization.tenantId;
  const matchesSlot = (slot, who, key, organization) => slot?.key === key &&
    slot.active === true && slot.uid === who.uid && slot.objectId === organization.objectId;

  async function resolve(who, token, op, beforeVerify) {
    const key = emailKey(who.email);
    const approved = roster.find((row) => row.key === key);
    const [policyDoc, roleDoc] = await scoped.getAll(policyRef, roleRef(who.uid));
    const policy = policyDoc.data();
    if (!roleDoc.exists && !(policyDoc.exists && approved)) return null;
    if (!validStaffPolicy(policy)) deny('failed-precondition', 'Staff access is paused by the portal operator.', 'staff-policy');
    if (!approved || who.linkedMailboxConflict || who.providerId !== 'microsoft.com' || !staffGuid.test(who.providerUid || '')) deny();
    await beforeVerify();
    const organization = await verifyMicrosoft(token, {
      tenantId: policy.tenantId, clientId: policy.microsoftClientId, providerUid: who.providerUid,
    });
    if (organization?.member !== true || organization.tenantId !== policy.tenantId ||
        organization.objectId !== who.providerUid || organization.accountEmail !== who.email) deny();
    if (policy.version === 2 && !organization.appRoles?.includes(
      key === initialOwnerKey ? 'MiSinPortal.Owner' : 'MiSinPortal.Staff',
    )) deny('permission-denied', 'This Microsoft account has no approved portal app role.', 'staff-app-role');
    const actor = { ...who, organization, staffClientId: policy.microsoftClientId };
    return scoped.runTransaction(async (tx) => {
      const [latestDoc, currentRole] = await tx.getAll(policyRef, roleRef(who.uid));
      const latest = latestDoc.data();
      if (!validStaffPolicy(latest) || latest.version !== policy.version ||
          latest.tenantId !== policy.tenantId || latest.microsoftClientId !== policy.microsoftClientId) deny();
      if (latest.version === 1) {
        if (!matches(currentRole.data(), key, organization)) deny();
        return actor;
      }
      const slot = slotRef(key);
      const object = objectRef(organization.objectId);
      const [slotDoc, objectDoc] = await tx.getAll(slot, object);
      const entry = slotDoc.data();
      if (entry?.active !== true || entry.key !== key) deny();
      if (entry.uid || entry.objectId || currentRole.exists || objectDoc.exists) {
        if (!matchesSlot(entry, who, key, organization) ||
            !matches(currentRole.data(), key, organization) ||
            objectDoc.data()?.uid !== who.uid || objectDoc.data()?.key !== key) deny();
        return actor;
      }
      if (op !== 'portalContext') deny();
      tx.update(slot, { uid: who.uid, objectId: organization.objectId });
      tx.create(object, { uid: who.uid, key });
      tx.create(roleRef(who.uid), {
        emailKey: key, objectId: organization.objectId, tenantId: organization.tenantId,
        displayLabel: approved.label, active: true,
        ...Object.fromEntries(staffPermissions.map((permission) => [permission, true])),
      });
      tx.create(scoped.collection('auditEvents').doc(), {
        actorUid: who.uid, event: 'staff_identity_enrolled', at: Timestamp.fromMillis(clock()),
      });
      return actor;
    });
  }
  function access(who) {
    return async (tx, actor, permission) => {
      const [policyDoc, roleDoc] = await tx.getAll(policyRef, roleRef(who.uid));
      const policy = policyDoc.data();
      const role = roleDoc.data();
      if (!validStaffPolicy(policy) || actor !== who || !role?.active ||
          role.objectId !== who.organization.objectId || role.tenantId !== who.organization.tenantId ||
          role.tenantId !== policy.tenantId || policy.microsoftClientId !== who.staffClientId || role.emailKey !== emailKey(who.email) ||
          !staffPermissions.includes(permission) || role[permission] !== true) deny();
      if (policy.version === 2) {
        const slot = (await tx.get(slotRef(role.emailKey))).data();
        if (!matchesSlot(slot, who, role.emailKey, who.organization)) deny();
      }
      if (permission === 'invitationManagement' && (policy.invitationImportApproved !== true || !staffGuid.test(policy.privacyApprovalReference || '')))
        deny('failed-precondition', 'Contractor invitation changes are pending privacy approval.');
      return { role, policy };
    };
  }
  async function dispatch(who, op, data) {
    const authorizeTx = access(who);
    const authorize = (actor, permission) => scoped.runTransaction((tx) => authorizeTx(tx, actor, permission));
    const service = { authorizeTx, authorize };
    const operations = createAdminOperations({ db: scoped, service, clock, staffMetadata: true });
    if (op === 'portalContext') {
      exactKeys(data, []);
      const { role, policy } = await authorize(who, 'statusViewing');
      return {
        kind: 'admin', workspace: 'staff', liveSin: Boolean(await sin?.enabled()), requestsV2: Boolean(await requests?.cutover()), bucketField: await sin?.field(), uid: who.uid, displayLabel: role.displayLabel,
        permissions: {
          ...Object.fromEntries(staffPermissions.map((permission) => [permission,
            role[permission] === true && (permission !== 'invitationManagement' || (policy.invitationImportApproved === true && staffGuid.test(policy.privacyApprovalReference || ''))),
          ])),
          administratorManagement: role.emailKey === initialOwnerKey,
        },
      };
    }
    const requestOperations = {
      portalRequestsOverview: ['admin', 'statusViewing'], portalRequestTemplate: ['template', 'invitationManagement'],
      portalRequestAssign: ['assign', 'invitationManagement'], portalRequestCancel: ['cancel', 'invitationManagement'],
      portalRequestReveal: ['reveal', 'statusViewing'], portalRequestFileDelete: ['deleteFile', 'invitationManagement'],
    };
    if (requests && Object.hasOwn(requestOperations, op)) {
      if (op === 'portalRequestFileDelete' && emailKey(who.email) !== initialOwnerKey) deny();
      const [handler, permission] = requestOperations[op];
      return requests[handler](who, data, (tx) => authorizeTx(tx, who, permission));
    }
    if (requests && ['portalRequestFilePreview', 'portalRequestFileDownload'].includes(op))
      return requests.file(who, data, (tx) => authorizeTx(tx, who, 'statusViewing'),
        op === 'portalRequestFilePreview' ? 'preview' : 'download');
    if (op === 'portalBucketConfigure' && sin)
      return sin.configure(who, data, (tx) => authorizeTx(tx, who, 'invitationManagement'));
    if (op === 'portalBucketReveal' && sin) {
      return sin.reveal(who, data, (tx) => authorizeTx(tx, who, 'statusViewing'));
    }
    if (op === 'portalAdministrators') {
      exactKeys(data, ['key', 'active']);
      if (emailKey(who.email) !== initialOwnerKey) deny();
      return scoped.runTransaction(async (tx) => {
        const { policy } = await authorizeTx(tx, who, 'statusViewing');
        if (policy.version === 2) {
          const docs = await tx.getAll(...roster.map(({ key }) => slotRef(key)));
          const rows = docs.map((doc) => doc.data());
          if (rows.some((row, i) => row?.key !== roster[i].key)) deny();
          if (Object.keys(data).length) {
            const target = rows.find(({ key }) => key === data.key);
            if (!target || data.key === initialOwnerKey || typeof data.active !== 'boolean') deny();
            if (target.active !== data.active) {
              if (target.uid) {
                const ref = roleRef(target.uid);
                const role = (await tx.get(ref)).data();
                if (role?.emailKey !== target.key || role.objectId !== target.objectId ||
                    role.tenantId !== policy.tenantId || role.active !== target.active) deny();
                tx.update(ref, { active: data.active });
              }
              tx.update(slotRef(target.key), { active: data.active });
              tx.create(scoped.collection('auditEvents').doc(), {
                actorUid: who.uid, event: data.active ? 'staff_access_restored' : 'staff_access_revoked',
                targetKey: target.key, at: Timestamp.fromMillis(clock()),
              });
              target.active = data.active;
            }
          }
          return { administrators: rows.map((row, i) => ({
            key: row.key, label: roster[i].label, owner: row.key === initialOwnerKey,
            active: row.active, connected: Boolean(row.uid),
          })) };
        }
        const docs = await tx.get(scoped.collection('roles').limit(5));
        const rows = docs.docs.map((doc) => ({ ref: doc.ref, role: doc.data() }));
        if (Object.keys(data).length) {
          const target = rows.find(({ role }) => role.emailKey === data.key);
          if (!target || data.key === initialOwnerKey || typeof data.active !== 'boolean') deny();
          if (target.role.active !== data.active) {
            tx.update(target.ref, { active: data.active });
            tx.create(scoped.collection('auditEvents').doc(), {
              actorUid: who.uid, event: data.active ? 'staff_access_restored' : 'staff_access_revoked',
              targetUid: target.ref.id, at: Timestamp.fromMillis(clock()),
            });
            target.role.active = data.active;
          }
        }
        return { administrators: rows.map(({ role }) => ({
          key: role.emailKey, label: role.displayLabel, owner: role.emailKey === initialOwnerKey,
          active: role.active, connected: true,
        })) };
      });
    }
    if (op === 'portalImportAllowlist') {
      exactKeys(data, ['csv', 'mode']);
      if (data.mode !== undefined && !['create', 'rename'].includes(data.mode))
        deny('invalid-argument', 'Unknown contractor list action.');
      const importer = createService({ db: scoped, tenantId: who.organization.tenantId, clock,
        invitationWriteGuard: (tx, actor) => authorizeTx(tx, actor, 'invitationManagement'),
      });
      return importer.importCsv(who, data.csv, {
        createOnly: data.mode !== 'rename', renameOnly: data.mode === 'rename',
      });
    }
    const handler = {
      portalOverview: 'overview', portalActivity: 'activity', portalBulkAction: 'bulk',
      portalMetadataOutput: 'output', portalOutputAck: 'acknowledge',
    }[op];
    if (handler) return operations[handler](who, data);
    deny('failed-precondition', 'This operation is not enabled in the staff workspace.');
  }
  return { resolve, dispatch };
}
