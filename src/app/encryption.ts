export const syntheticValues = ['000000018', '000000026'];
export function normalizeAndValidate(value: string) {
  if (!/^[0-9 -]+$/.test(value)) throw new Error('invalid');
  const v = value.replace(/[ -]/g, '');
  if (!/^\d{9}$/.test(v) || /^0+$/.test(v)) throw new Error('invalid');
  const sum = [...v].reduce((s, c, i) => {
    let n = Number(c) * (i % 2 === 1 ? 2 : 1);
    return s + (n > 9 ? n - 9 : n);
  }, 0);
  if (sum % 10 !== 0) throw new Error('invalid');
  return v;
}
export async function encryptSin(
  value: string,
  context: {
    invitationId: string;
    reference: string;
    keyId: string;
    publicKey: JsonWebKey;
  },
) {
  const sin = normalizeAndValidate(value);
  if (!syntheticValues.includes(sin))
    throw new Error('Only documented synthetic fixtures are enabled');
  const key = await crypto.subtle.importKey(
    'jwk',
    context.publicKey,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt'],
  );
  if ((key.algorithm as RsaHashedKeyAlgorithm).modulusLength !== 4096)
    throw new Error('Invalid key');
  const bytes = new TextEncoder().encode(
    JSON.stringify({
      v: 1,
      invitationId: context.invitationId,
      reference: context.reference,
      keyId: context.keyId,
      sin,
    }),
  );
  if (bytes.length > 400) throw new Error('Invalid context');
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'RSA-OAEP', label: new TextEncoder().encode('MI-SIN-PORTAL:v1') },
    key,
    bytes,
  );
  return btoa(String.fromCharCode(...new Uint8Array(ciphertext)));
}
