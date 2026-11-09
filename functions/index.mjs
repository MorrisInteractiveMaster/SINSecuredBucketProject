import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { randomBytes } from 'node:crypto';
import nodemailer from 'nodemailer';
import { createAdminOperations } from './lib/admin-operations.mjs';
import { createService } from './lib/service.mjs';
import {
  DATABASE_ID,
  DEMO_PROJECT,
  PortalError,
  trustsEmail,
  checkProvider,
  checkFresh,
  emailKey,
  deny,
} from './lib/security.mjs';
import { normalizeEmail } from './lib/csv.mjs';
import { verifyOrganizationalAssertion } from './lib/microsoft.mjs';
const IS_EMULATOR = process.env.FUNCTIONS_EMULATOR === 'true';
const CLOUD_MVP_ENABLED = false; // Release gate: no runtime/client flag can enable this build for real collection.
const app =
  getApps()[0] ||
  initializeApp({ projectId: process.env.GCLOUD_PROJECT || DEMO_PROJECT });
const db = getFirestore(app, DATABASE_ID);
const auth = getAuth(app);
const tenantId = IS_EMULATOR
  ? 'emulator-mi-tenant'
  : process.env.PORTAL_ADMIN_TENANT_ID;
const pepper = IS_EMULATOR
  ? randomBytes(32).toString('hex')
  : process.env.PORTAL_OTP_PEPPER;
const localMail = new Map(); // Synthetic codes only; never returned outside demo emulator.
async function sendCode({ uid, to, code }) {
  if (IS_EMULATOR) {
    if (
      process.env.GCLOUD_PROJECT !== DEMO_PROJECT ||
      !/@example\.(com|org|net)$/.test(to)
    )
      deny();
    localMail.set(uid, { to, code });
    return;
  }
  // Not enabled by this build. Future owner-provided existing corporate SMTP only.
  if (
    !process.env.PORTAL_SMTP_HOST ||
    !process.env.PORTAL_SMTP_USER ||
    !process.env.PORTAL_SMTP_PASSWORD ||
    !process.env.PORTAL_MAIL_FROM
  )
    throw new Error('Mail not configured');
  const transport = nodemailer.createTransport({
    host: process.env.PORTAL_SMTP_HOST,
    port: 465,
    secure: true,
    auth: {
      user: process.env.PORTAL_SMTP_USER,
      pass: process.env.PORTAL_SMTP_PASSWORD,
    },
    logger: false,
    debug: false,
    tls: { rejectUnauthorized: true },
  });
  await transport.sendMail({
    from: process.env.PORTAL_MAIL_FROM,
    to,
    subject: 'Morris Interactive verification code',
    text: `Your single-use portal verification code is ${code}. It expires in ten minutes. Never share your SIN or this code by email.`,
  });
}
const service = createService({ db, pepper, tenantId, sendCode });
const operations = createAdminOperations({ db, service });
async function identity(request) {
  const header = request.rawRequest?.headers?.authorization;
  if (
    !request.auth ||
    typeof header !== 'string' ||
    !header.startsWith('Bearer ')
  )
    deny('unauthenticated', 'Please sign in.');
  const t = await auth.verifyIdToken(header.slice(7), true);
  if (t.uid !== request.auth.uid) deny();
  const providerId = t.firebase?.sign_in_provider;
  checkProvider(providerId);
  checkFresh(t.auth_time, Date.now());
  const record = await auth.getUser(t.uid);
  const email = normalizeEmail(t.email);
  if (
    record.disabled ||
    !record.email ||
    normalizeEmail(record.email) !== email ||
    !record.providerData.some((p) => p.providerId === providerId)
  )
    deny();
  const who = {
    uid: t.uid,
    email,
    providerId,
    authTime: t.auth_time,
    emailTrusted: trustsEmail(
      providerId,
      email,
      t.email_verified === true && record.emailVerified === true,
    ),
  };
  if (providerId === 'microsoft.com') {
    if (IS_EMULATOR && t.uid === 'mi-admin')
      who.organization = {
        tenantId,
        objectId: 'emulator-mi-member',
        member: true,
      };
    else if (request.data?.microsoftIdToken)
      who.organization = await verifyOrganizationalAssertion(
        request.data.microsoftIdToken,
        {
          tenantId,
          clientId: process.env.PORTAL_MICROSOFT_CLIENT_ID,
          providerUid: record.providerData.find(
            (p) => p.providerId === 'microsoft.com',
          ).uid,
        },
      );
  }
  return who;
}
const options = {
  region: 'northamerica-northeast1',
  minInstances: 0,
  maxInstances: 1,
  concurrency: 1,
  memory: '256MiB',
  timeoutSeconds: 30,
  enforceAppCheck: !IS_EMULATOR,
};
function callable(action) {
  return onCall(options, async (request) => {
    try {
      if (
        !IS_EMULATOR ||
        process.env.GCLOUD_PROJECT !== DEMO_PROJECT ||
        (!CLOUD_MVP_ENABLED && !IS_EMULATOR)
      )
        throw new PortalError(
          'failed-precondition',
          'Cloud access is disabled for this unreviewed MVP.',
        );
      if (
        !request.data ||
        typeof request.data !== 'object' ||
        Array.isArray(request.data) ||
        Buffer.byteLength(JSON.stringify(request.data)) > 100000
      )
        deny('invalid-argument');
      const who = await identity(request);
      return await action(who, request.data);
    } catch (error) {
      // Never log/copy raw request, provider tokens, synthetic/SIN input, SDK exception or stack.
      if (error instanceof PortalError)
        throw new HttpsError(error.code, error.message);
      throw new HttpsError(
        'permission-denied',
        'The request could not be authorized.',
      );
    }
  });
}
export const portalContext = callable((who) => service.context(who));
export const portalSendVerification = callable((who) =>
  service.beginVerification(who),
);
export const portalVerifyEmail = callable((who, data) =>
  service.verify(who, data.code),
);
export const portalImportAllowlist = callable((who, data) =>
  service.importCsv(who, data.csv),
);
export const portalListContractors = callable((who) => service.list(who));
export const portalSubmit = callable((who, data) => service.submit(who, data));
export const portalRequestCorrection = callable((who, data) =>
  service.correction(who, data.invitationId),
);
export const portalSensitiveRetrieval = callable((who) =>
  service.sensitive(who),
);
export const portalTestMailbox = callable(async (who) => {
  if (!IS_EMULATOR || process.env.GCLOUD_PROJECT !== DEMO_PROJECT) deny();
  // Confirm active allowlist again before exposing the explicitly synthetic test mailbox.
  const entry = (
    await db.collection('allowlist').doc(emailKey(who.email)).get()
  ).data();
  if (!entry || entry.status !== 'active') deny();
  const mail = localMail.get(who.uid);
  if (!mail || mail.to !== who.email) deny();
  return { code: mail.code, synthetic: true };
});

export const portalOverview = callable((who) => operations.overview(who));
export const portalActivity = callable((who, data) =>
  operations.activity(who, data),
);
export const portalBulkAction = callable((who, data) =>
  operations.bulk(who, data),
);
export const portalMetadataOutput = callable((who, data) =>
  operations.output(who, data),
);
export const portalOutputAck = callable((who, data) =>
  operations.acknowledge(who, data),
);
export const portalWorkflowRequest = callable((who, data) =>
  operations.workflow(who, data),
);
