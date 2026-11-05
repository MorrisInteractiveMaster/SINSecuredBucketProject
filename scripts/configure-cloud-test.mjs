import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { writeFile } from 'node:fs/promises';
import { clientConfiguration } from '../src/app/release-config.mjs';
const rl = createInterface({ input: stdin, output: stdout });
try {
  const env = {
    VITE_PORTAL_MODE: 'cloud-test',
    VITE_REAL_COLLECTION_ENABLED: 'false',
    VITE_FIREBASE_PROJECT_ID: 'gen-lang-client-0948635471',
    VITE_FIREBASE_APP_ID: '1:1025148630135:web:75e07aa9dd751cc25e0272',
    VITE_FIREBASE_AUTH_DOMAIN: 'gen-lang-client-0948635471.firebaseapp.com',
    VITE_FIREBASE_API_KEY: (
      await rl.question(
        'Firebase web API key (public configuration, not a Microsoft secret): ',
      )
    ).trim(),
    VITE_APPCHECK_SITE_KEY: (
      await rl.question(
        'Portal reCAPTCHA v3 public SITE key (not its secret): ',
      )
    ).trim(),
    VITE_MI_TENANT_ID: (await rl.question('MI Microsoft Entra tenant GUID: '))
      .trim()
      .toLowerCase(),
  };
  clientConfiguration(env);
  await writeFile(
    '.env.cloud-test.local',
    Object.entries(env)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n') + '\n',
    { mode: 0o600, flag: 'wx' },
  );
  console.log(
    'Created ignored .env.cloud-test.local. No credentials or cloud settings changed.',
  );
} finally {
  rl.close();
}
