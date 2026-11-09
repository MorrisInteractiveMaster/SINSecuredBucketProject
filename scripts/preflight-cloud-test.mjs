import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { checkScope } from './check-cloud-release.mjs';
export function assertDatabase(database) {
  if (
    database?.name !==
      'projects/gen-lang-client-0948635471/databases/mi-sin-portal' ||
    database?.type !== 'FIRESTORE_NATIVE' ||
    database?.databaseEdition !== 'STANDARD' ||
    database?.locationId !== 'northamerica-northeast1'
  )
    throw new Error(
      'Database must already exist as Standard/Native in Montreal. If it is elsewhere or metadata differs, stop for review; do not recreate or move it.',
    );
}
export function preflight() {
  checkScope(
    JSON.parse(readFileSync('firebase.mi-sin-portal.cloud-test.json')),
    JSON.parse(readFileSync('.firebaserc')),
  );
  const result = JSON.parse(
    execFileSync(
      'npx',
      [
        '--yes',
        'firebase-tools@15.35.0',
        'firestore:databases:get',
        'mi-sin-portal',
        '--project',
        'gen-lang-client-0948635471',
        '--json',
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
    ),
  );
  if (result.status !== 'success')
    throw new Error(
      'Read-only database inspection failed. No deployment allowed.',
    );
  assertDatabase(result.result);
  console.log(
    'PASS: existing Standard/Native Montreal database and exact SIN Hosting target verified read-only. This does not verify billing, existing-app rules, or runtime IAM.',
  );
}
if (process.argv[1] === import.meta.filename) preflight();
