import { spawn } from 'node:child_process';
import { startLocalHandlers } from './local-handlers.mjs';
const server = await startLocalHandlers();
try {
  const test = spawn(
    process.execPath,
    [
      '--test',
      '--test-reporter=tap',
      '--test-concurrency=1',
      'tests/mvp.integration.test.mjs',
      'tests/mvp.security.test.mjs',
    ],
    {
      stdio: 'inherit',
      env: { ...process.env, MVP_HTTP_URL: 'http://127.0.0.1:5001' },
    },
  );
  process.exitCode = await new Promise((resolve) =>
    test.on('exit', (code) => resolve(code ?? 1)),
  );
} finally {
  server.kill('SIGTERM');
}
