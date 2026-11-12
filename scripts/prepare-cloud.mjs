import { readFile, mkdir, writeFile, cp, rm, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..'),
  out = resolve(root, '.deploy/functions');
await mkdir(out, { recursive: true });
// Delete only our generated local staging directory, never cloud resources.
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const name of ['package.json', 'package-lock.json', 'index.mjs']) {
  let text = await readFile(resolve(root, 'cloud-functions', name), 'utf8');
  if (name === 'index.mjs')
    text = text.replaceAll("'../functions/lib/", "'./lib/");
  await writeFile(resolve(out, name), text);
}
await cp(resolve(root, 'functions/lib'), resolve(out, 'lib'), {
  recursive: true,
});
await cp(resolve(root, 'cloud-functions/cloud'), resolve(out, 'cloud'), {
  recursive: true,
});
for (const name of (await readdir(resolve(out, 'cloud'))).filter((n) =>
  n.endsWith('.mjs'),
)) {
  const file = resolve(out, 'cloud', name);
  await writeFile(
    file,
    (await readFile(file, 'utf8')).replaceAll(
      "'../../functions/lib/",
      "'../lib/",
    ),
  );
}
if (process.env.MI_STAGE_OWNER_ACTIVATION === '1') {
  const activation = await readFile(resolve(root, '.env.owner-activation'), 'utf8');
  const fields = [
    /^MI_OWNER_SETUP_DIGEST=[0-9a-f]{64}$/,
    /^MI_OWNER_SETUP_EXPIRES_AT=\d{4}-\d{2}-\d{2}T[0-9:.]+Z$/,
    /^MI_OWNER_SETUP_TENANT_ID=[0-9a-f-]{36}$/,
    /^MI_OWNER_SETUP_CLIENT_ID=[0-9a-f-]{36}$/,
  ];
  const lines = activation.trimEnd().split('\n');
  if (lines.length !== fields.length || !lines.every((line, index) => fields[index].test(line))) {
    throw new Error('Owner activation configuration is malformed.');
  }
  await writeFile(resolve(out, '.env.gen-lang-client-0948635471'), activation, { mode: 0o600 });
}
if (process.env.MI_STAGE_SCANNER_NETWORK === '1') {
  const { scannerNetworkOptions } = await import('../cloud-functions/cloud/scanner-config.mjs');
  const input = JSON.parse(await readFile(resolve(root, 'operator-input.scanner-network.json'), 'utf8'));
  if (!input || Object.keys(input).length !== 1 || typeof input.connector !== 'string')
    throw new Error('Reviewed scanner connector input required.');
  scannerNetworkOptions(input.connector);
  const file = resolve(out, '.env.gen-lang-client-0948635471');
  let existing = '';
  try { existing = await readFile(file, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await writeFile(file, existing.trimEnd() + '\nMI_PDF_SCANNER_CONNECTOR=' + input.connector + '\n', { mode: 0o600 });
}
console.log(
  'Prepared isolated Node 22 synthetic callable source. No deployment performed.',
);
