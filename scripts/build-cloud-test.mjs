import { loadEnv, build } from 'vite';
import { writeFile } from 'node:fs/promises';
import { clientConfiguration } from '../src/app/release-config.mjs';
const env = {
  ...loadEnv('cloud-test', process.cwd(), 'VITE_'),
  ...Object.fromEntries(
    Object.entries(process.env).filter(([k]) => k.startsWith('VITE_')),
  ),
};
const config = clientConfiguration(env);
if (config.mode !== 'cloud-test')
  throw new Error(
    'Cloud-test mode required; configure .env.cloud-test.local first.',
  );
await build({ mode: 'cloud-test', build: { outDir: 'dist-cloud-test' } });
await writeFile(
  'dist-cloud-test/release.json',
  JSON.stringify({
    mode: 'synthetic-cloud-test-v1',
    projectId: config.firebase.projectId,
    appId: config.firebase.appId,
    databaseId: 'mi-sin-portal',
    siteId: 'mi-sin-portal',
    appCheckProvider: 'recaptcha-enterprise',
    realCollectionEnabled: false,
    sensitiveRetrievalEnabled: false,
    disposalEnabled: false,
  }),
);
