import { readFileSync, readdirSync } from 'node:fs';
import { strict as assert } from 'node:assert';
const root = 'dist-cloud-test',
  assets = readdirSync(`${root}/assets`).filter((n) => n.endsWith('.js'));
assert.deepEqual(
  readdirSync(root).filter((n) => n.endsWith('.html')),
  ['index.html'],
);
const release = JSON.parse(readFileSync(`${root}/release.json`, 'utf8'));
assert.equal(release.realCollectionEnabled, false);
assert.equal(release.sensitiveRetrievalEnabled, false);
assert.equal(release.disposalEnabled, false);
assert.equal(release.appCheckProvider, 'recaptcha-enterprise');
assert.equal(release.databaseId, 'mi-sin-portal');
const texts = assets.map((n) => readFileSync(`${root}/assets/${n}`, 'utf8'));
for (const marker of [
  'Local synthetic review',
  'Open synthetic administrator',
  'emulator-mi-member',
  'BEGIN PRIVATE KEY',
])
  assert.ok(
    texts.every((s) => !s.includes(marker)),
    `Forbidden development/private marker: ${marker}`,
  );
for (let i = 0; i < assets.length; i++)
  assert.ok(
    Buffer.byteLength(texts[i]) < 500000,
    `Review oversized JavaScript chunk: ${assets[i]}`,
  );
const html = readFileSync(`${root}/index.html`, 'utf8'),
  entry = html.match(/src="\/assets\/([^" ]+\.js)"/)?.[1];
assert.ok(entry);
assert.ok(
  readFileSync(`${root}/assets/${entry}`).length < 300000,
  'Review initial JavaScript size',
);
console.log(
  'PASS: synthetic Enterprise release, isolated named target, no development sign-in/private-key code, no QA HTML entry and bounded split bundles.',
);
