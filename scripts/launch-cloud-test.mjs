import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { preflight } from './preflight-cloud-test.mjs';
import { checkManifest } from './check-cloud-release.mjs';
const phase = process.argv[2],
  project = 'gen-lang-client-0948635471',
  config = 'firebase.mi-sin-portal.cloud-test.json';
const commands = {
  rules: ['deploy', '--only', 'firestore:mi-sin-portal'],
  functions: ['deploy', '--only', 'functions:mi-sin-synthetic'],
  preview: [
    'hosting:channel:deploy',
    'sin-test',
    '--only',
    'mi-sin-portal',
    '--expires',
    '1d',
  ],
  live: ['deploy', '--only', 'hosting:mi-sin-portal'],
};
if (!commands[phase])
  throw new Error('Choose rules, functions, preview or live.');
const args = [
  '--yes',
  'firebase-tools@15.35.0',
  ...commands[phase],
  '--project',
  project,
  '--config',
  config,
];
console.log('Scoped command: npx ' + args.join(' '));
if (!process.argv.includes('--execute')) {
  console.log(
    'Plan only. Review costs/IAM first. Add --execute to perform this one deployment.',
  );
  process.exit(0);
}
preflight();
checkManifest(JSON.parse(readFileSync('dist-cloud-test/release.json')));
if (phase === 'functions') {
  const account = JSON.parse(
    execFileSync(
      'gcloud',
      [
        'iam',
        'service-accounts',
        'describe',
        `mi-sin-cloud-test@${project}.iam.gserviceaccount.com`,
        '--project',
        project,
        '--format=json',
      ],
      { encoding: 'utf8' },
    ),
  );
  if (
    account.disabled ||
    account.email !== `mi-sin-cloud-test@${project}.iam.gserviceaccount.com`
  )
    throw new Error('Dedicated active runtime service account required.');
}
execFileSync('npx', args, { stdio: 'inherit' });
