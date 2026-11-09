// This adapter sends mailbox codes only. Invitations are shared manually.
export function verificationMailConfig(raw) {
  try {
    const config = JSON.parse(raw);
    if (typeof config.apiKey !== 'string' || !/^re_[\w-]{12,}$/.test(config.apiKey) ||
        typeof config.from !== 'string' || !/^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(config.from) ||
        typeof config.hmacKey !== 'string' || !/^[a-f0-9]{64}$/i.test(config.hmacKey)) return;
    return config;
  } catch {
    return undefined;
  }
}

export function createVerificationMailer(getConfig, fetcher = fetch) {
  return async (email, code, nonce) => {
    const config = getConfig();
    if (!config) throw new Error('Verification mail unavailable');
    const response = await fetcher('https://api.resend.com/emails', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
      headers: { Authorization: 'Bearer ' + config.apiKey, 'Content-Type': 'application/json',
        'Idempotency-Key': 'bucket-mailbox/' + nonce },
      body: JSON.stringify({ from: config.from, to: [email], subject: 'Verify your Morris Interactive portal email',
        text: 'Your verification code is ' + code + '. It expires in 10 minutes. If you did not request this code, ignore this email.' }),
    });
    if (!response.ok) throw new Error('Verification mail unavailable');
  };
}
