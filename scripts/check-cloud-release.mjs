import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
export function checkScope(config, bindings) {
  assert.deepEqual(Object.keys(config).sort(), [
    'firestore',
    'functions',
    'hosting',
  ]);
  assert.deepEqual(config.firestore, [
    {
      database: 'mi-sin-portal',
      rules: 'firestore.mi-sin-portal.cloud-test.rules',
      indexes: 'firestore.mi-sin-portal.cloud-test.indexes.json',
    },
  ]);
  assert.equal(config.functions.length, 1);
  assert.equal(config.functions[0].source, '.deploy/functions');
  assert.equal(config.functions[0].codebase, 'mi-sin-synthetic');
  assert.equal(config.functions[0].runtime, 'nodejs22');
  assert.equal(config.hosting.target, 'mi-sin-portal');
  assert.equal(config.hosting.site, undefined);
  assert.equal(config.hosting.public, 'dist-cloud-test');
  if (bindings)
    assert.deepEqual(
      bindings.targets?.['gen-lang-client-0948635471']?.hosting?.[
        'mi-sin-portal'
      ],
      ['mi-sin-portal'],
    );
}
export function checkManifest(manifest) {
  assert.deepEqual(manifest, {
    mode: 'synthetic-cloud-test-v1',
    projectId: 'gen-lang-client-0948635471',
    appId: '1:1025148630135:web:75e07aa9dd751cc25e0272',
    databaseId: 'mi-sin-portal',
    siteId: 'mi-sin-portal',
    realCollectionEnabled: false,
    sensitiveRetrievalEnabled: false,
    disposalEnabled: false,
  });
}
if (process.argv[1] === import.meta.filename) {
  const cfg = JSON.parse(
    readFileSync('firebase.mi-sin-portal.cloud-test.json'),
  );
  const deployment = process.argv.includes('--deployment');
  checkScope(
    cfg,
    deployment ? JSON.parse(readFileSync('.firebaserc')) : undefined,
  );
  if (deployment)
    checkManifest(JSON.parse(readFileSync('dist-cloud-test/release.json')));
  console.log(
    'PASS: isolated cloud-test resource scope' +
      (deployment
        ? ', explicit Hosting binding and synthetic build manifest.'
        : '. No cloud operations.'),
  );
}
