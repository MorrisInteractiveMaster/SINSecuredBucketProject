import { approvedAdminEmail } from '../../functions/lib/admin-roster.mjs';
import { Timestamp } from 'firebase-admin/firestore';
import { webcrypto } from 'node:crypto';
import { createAdminOperations } from '../../functions/lib/admin-operations.mjs';
import { createService } from '../../functions/lib/service.mjs';
import { normalizeEmail, parseAllowlistCsv } from '../../functions/lib/csv.mjs';
import {
  checkProvider,
  trustsEmail,
  checkFresh,
  emailKey,
  deny,
} from '../../functions/lib/security.mjs';
import { verifyOrganizationalAssertion } from '../../functions/lib/microsoft.mjs';
import {
  TARGET,
  assertRelease,
  assertTestIdentity,
  exactKeys,
  submissionFixture,
} from './gates.mjs';
import { createSetup } from './setup.mjs';
import { isInitialOwnerEmail } from '../../functions/lib/admin-roster.mjs';
import { createStaffWorkspace, staffScope } from './staff.mjs';
import { createOneTimeSin } from './one-time-sin.mjs';
import { getPortalIdentity } from './identity.mjs';
const OPERATIONS = [
  'portalActivateOwner', 'portalOwnerSetupStatus', 'portalAdministrators', 'portalOwnerWindow', 'portalImportDedicatedTesters',
  'portalContext',
  'portalImportAllowlist',
  'portalListContractors',
  'portalSubmit', 'portalSubmitSin', 'portalRevealSin',
  'portalRequestCorrection',
  'portalOverview',
  'portalActivity',
  'portalBulkAction',
  'portalMetadataOutput',
  'portalOutputAck',
  'portalWorkflowRequest',
];
export function createCloudRuntime({
  db,
  auth,
  projectId,
  emulator = false,
  activation,
  credential,
  custody,
  staffRoster,
  clock = Date.now,
  verifyMicrosoft = verifyOrganizationalAssertion,
}) {
  const setup = createSetup({ db, clock, projectId, emulator, config: activation, verifyMicrosoft });
  const sin = credential || custody ? createOneTimeSin({ db: staffScope(db), clock, credential, custody }) : undefined;
  const staff = createStaffWorkspace({ db, clock, verifyMicrosoft, sin, roster: staffRoster });
  return async function dispatch(request) {
    exactKeys(request.data, ['operation', 'payload', 'microsoftIdToken']);
    if (!OPERATIONS.includes(request.data.operation))
      deny(
        'failed-precondition',
        'This operation is disabled in synthetic cloud testing.',
      );
    if (Buffer.byteLength(JSON.stringify(request.data)) > 80000)
      deny('invalid-argument');
    if (!emulator && request.app?.appId !== TARGET.appId) deny();
    const header = request.rawRequest?.headers?.authorization;
    if (typeof header !== 'string' || !header.startsWith('Bearer '))
      deny('unauthenticated', 'Please sign in.');
    if (projectId !== TARGET.projectId && !(emulator && projectId === 'demo-mi-sin-portal')) deny();
    const { token, user } = await getPortalIdentity(auth, header.slice(7));
    if (request.auth && token.uid !== request.auth.uid) deny();
    const providerId = token.firebase?.sign_in_provider;
    checkProvider(providerId);
    checkFresh(token.auth_time, clock());
    let email;
    let providerEmail;
    try {
      email = normalizeEmail(token.email);
      if (normalizeEmail(user.email) !== email) deny();
      const linked = user.providerData.find((entry) => entry.providerId === providerId);
      if (linked?.email) providerEmail = normalizeEmail(linked.email);
    } catch {
      deny();
    }
    const provider = user.providerData.find((p) => p.providerId === providerId);
    if (user.disabled || !provider?.uid) deny();
    let who = {
      uid: token.uid, email, providerId, providerUid: provider.uid,
      authTime: token.auth_time, emailTrusted: true,
      googleMailboxVerified: providerId === 'google.com' && token.email_verified === true &&
        providerEmail === email && email.endsWith('@gmail.com'),
      verifiedLinkedMailbox: trustsEmail(providerId, email, token.email_verified === true && user.emailVerified === true && providerEmail === email),
      microsoftMailboxMatched: providerEmail === email,
      linkedMailboxConflict: Boolean(providerEmail && providerEmail !== email),
    };
    const data = request.data.payload ?? {};
    const op = request.data.operation;
    if (op === 'portalContext') exactKeys(data, []);
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(who.uid)) deny();
    const staffActor = await staff.resolve(who, request.data.microsoftIdToken, op,
      () => enforceRequestBudget(db, 'staffLimits', 'member_' + who.uid, clock));
    if (staffActor) return staff.dispatch(staffActor, op, data);
    if (op === 'portalRevealSin') deny();
    if (sin && (op === 'portalSubmitSin' || (op === 'portalContext' && await sin.enabled()))) {
      await enforceRequestBudget(db, 'staffLimits', 'contractor_' + who.uid, clock);
      return op === 'portalSubmitSin' ? sin.submit(who, data) : sin.context(who);
    }
    if (op === 'portalSubmitSin') deny('failed-precondition');

    let policy;
    if (!['portalActivateOwner', 'portalOwnerSetupStatus', 'portalOwnerWindow'].includes(op)) {
      policy = assertRelease((await db.doc('policy/cloud-test').get()).data(), projectId, clock(), emulator);
    }
    if (['portalActivateOwner', 'portalOwnerSetupStatus', 'portalOwnerWindow'].includes(op) &&
        (!isInitialOwnerEmail(who.email) || providerId !== 'microsoft.com' || !who.microsoftMailboxMatched)) deny();
    if (op === 'portalOwnerSetupStatus') return setup.status(who, request.data.microsoftIdToken, data);
    if (op === 'portalActivateOwner') return setup.activate(who, request.data.microsoftIdToken, data);
    if (op === 'portalOwnerWindow') return setup.window(who, request.data.microsoftIdToken, data);
    const adminUids = Array.isArray(policy.adminUids) ? policy.adminUids : [policy.adminUid];
    if (adminUids.length > 4) deny();
    if (adminUids.includes(who.uid)) {
      if (providerId !== 'microsoft.com' || (!emulator && !approvedAdminEmail(who.email))) deny();
      who.organization = await verifyMicrosoft(request.data.microsoftIdToken, {
        tenantId: policy.tenantId, clientId: policy.microsoftClientId, providerUid: provider.uid,
      });
    } else if (op === 'portalContext' && approvedAdminEmail(who.email)) {
      who = await setup.enroll(who, request.data.microsoftIdToken, policy);
    }
    const identity = (await db.doc(`testIdentities/${who.uid}`).get()).data();
    if (identity || !who.googleMailboxVerified) assertTestIdentity(identity, who);
    else await setup.verifyDedicatedTester(who);
    await enforceRequestBudget(db, 'testLimits', who.uid, clock);
    const service = createService({
      db,
      tenantId: policy.tenantId,
      policyMode: TARGET.mode,
      clock,
      pepper: null,
      sendCode: async () => deny('failed-precondition'),
    });
    if (op === 'portalAdministrators') return setup.manage(who, service, data);
    const operations = createAdminOperations({ db, service, clock });
    const administrative = {
      portalOverview: 'overview',
      portalActivity: 'activity',
      portalBulkAction: 'bulk',
      portalMetadataOutput: 'output',
      portalOutputAck: 'acknowledge',
      portalWorkflowRequest: 'workflow',
    };
    if (administrative[op]) return operations[administrative[op]](who, data);
    if (op === 'portalContext') {
      exactKeys(data, []);
      return service.context(who);
    }
    if (op === 'portalListContractors') {
      exactKeys(data, []);
      return service.list(who);
    }
    if (op === 'portalImportDedicatedTesters') {
      exactKeys(data, ['csv', 'confirmed']);
      if (data.confirmed !== true) deny('invalid-argument');
      return service.importCsv(who, data.csv, { approveDedicatedTesters: true });
    }
    if (op === 'portalImportAllowlist') {
      await service.authorize(who, 'invitationManagement');
      exactKeys(data, ['csv']);
      let rows;
      try {
        rows = parseAllowlistCsv(data.csv);
      } catch {
        deny('invalid-argument', 'Check the synthetic test CSV.');
      }
      const testers = await db
        .collection('testIdentities')
        .where('active', '==', true)
        .limit(10)
        .get();
      const emails = new Set(
        testers.docs
          .filter(
            (d) =>
              !adminUids.includes(d.id) &&
              d.data().purpose === 'dedicated-synthetic-test' &&
              d.data().ownershipVerified === true,
          )
          .map((d) => d.data().email),
      );
      const unknown = rows.filter((row) => !emails.has(row.email));
      if (unknown.length) {
        const entries = await db.getAll(...unknown.map((row) => db.doc('allowlist/' + emailKey(row.email))));
        entries.forEach((entry, index) => {
          if (entry.data()?.dedicatedTestApproved === true) emails.add(unknown[index].email);
        });
      }
      if (
        rows.some(
          (r) =>
            !emails.has(r.email) ||
            !['', 'Test account', 'Test Microsoft', 'Test Google'].includes(
              r.name,
            ),
        )
      )
        deny(
          'invalid-argument',
          'Only operator-approved dedicated test identities and test labels may be imported.',
        );
      return service.importCsv(who, data.csv);
    }
    if (op === 'portalRequestCorrection') {
      exactKeys(data, ['invitationId']);
      return service.correction(who, data.invitationId);
    }
    if (op === 'portalSubmit') {
      const syntheticValue = submissionFixture(data),
        context = await service.context(who);
      if (context.kind !== 'contractor' || context.needsVerification) deny();
      // No attacker-supplied ciphertext or SIN is accepted. The server constructs this fixture payload.
      const publicKey = await webcrypto.subtle.importKey(
        'jwk',
        context.publicKey,
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        false,
        ['encrypt'],
      );
      if (publicKey.algorithm.modulusLength !== 4096)
        deny('failed-precondition');
      const bytes = new TextEncoder().encode(
        JSON.stringify({
          v: 1,
          invitationId: context.invitationId,
          reference: context.reference,
          keyId: context.keyId,
          sin: syntheticValue,
        }),
      );
      const ciphertext = Buffer.from(
        await webcrypto.subtle.encrypt(
          {
            name: 'RSA-OAEP',
            label: new TextEncoder().encode('MI-SIN-PORTAL:v1'),
          },
          publicKey,
          bytes,
        ),
      ).toString('base64');
      return service.submit(who, {
        invitationId: data.invitationId,
        revision: data.revision,
        keyId: context.keyId,
        syntheticValue,
        ciphertext,
      });
    }
  };
}

async function enforceRequestBudget(db, collection, uid, clock) {
  await db.runTransaction(async (tx) => {
      const globalRef = db.doc(collection + '/global'),
        uidRef = db.doc(collection + '/' + uid),
        g = (await tx.get(globalRef)).data() || {},
        u = (await tx.get(uidRef)).data() || {},
        now = clock();
      const day = g.until?.toMillis() > now ? g.count : 0,
        minute = u.until?.toMillis() > now ? u.count : 0;
      if (day >= 1000 || minute >= 30)
        deny('resource-exhausted', 'Portal request budget reached.');
      tx.set(globalRef, {
        count: day + 1,
        until:
          g.until?.toMillis() > now
            ? g.until
            : Timestamp.fromMillis(now + 86400000),
      });
      tx.set(uidRef, {
        count: minute + 1,
        until:
          u.until?.toMillis() > now
            ? u.until
            : Timestamp.fromMillis(now + 60000),
      });
    });
}
