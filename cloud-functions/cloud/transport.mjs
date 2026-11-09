import { HttpsError } from 'firebase-functions/v2/https';
import { PortalError } from '../../functions/lib/security.mjs';
// Minimal JSON subset of the published Firebase callable protocol.
// Validate before any SDK callable decoder/logger can inspect malformed payloads.
export function validEnvelope(body) {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    !Object.hasOwn(body, 'data') ||
    !body.data ||
    typeof body.data !== 'object' ||
    Array.isArray(body.data)
  )
    return false;
  let count = 0;
  function plain(value, depth = 0) {
    if (depth > 5 || ++count > 500) return false;
    if (
      value === null ||
      typeof value === 'boolean' ||
      typeof value === 'string'
    )
      return true;
    if (typeof value === 'number')
      return Number.isFinite(value) && Number.isSafeInteger(value);
    if (Array.isArray(value))
      return value.length <= 100 && value.every((v) => plain(v, depth + 1));
    if (!value || typeof value !== 'object') return false;
    return Object.entries(value).every(
      ([key, v]) =>
        key !== '@type' &&
        key !== '__proto__' &&
        key !== 'constructor' &&
        key.length <= 64 &&
        plain(v, depth + 1),
    );
  }
  return plain(body.data) && Buffer.byteLength(JSON.stringify(body)) <= 80000;
}

export function createTransportHandler({ dispatch, verifyAppToken }) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (
        req.method !== 'POST' ||
        !req.is('application/json') ||
        !validEnvelope(req.body)
      )
        throw new HttpsError(
          'invalid-argument',
          'Invalid synthetic test request.',
        );
      const appToken = req.get('X-Firebase-AppCheck');
      if (typeof appToken !== 'string' || appToken.length > 16384)
        throw new HttpsError(
          'unauthenticated',
          'App verification is required.',
        );
      const checked = await verifyAppToken(appToken);
      const result = await dispatch({
        data: req.body.data,
        rawRequest: req,
        app: { appId: checked.appId },
      });
      res.status(200).json({ result });
    } catch (error) {
      const safe =
        error instanceof PortalError
          ? new HttpsError(error.code, error.message)
          : error instanceof HttpsError
            ? error
            : new HttpsError(
                'permission-denied',
                'The synthetic test request could not be authorized.',
              );
      res.status(safe.httpErrorCode.status).json({ error: safe.toJSON() });
    }
  };
}
