// Composition for independent review. The synthetic build does not package this file.
import { createCloudKmsCustody, createProductionFirestoreStore } from './cloud-adapters.mjs';
import { createProductionWorkflow } from './workflow.mjs';

const operations = ['submit', 'retrieve', 'confirmTransfer', 'dispose'];
export function createReviewedOperation({
  operation, db, kmsKey, credential, authenticate, verifyTransfer, verifyDisposal,
  approval, releaseEnabled = false,
}) {
  if (!operations.includes(operation)) throw new Error('Unknown protected operation.');
  const needsKey = operation === 'submit' || operation === 'retrieve';
  const keyCustody = needsKey ? createCloudKmsCustody({
    cryptoKey: kmsKey,
    credential,
    operation: operation === 'submit' ? 'encrypt' : 'decrypt',
  }) : undefined;
  const workflow = createProductionWorkflow({
    store: createProductionFirestoreStore(db),
    releaseEnabled, approval, keyCustody, authenticate, verifyTransfer, verifyDisposal,
  });
  return workflow[operation];
}
