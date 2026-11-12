import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createCloudKmsCustody } from '../../functions/lib/kms.mjs';
const aad = (id) => Buffer.from('mi-bucket-assignment:v1:' + id);
export function createRequestCrypto({ credential, kmsFetcher, custody }) {
  const service = (kmsKey, operation) => custody ? custody(kmsKey, operation) :
    createCloudKmsCustody({ cryptoKey: kmsKey, operation, credential, fetcher: kmsFetcher });
  return {
    async encrypt(id, value, kmsKey) {
      const key = randomBytes(32);
      try {
        const iv = randomBytes(12);
        const cipher = createCipheriv('aes-256-gcm', key, iv);
        cipher.setAAD(aad(id));
        const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
        return { ciphertext, iv, tag: cipher.getAuthTag(), wrappedKey: await service(kmsKey, 'encrypt').wrap(key, aad(id)), kmsKey };
      } finally { key.fill(0); }
    },
    async decrypt(id, envelope) {
      const key = await service(envelope.kmsKey, 'decrypt').unwrap(envelope.wrappedKey, aad(id));
      let clear;
      try {
        const decipher = createDecipheriv('aes-256-gcm', key, envelope.iv);
        decipher.setAAD(aad(id));
        decipher.setAuthTag(envelope.tag);
        clear = decipher.update(envelope.ciphertext);
        decipher.final();
        if (clear.length < 1 || clear.length > 4096) throw new Error('Invalid envelope');
        return new TextDecoder('utf8', { fatal: true, ignoreBOM: true }).decode(clear);
      } finally { key.fill(0); clear?.fill(0); }
    },
  };
}
