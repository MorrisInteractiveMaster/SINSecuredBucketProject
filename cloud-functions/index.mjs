import { onRequest } from 'firebase-functions/v2/https';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getAppCheck } from 'firebase-admin/app-check';
import { TARGET } from './cloud/gates.mjs';
import { createTransportHandler } from './cloud/transport.mjs';
import { createCloudRuntime } from './cloud/runtime.mjs';
const projectId =
  process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
const app = initializeApp({ projectId }, 'mi-sin-synthetic-runtime');
const dispatch = createCloudRuntime({
  db: getFirestore(app, 'mi-sin-portal'),
  auth: getAuth(app),
  projectId,
  credential: applicationDefault(),
  activation: {
    digest: process.env.MI_OWNER_SETUP_DIGEST,
    expiresAt: process.env.MI_OWNER_SETUP_EXPIRES_AT,
    tenantId: process.env.MI_OWNER_SETUP_TENANT_ID,
    clientId: process.env.MI_OWNER_SETUP_CLIENT_ID,
  },
});
export const miSinSynthetic = onRequest(
  {
    region: TARGET.region,
    serviceAccount: `mi-sin-cloud-test@${TARGET.projectId}.iam.gserviceaccount.com`,
    minInstances: 0,
    maxInstances: 1,
    concurrency: 1,
    cpu: 'gcf_gen1',
    memory: '256MiB',
    timeoutSeconds: 15,
    invoker: 'public',
    cors: [
      'https://mi-sin-portal.web.app',
      /^https:\/\/mi-sin-portal--[a-z0-9-]+\.web\.app$/,
    ],
  },
  createTransportHandler({
    dispatch,
    verifyAppToken: (appToken) => getAppCheck(app).verifyToken(appToken),
  }),
);
