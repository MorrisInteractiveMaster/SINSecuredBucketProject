import { pathToFileURL } from 'node:url';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { FieldPath, getFirestore } from 'firebase-admin/firestore';
import { emailLocalPart, normalizeEmail } from '../functions/lib/csv.mjs';
import { TARGET } from '../cloud-functions/cloud/gates.mjs';

export function replacementName(record) {
  const name = record?.name;
  if (name != null && (typeof name !== 'string' ||
      (name.trim() !== '' && name !== 'Test account'))) return;
  try {
    normalizeEmail(record?.email);
    const replacement = emailLocalPart(record.email);
    if (replacement !== name) return replacement;
  } catch {
    // Skip malformed records rather than guessing a name.
  }
}

export async function backfillContractorNames(db, apply) {
  const totals = { scanned: 0, candidates: 0, updated: 0 };
  for (const path of ['staffWorkspace/v1/allowlist', 'allowlist']) {
    const query = db.collection(path).orderBy(FieldPath.documentId()).limit(100);
    let last;
    for (;;) {
      const page = await (last ? query.startAfter(last) : query).get();
      if (page.empty) break;
      for (const doc of page.docs) {
        totals.scanned++;
        if (!replacementName(doc.data())) continue;
        totals.candidates++;
        if (apply && await db.runTransaction(async (tx) => {
          const current = (await tx.get(doc.ref)).data();
          const name = replacementName(current);
          if (!name) return false;
          tx.update(doc.ref, { name });
          return true;
        })) totals.updated++;
      }
      last = page.docs.at(-1);
      if (page.size < 100) break;
    }
  }
  return totals;
}

async function main(args) {
  if (args.length > 1 || (args.length === 1 && args[0] !== '--apply') ||
      process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Invalid migration invocation');
  const app = initializeApp({ projectId: TARGET.projectId, credential: applicationDefault() });
  const apply = args[0] === '--apply';
  const totals = await backfillContractorNames(getFirestore(app, TARGET.databaseId), apply);
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'preview', ...totals }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(() => {
    console.error('Contractor name backfill stopped. Check scoped Firestore credentials and rerun the preview.');
    process.exitCode = 1;
  });
}
