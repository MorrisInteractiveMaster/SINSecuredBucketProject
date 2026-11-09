export const cryptoKeyPattern = /^projects\/[a-z][a-z0-9-]{4,29}\/locations\/northamerica-northeast[12]\/keyRings\/[\w-]{1,63}\/cryptoKeys\/[\w-]{1,63}$/;
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

