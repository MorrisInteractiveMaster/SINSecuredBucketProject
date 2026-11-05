import { spawn } from 'node:child_process';
export async function startLocalHandlers() {
  if (
    process.env.GCLOUD_PROJECT !== 'demo-mi-sin-portal' ||
    process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' ||
    process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099'
  )
    throw new Error('Local demo emulator environment required');
  const child = spawn(
    process.execPath,
    [
      'node_modules/@google-cloud/functions-framework/build/src/main.js',
      '--source=local-runtime',
      '--target=localRouter',
      '--port=5001',
    ],
    {
      stdio: ['ignore', 'inherit', 'inherit'],
      env: { ...process.env, FUNCTIONS_EMULATOR: 'true' },
    },
  );
  try {
    for (let n = 0; n < 100; n++) {
      if (child.exitCode !== null)
        throw new Error('Local callable transport exited');
      try {
        const r = await fetch('http://127.0.0.1:5001/healthz', {
          signal: AbortSignal.timeout(250),
        });
        if (r.ok) return child;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('Local callable transport did not start');
  } catch (e) {
    child.kill('SIGTERM');
    throw e;
  }
}
