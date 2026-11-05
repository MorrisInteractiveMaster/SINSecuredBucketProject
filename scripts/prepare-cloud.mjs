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
console.log(
  'Prepared isolated Node 22 synthetic callable source. No deployment performed.',
);
