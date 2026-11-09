import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { generateKeyPairSync, randomUUID, publicEncrypt } from 'node:crypto';
import {
  emailKey,
  DEMO_PROJECT,
  DATABASE_ID,
} from '../functions/lib/security.mjs';
export async function seedMvp({ rich = false } = {}) {
  if (
    process.env.GCLOUD_PROJECT !== DEMO_PROJECT ||
    process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' ||
    process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099'
  )
    throw new Error('Demo emulators required');
  const app = initializeApp(
      { projectId: DEMO_PROJECT },
      `seed-${randomUUID()}`,
    ),
    auth = getAuth(app),
    db = getFirestore(app, DATABASE_ID);
  const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 4096 });
  await db.doc('policy/mvp').set({
    mode: 'synthetic-emulator-only',
    keyId: 'synthetic-key',
    publicKey: publicKey.export({ format: 'jwk' }),
  });
  const specs = [
    ['mi-admin', 'admin@example.com', 'microsoft.com', 'emulator-mi-member'],
    [
      'contractor-ms',
      'contractor@example.com',
      'microsoft.com',
      'emulator-contractor-ms',
    ],
    [
      'contractor-google',
      'google@example.net',
      'google.com',
      'emulator-contractor-google',
    ],
    ['outsider', 'outsider@example.org', 'google.com', 'emulator-outsider'],
  ];
  for (const [uid, email, providerId, providerUid] of specs) {
    try {
      await auth.getUser(uid);
    } catch {
      await auth.createUser({ uid, email, emailVerified: false });
    }
    await auth.updateUser(uid, {
      providerToLink: { providerId, uid: providerUid, email },
      emailVerified: false,
    });
  }
  await db.doc('roles/mi-admin').set({
    active: true,
    tenantId: 'emulator-mi-tenant',
    objectId: 'emulator-mi-member',
    revision: 1,
    invitationManagement: true,
    statusViewing: true,
    correctionManagement: true,
    sensitiveRetrieval: false,
    displayLabel: 'Morgan · test administrator',
    metadataCopy: true,
    metadataExport: true,
    auditViewing: true,
    workflowManagement: true,
  });
  for (const email of ['contractor@example.com', 'google@example.net']) {
    const key = emailKey(email),
      existing = await db.doc(`allowlist/${key}`).get();
    if (!existing.exists)
      await db.doc(`allowlist/${key}`).set({
        name: 'Demo contractor',
        email,
        status: 'active',
        revision: 1,
        invitationId: randomUUID(),
        reference: randomUUID(),
        expiresAt: Timestamp.fromMillis(Date.now() + 72 * 3600000),
      });
  }

  if (rich) {
    const names = [
      'Alex Morgan',
      'Jordan Lee',
      'Casey Rowan',
      'Riley Brooks',
      'Avery Taylor',
      'Sam Parker',
      'Quinn Ellis',
      'Jamie Rivers',
      'Cameron Sage',
      'Drew Rowan',
    ];
    for (let i = 0; i < names.length; i++) {
      const email = `review-${i + 1}@example.org`,
        r = db.doc(`allowlist/${emailKey(email)}`);
      if ((await r.get()).exists) continue;
      const invitationId = randomUUID(),
        reference = randomUUID(),
        at = Timestamp.fromMillis(Date.now() - (i + 2) * 3600000),
        submitted = i < 4;
      await r.create({
        name: names[i],
        email,
        status: i === 8 ? 'revoked' : 'active',
        revision: 1,
        invitationId,
        reference,
        createdAt: at,
        updatedAt: at,
        expiresAt: Timestamp.fromMillis(
          Date.now() + (i === 9 ? -1 : 48) * 3600000,
        ),
        responsibleAdminUid: i % 3 === 0 ? 'mi-admin' : '',
        ...(i < 7
          ? {
              authenticationProvider: i % 2 ? 'google.com' : 'microsoft.com',
              firstSignInAt: at,
              lastSignInAt: at,
              lastAuthenticatedAt: Math.floor(at.toMillis() / 1000),
            }
          : {}),
      });
      await db
        .collection('auditEvents')
        .add({
          actorUid: 'mi-admin',
          event: 'invitation_created',
          invitationId,
          at,
        });
      if (submitted) {
        const ciphertext = publicEncrypt(
          {
            key: publicKey,
            oaepHash: 'sha256',
            oaepLabel: Buffer.from('MI-SIN-PORTAL:v1'),
          },
          Buffer.from(
            JSON.stringify({
              v: 1,
              invitationId,
              reference,
              keyId: 'synthetic-key',
              sin: '000000018',
            }),
          ),
        );
        await db
          .doc(`submissions/${invitationId}`)
          .create({
            uid: `review-fixture-${i}`,
            emailKey: emailKey(email),
            reference,
            status: 'submitted',
            at,
          });
        await db
          .doc(`submissionSlots/${invitationId}`)
          .create({ uid: `review-fixture-${i}`, reference, at });
        await db
          .doc(`encryptedRecords/${invitationId}`)
          .create({
            ciphertext,
            keyId: 'synthetic-key',
            version: 1,
            at,
            retentionDueAt: Timestamp.fromMillis(Date.now() + 7 * 86400000),
          });
        await db
          .collection('auditEvents')
          .add({
            actorUid: `review-fixture-${i}`,
            event: 'submission_accepted',
            invitationId,
            at,
          });
      }
    }
  }
  return { db, auth, app };
}
if (process.argv[1]?.endsWith('seed-mvp.mjs')) {
  await seedMvp();
  process.stdout.write(
    'Seeded synthetic identities, allowlist and public key. No private key retained.\n',
  );
  process.exit(0);
}
