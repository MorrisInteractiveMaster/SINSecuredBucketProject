import { createHash } from 'node:crypto';
import { deny } from '../../functions/lib/security.mjs';
import { cryptoKeyPattern } from '../../functions/lib/kms.mjs';
import { TARGET } from './gates.mjs';
export const REQUEST_BUCKET = TARGET.projectId + '-mi-secure-bucket';
const generationPattern = /^[0-9]{1,30}$/;
const objectPattern = /^quarantine\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.pdf$/;

export function createRequestFiles({ storage, clock = Date.now, scanner }) {
  async function bucket(policy) {
    if (policy.filesEnabled !== true || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(policy.fileApprovalReference || '') || policy.storageBucket !== REQUEST_BUCKET ||
        !cryptoKeyPattern.test(policy.filesKmsKey || '') || typeof scanner !== 'function')
      deny('failed-precondition', 'File processing is closed.');
    const current = storage.bucket(REQUEST_BUCKET);
    const [metadata] = await current.getMetadata();
    if (metadata.location?.toLowerCase() !== TARGET.region ||
        metadata.iamConfiguration?.uniformBucketLevelAccess?.enabled !== true ||
        metadata.iamConfiguration?.publicAccessPrevention !== 'enforced' ||
        metadata.encryption?.defaultKmsKeyName !== policy.filesKmsKey)
      deny('failed-precondition', 'The private file bucket configuration requires review.');
    return current;
  }
  function stored(file) {
    if (!file || !objectPattern.test(file.object || '') || !generationPattern.test(file.generation || '') ||
        !/^[a-f0-9]{64}$/.test(file.sha256 || '') || file.clean !== true ||
        file.mime !== 'application/pdf') deny('failed-precondition', 'This file is not approved.');
  }
  return {
    validate(data, maxSize) {
      if (typeof data.name !== 'string' || /[\u0000-\u001f\u007f]/.test(data.name) || !/^[^/\\\u0000-\u001f\u007f]{1,100}\.pdf$/i.test(data.name) ||
          data.name.includes('..') || data.mime !== 'application/pdf' || !Number.isSafeInteger(data.size) ||
          data.size < 5 || data.size > Math.min(maxSize, 10 * 1024 * 1024))
        deny('invalid-argument', 'Choose a PDF within the request size limit.');
    },
    async upload(assignmentId, uploadId, size, policy) {
      const current = await bucket(policy);
      const object = `quarantine/${assignmentId}/${uploadId}.pdf`;
      if (!objectPattern.test(object)) deny();
      const [url] = await current.file(object).getSignedUrl({
        version: 'v4', action: 'write', expires: clock() + 5 * 60_000, contentType: 'application/pdf',
        extensionHeaders: { 'x-goog-if-generation-match': '0', 'content-length': String(size) },
      });
      return { url, expiresAt: clock() + 5 * 60_000 };
    },
    async inspect(assignmentId, uploadId, size, policy) {
      const current = await bucket(policy);
      const object = `quarantine/${assignmentId}/${uploadId}.pdf`;
      if (!objectPattern.test(object)) deny();
      const [metadata] = await current.file(object).getMetadata();
      const generation = String(metadata.generation);
      if (!generationPattern.test(generation) || metadata.contentType !== 'application/pdf' ||
          Number(metadata.size) !== size || size > 10 * 1024 * 1024 ||
          !metadata.kmsKeyName?.startsWith(policy.filesKmsKey + '/cryptoKeyVersions/')) deny();
      const [bytes] = await current.file(object, { generation }).download({ validation: 'crc32c' });
      try {
        if (bytes.length !== size || bytes.subarray(0, 5).toString('ascii') !== '%PDF-') deny('invalid-argument');
        const sha256 = createHash('sha256').update(bytes).digest('hex');
        const verdict = await scanner({ bucket: REQUEST_BUCKET, object, generation, sha256 }, policy);
        if (verdict?.clean !== true || verdict.bucket !== REQUEST_BUCKET || verdict.object !== object ||
            verdict.generation !== generation || verdict.sha256 !== sha256 ||
            typeof verdict.engine !== 'string' || !verdict.engine || verdict.engine.length > 80 ||
            !Number.isFinite(verdict.definitionsAt) || verdict.definitionsAt > clock() || clock() - verdict.definitionsAt > 86_400_000)
          deny('failed-precondition', 'File scanning has not passed.');
        return { object, generation, sha256, clean: true, mime: 'application/pdf', size };
      } finally { bytes.fill(0); }
    },
    async deliver(file, action, policy) {
      stored(file);
      const current = await bucket(policy);
      const [url] = await current.file(file.object, { generation: file.generation }).getSignedUrl({
        version: 'v4', action: 'read', expires: clock() + 60_000,
        responseType: 'application/pdf', responseDisposition: (action === 'preview' ? 'inline' : 'attachment') + '; filename="document.pdf"',
      });
      return { url, expiresAt: clock() + 60_000 };
    },
    async delete(file, policy) {
      stored(file);
      const current = await bucket(policy);
      try { await current.file(file.object, { generation: file.generation }).delete({ ifGenerationMatch: file.generation }); }
      catch (error) { if (error?.code !== 404) throw new Error('File deletion unavailable'); }
    },
  };
}

// The operator must deploy and independently validate this private scanner service.
// It must download the exact generation, run an approved PDF validator and current
// malware engine, and return the bound verdict. No user-facing API accepts verdicts.
export function privateScanner(fetcher = fetch) {
  return async (file, policy) => {
    if (typeof policy.scannerUrl !== 'string' || !/^https:\/\/[a-z0-9-]+\.a\.run\.app$/.test(policy.scannerUrl))
      throw new Error('Scanner configuration unavailable');
    const identity = await fetcher('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=' +
      encodeURIComponent(policy.scannerUrl), {
      headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(2000), redirect: 'error',
    });
    if (!identity.ok) throw new Error('Scanner identity unavailable');
    const token = await identity.text();
    const result = await fetcher(policy.scannerUrl + '/scan', { method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(file), signal: AbortSignal.timeout(5000), redirect: 'error' });
    if (!result.ok) throw new Error('Scanner unavailable');
    return result.json();
  };
}
