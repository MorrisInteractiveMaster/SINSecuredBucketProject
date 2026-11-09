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
export function validStaffPolicy(policy) {
  const guid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
  return policy?.version === 1 && policy.projectId === TARGET.projectId &&
    policy.databaseId === TARGET.databaseId && guid.test(policy.tenantId || '') &&
    guid.test(policy.microsoftClientId || '') && policy.enabled === true &&
    policy.realCollectionEnabled === false && policy.sensitiveRetrievalEnabled === false &&
    policy.disposalEnabled === false;
}

export function createStaffWorkspace({ db, clock, verifyMicrosoft, roster = initialRoster }) {
  const scoped = staffScope(db);
  const policyRef = scoped.doc('policy/access');
  async function bind(who, token, role) {
    const policy = (await policyRef.get()).data();
    if (!validStaffPolicy(policy)) deny('failed-precondition', 'Staff access is paused by the portal operator.', 'staff-policy');
    if (who.providerId !== 'microsoft.com' || role.active !== true ||
        role.emailKey !== emailKey(who.email) || role.objectId !== who.providerUid ||
        role.tenantId !== policy.tenantId || !roster.some((row) => row.key === role.emailKey)) {
      deny('permission-denied', 'This Microsoft account has no active staff authorization.');
    }
    const organization = await verifyMicrosoft(token, {
      tenantId: policy.tenantId, clientId: policy.microsoftClientId, providerUid: who.providerUid,
    });
    if (!organization?.member || organization.tenantId !== role.tenantId ||
        organization.objectId !== role.objectId) deny();
    return { ...who, organization };
  }
  function access(who) {
    return async (tx, actor, permission) => {
      const [policyDoc, roleDoc] = await tx.getAll(policyRef, scoped.doc('roles/' + who.uid));
      const policy = policyDoc.data();
      const role = roleDoc.data();
      if (!validStaffPolicy(policy) || actor !== who || !role?.active ||
          role.objectId !== who.organization.objectId || role.tenantId !== who.organization.tenantId ||
          role.tenantId !== policy.tenantId || role.emailKey !== emailKey(who.email) ||
          !staffPermissions.includes(permission) || role[permission] !== true) deny();
      if (permission === 'invitationManagement' && policy.invitationImportApproved !== true)
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
        kind: 'admin', workspace: 'staff', uid: who.uid, displayLabel: role.displayLabel,
        permissions: {
          ...Object.fromEntries(staffPermissions.map((permission) => [permission,
            role[permission] === true && (permission !== 'invitationManagement' || policy.invitationImportApproved === true),
          ])),
          administratorManagement: role.emailKey === initialOwnerKey,
        },
      };
    }
    if (op === 'portalAdministrators') {
      exactKeys(data, ['key', 'active']);
      if (emailKey(who.email) !== initialOwnerKey) deny();
      return scoped.runTransaction(async (tx) => {
        await authorizeTx(tx, who, 'statusViewing');
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
      exactKeys(data, ['csv']);
      const importer = createService({ db: scoped, tenantId: who.organization.tenantId, clock,
        invitationWriteGuard: (tx, actor) => authorizeTx(tx, actor, 'invitationManagement'),
      });
      return importer.importCsv(who, data.csv);
    }
    const handler = {
      portalOverview: 'overview', portalActivity: 'activity', portalBulkAction: 'bulk',
      portalMetadataOutput: 'output', portalOutputAck: 'acknowledge',
    }[op];
    if (handler) return operations[handler](who, data);
    deny('failed-precondition', 'This operation is not enabled in the staff workspace.');
  }
  return { role: async (uid) => (await scoped.doc('roles/' + uid).get()).data(), bind, dispatch };
}
