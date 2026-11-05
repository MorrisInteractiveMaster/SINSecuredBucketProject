import { Timestamp } from 'firebase-admin/firestore';
import { webcrypto } from 'node:crypto';
import { createService } from '../../functions/lib/service.mjs';
import { normalizeEmail, parseAllowlistCsv } from '../../functions/lib/csv.mjs';
import {
  checkProvider,
  checkFresh,
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
const OPERATIONS = [
  'portalContext',
  'portalImportAllowlist',
  'portalListContractors',
  'portalSubmit',
  'portalRequestCorrection',
];
export function createCloudRuntime({
  db,
  auth,
  projectId,
  emulator = false,
  clock = Date.now,
  verifyMicrosoft = verifyOrganizationalAssertion,
}) {
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
    const token = await auth.verifyIdToken(header.slice(7), true);
    if (request.auth && token.uid !== request.auth.uid) deny();
    const providerId = token.firebase?.sign_in_provider;
    checkProvider(providerId);
    checkFresh(token.auth_time, clock());
    const user = await auth.getUser(token.uid),
      email = normalizeEmail(token.email),
      provider = user.providerData.find((p) => p.providerId === providerId);
    if (user.disabled || !provider || normalizeEmail(user.email) !== email)
      deny();
    const policy = assertRelease(
      (await db.doc('policy/cloud-test').get()).data(),
      projectId,
      clock(),
      emulator,
    );
    const who = {
      uid: token.uid,
      email,
      providerId,
      providerUid: provider.uid,
      authTime: token.auth_time,
      emailTrusted: true,
    };
    // Email ownership is an explicit, privileged operator attestation for dedicated test identities only.
    // It is not inferred from a domain or an unverified OAuth email claim.
    assertTestIdentity(
      (await db.doc(`testIdentities/${who.uid}`).get()).data(),
      who,
    );
    if (who.uid === policy.adminUid) {
      if (providerId !== 'microsoft.com') deny();
      who.organization = await verifyMicrosoft(request.data.microsoftIdToken, {
        tenantId: policy.tenantId,
        clientId: policy.microsoftClientId,
        providerUid: provider.uid,
      });
    }
    // One shared budget for the single cloud callable; rejected traffic still has platform cost.
    await db.runTransaction(async (tx) => {
      const globalRef = db.doc('testLimits/global'),
        uidRef = db.doc(`testLimits/${who.uid}`),
        g = (await tx.get(globalRef)).data() || {},
        u = (await tx.get(uidRef)).data() || {},
        now = clock();
      const day = g.until?.toMillis() > now ? g.count : 0,
        minute = u.until?.toMillis() > now ? u.count : 0;
      if (day >= 1000 || minute >= 30)
        deny('resource-exhausted', 'Synthetic test request budget reached.');
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
    const service = createService({
      db,
      tenantId: policy.tenantId,
      policyMode: TARGET.mode,
      clock,
      pepper: null,
      sendCode: async () => deny('failed-precondition'),
    });
    const data = request.data.payload ?? {},
      op = request.data.operation;
    if (op === 'portalContext') {
      exactKeys(data, []);
      return service.context(who);
    }
    if (op === 'portalListContractors') {
      exactKeys(data, []);
      return service.list(who);
    }
    if (op === 'portalImportAllowlist') {
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
        .limit(6)
        .get();
      const emails = new Set(
        testers.docs
          .filter(
            (d) =>
              d.id !== policy.adminUid &&
              d.data().purpose === 'dedicated-synthetic-test' &&
              d.data().ownershipVerified === true,
          )
          .map((d) => d.data().email),
      );
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
