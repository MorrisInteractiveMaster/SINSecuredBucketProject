// Production review only. This module is outside Firebase staging.
import { Timestamp } from 'firebase-admin/firestore';

const cryptoKeyPattern = /^projects\/[a-z][a-z0-9-]{4,29}\/locations\/northamerica-northeast[12]\/keyRings\/[\w-]{1,63}\/cryptoKeys\/[\w-]{1,63}$/;
const failure = () => new Error('Protected backend service unavailable.');

export function createCloudKmsCustody({ cryptoKey, operation, credential, fetcher = fetch }) {
  if (!cryptoKeyPattern.test(cryptoKey) || !['encrypt', 'decrypt'].includes(operation) ||
      typeof credential?.getAccessToken !== 'function') throw failure();
  async function invoke(expected, input, aad) {
    if (operation !== expected || !Buffer.isBuffer(input) || !Buffer.isBuffer(aad) ||
        aad.length > 256 || (expected === 'encrypt' ? input.length !== 32 : input.length > 4096)) throw failure();
    try {
      const { access_token: token } = await credential.getAccessToken();
      const field = expected === 'encrypt' ? 'plaintext' : 'ciphertext';
      const response = await fetcher('https://cloudkms.googleapis.com/v1/' + cryptoKey + ':' + expected, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: input.toString('base64'), additionalAuthenticatedData: aad.toString('base64') }),
        signal: AbortSignal.timeout(5000),
        redirect: 'error',
      });
      if (!response.ok) throw failure();
      const body = await response.json();
      const result = body[expected === 'encrypt' ? 'ciphertext' : 'plaintext'];
      if (typeof result !== 'string' || result.length > 5500 || !/^[A-Za-z0-9+/]+={0,2}$/.test(result)) throw failure();
      const bytes = Buffer.from(result, 'base64');
      if (expected === 'decrypt' && bytes.length !== 32) {
        bytes.fill(0);
        throw failure();
      }
      return bytes;
    } catch {
      // Neither KMS responses nor exceptions are safe to log.
      throw failure();
    }
  }
  return {
    wrap: (key, aad) => invoke('encrypt', key, aad),
    unwrap: (wrapped, aad) => invoke('decrypt', wrapped, aad),
  };
}

const idPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export function createProductionFirestoreStore(db) {
  const expected = 'projects/gen-lang-client-0948635471/databases/mi-sin-portal';
  if (db.formattedName !== expected) throw failure();
  const state = (kind, id) => {
    if (!idPattern.test(id)) throw failure();
    return db.doc('productionWorkflow/v1/' + kind + '/' + id);
  };
  return {
    atomic: (action) => db.runTransaction((tx) => action({
      async invitation(id) {
        const snapshot = await tx.get(state('bindings', id));
        const binding = snapshot.data();
        if (!binding || !/^[0-9a-f]{64}$/.test(binding.emailKey || '')) return undefined;
        const invitation = (await tx.get(db.doc('staffWorkspace/v1/allowlist/' + binding.emailKey))).data();
        if (invitation?.invitationId !== id || invitation.status !== 'active') return undefined;
        return {
          uid: binding.uid, active: true, expiresAt: invitation.expiresAt?.toMillis(),
          consumed: binding.consumed, noticeAccepted: binding.noticeAccepted,
        };
      },
      consumeInvitation: (id) => tx.update(state('bindings', id), { consumed: true }),
      record: async (id) => (await tx.get(state('payloads', id))).data(),
      createRecord(id, value) {
        tx.create(state('payloads', id), value);
        tx.create(db.doc('staffWorkspace/v1/submissions/' + id), {
          status: 'submitted', at: Timestamp.fromMillis(value.submittedAt),
        });
      },
      updateRecord(id, change) {
        tx.update(state('payloads', id), change);
        if (change.state === 'retrieval-consumed')
          tx.update(db.doc('staffWorkspace/v1/submissions/' + id), { retrievalStatus: 'requested' });
        if (change.state === 'release-authorized')
          tx.update(db.doc('staffWorkspace/v1/submissions/' + id), { retrievalStatus: 'retrieved' });
        if (change.state === 'transferred')
          tx.update(db.doc('staffWorkspace/v1/submissions/' + id), { transferStatus: 'confirmed' });
      },
      replaceRecord(id, value) {
        tx.set(state('payloads', id), value);
        tx.update(db.doc('staffWorkspace/v1/submissions/' + id), { disposalStatus: 'disposed' });
      },
      audit({ actorUid, recordId, action, at }) {
        tx.create(db.collection('staffWorkspace/v1/auditEvents').doc(), {
          actorUid, invitationId: recordId, event: action, at: Timestamp.fromMillis(at),
        });
      },
    })),
  };
}

// Accept a Firebase token only through the Admin verifier. A current token's
// issue time alone says nothing about when a second factor was used.
export function createVerifiedMfa({ auth, allowedFactors, clock = Date.now }) {
  const approved = new Set(allowedFactors);
  return async (firebaseIdToken, expectedUid) => {
    try {
      const token = await auth.verifyIdToken(firebaseIdToken, true);
      const now = clock();
      const at = token.auth_time * 1000;
      if (token.uid !== expectedUid || token.firebase?.sign_in_provider !== 'microsoft.com' ||
          !approved.has(token.firebase?.sign_in_second_factor) ||
          typeof token.firebase?.second_factor_identifier !== 'string' ||
          !token.firebase.second_factor_identifier ||
          !Number.isFinite(at) || at > now || now - at > 300000) throw failure();
      return at;
    } catch {
      throw failure();
    }
  };
}
