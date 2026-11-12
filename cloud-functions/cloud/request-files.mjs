import { createHash } from 'node:crypto';
import { deny } from '../../functions/lib/security.mjs';
import { cryptoKeyPattern } from '../../functions/lib/kms.mjs';
import { TARGET } from './gates.mjs';
export const REQUEST_BUCKET = TARGET.projectId + '-mi-secure-bucket';
const generationPattern = /^[0-9]{1,30}$/;
const maxFileSize = 10 * 1024 * 1024;
const uuidPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
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
  function stored(file, assignmentId) {
    if (!uuidPattern.test(assignmentId || '') || !file || !file.object?.startsWith(`quarantine/${assignmentId}/`) || !objectPattern.test(file.object || '') || !generationPattern.test(file.generation || '') ||
        !/^[a-f0-9]{64}$/.test(file.sha256 || '') || file.clean !== true ||
        file.mime !== 'application/pdf') deny('failed-precondition', 'This file is not approved.');
  }
  return {
    validate(data, maxSize) {
      if (!Number.isSafeInteger(maxSize) || maxSize < 5 || maxSize > maxFileSize || typeof data.name !== 'string' || data.name.length > 100 || /[\u0000-\u001f\u007f]/.test(data.name) || !/^[^/\\\u0000-\u001f\u007f]{1,100}\.pdf$/i.test(data.name) ||
          data.name.includes('..') || data.mime !== 'application/pdf' || !Number.isSafeInteger(data.size) ||
          data.size < 5 || data.size > maxSize)
        deny('invalid-argument', 'Choose a PDF within the request size limit.');
    },
    async upload(assignmentId, uploadId, size, policy, expiresAt) {
      if (!Number.isSafeInteger(size) || size < 5 || size > maxFileSize ||
          !Number.isSafeInteger(expiresAt) || expiresAt <= clock() || expiresAt > clock() + 5 * 60_000)
        deny('failed-precondition', 'The upload reservation expired. Start a new upload.');
      const current = await bucket(policy);
      const object = `quarantine/${assignmentId}/${uploadId}.pdf`;
      if (!objectPattern.test(object)) deny();
      const [url] = await current.file(object).getSignedUrl({
        version: 'v4', action: 'write', expires: expiresAt, contentType: 'application/pdf',
        extensionHeaders: { 'x-goog-if-generation-match': '0', 'content-length': String(size) },
      });
      return { url, expiresAt };
    },
    async inspect(assignmentId, uploadId, size, policy, expiresAt) {
      if (!Number.isSafeInteger(expiresAt) || expiresAt <= clock()) deny('failed-precondition', 'Upload reservation expired.');
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
        const verdict = await scanner({ bucket: REQUEST_BUCKET, object, generation, sha256 }, policy, { deadline: expiresAt });
        if (verdict?.clean !== true || verdict.bucket !== REQUEST_BUCKET || verdict.object !== object ||
            verdict.generation !== generation || verdict.sha256 !== sha256 ||
            typeof verdict.engine !== 'string' || !verdict.engine || verdict.engine.length > 80 ||
            !Number.isFinite(verdict.definitionsAt) || verdict.definitionsAt > clock() || clock() - verdict.definitionsAt > 86_400_000)
          deny('failed-precondition', 'File scanning has not passed.');
        return { object, generation, sha256, clean: true, mime: 'application/pdf', size };
      } finally { bytes.fill(0); }
    },
    async deliver(file, action, policy, assignmentId) {
      stored(file, assignmentId);
      if (!['preview', 'download'].includes(action)) deny();
      const current = await bucket(policy);
      const [url] = await current.file(file.object, { generation: file.generation }).getSignedUrl({
        version: 'v4', action: 'read', expires: clock() + 60_000,
        responseType: 'application/pdf', responseDisposition: (action === 'preview' ? 'inline' : 'attachment') + '; filename="document.pdf"',
      });
      return { url, expiresAt: clock() + 60_000 };
    },
    async delete(file, policy, assignmentId) {
      stored(file, assignmentId);
      const current = await bucket(policy);
      try { await current.file(file.object, { generation: file.generation }).delete({ ifGenerationMatch: file.generation }); }
      catch (error) { if (error?.code !== 404) throw new Error('File deletion unavailable'); }
    },
  };
}

// Cloud Run IAM and strict caller-token validation protect the HTTPS scanner. Retries are
// bounded, read-only and never consume/extend an assignment's upload lease.
export function privateScanner(fetcher = fetch, { clock = Date.now, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  return async (file, policy, { deadline } = {}) => {
    if (typeof policy.scannerUrl !== 'string' || !/^https:\/\/[a-z0-9-]+\.a\.run\.app$/.test(policy.scannerUrl) ||
        !Number.isSafeInteger(deadline) || deadline - clock() <= 2000)
      throw new Error('Scanner configuration or lease unavailable');
    const end = Math.min(clock() + 60_000, deadline - 1000);
    const identity = await fetcher('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=' +
      encodeURIComponent(policy.scannerUrl), {
      headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(Math.max(1, Math.min(2000, end - clock()))), redirect: 'error',
    });
    if (!identity.ok) throw new Error('Scanner identity unavailable');
    const token = await identity.text();
    if (token.length > 16384) throw new Error('Scanner identity unavailable');
    for (let attempt = 0; attempt < 2; attempt++) {
      const remaining = end - clock();
      if (remaining <= 1000) break;
      let result;
      try {
        result = await fetcher(policy.scannerUrl + '/scan', { method: 'POST',
          headers: { Authorization: 'Bearer ' + token, 'X-Serverless-Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'X-MI-Scan-Deadline': String(deadline) },
          body: JSON.stringify(file), signal: AbortSignal.timeout(remaining), redirect: 'error' });
      } catch {
        if (attempt === 0 && end - clock() > 5000) { await sleep(500); continue; }
        break;
      }
      if (result.ok) {
        if (clock() >= end) break;
        // Bound response size and JSON parsing inside the same abort deadline.
        const reader = result.body?.getReader();
        if (!reader) throw new Error('Scanner verdict unavailable');
        const chunks = []; let size = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.length;
            if (size > 4096 || clock() >= end) throw new Error();
            chunks.push(value);
          }
          return JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch { throw new Error('Scanner verdict unavailable'); }
        finally { await reader.cancel().catch(() => {}); }
      }
      await result.body?.cancel().catch(() => {});
      if (attempt !== 0 || ![429, 502, 503, 504].includes(result.status) || end - clock() <= 5000) break;
      await sleep(500);
    }
    throw new Error('Scanner unavailable. The file remains quarantined.');
  };
}
