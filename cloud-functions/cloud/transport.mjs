import { randomUUID } from 'node:crypto';
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
    const reference = randomUUID();
    let stage = 'request-format';
    try {
      if (
        req.method !== 'POST' ||
        !req.is('application/json') ||
        !validEnvelope(req.body)
      )
        throw new HttpsError(
          'invalid-argument',
          'The portal request format was rejected. Reload the portal and try again.',
        );
      stage = 'app-check';
      const appToken = req.get('X-Firebase-AppCheck');
      if (typeof appToken !== 'string' || appToken.length > 16384)
        throw new HttpsError(
          'unauthenticated',
          'App verification is required.',
        );
      let checked;
      try {
        checked = await verifyAppToken(appToken);
      } catch (error) {
        if (['app-check/internal-error', 'app/invalid-credential'].includes(error?.code))
          throw new HttpsError('unavailable', 'The application verification service is unavailable.');
        throw new HttpsError('permission-denied', 'Application verification failed. Reload the official portal and try again.');
      }
      stage = 'authorization-or-operation';
      const result = await dispatch({
        data: req.body.data,
        rawRequest: req,
        app: { appId: checked.appId },
      });
      res.status(200).json({ result });
    } catch (error) {
      if (error instanceof PortalError && [
        'microsoft-assertion', 'microsoft-member-binding', 'firebase-auth-reader', 'firebase-session',
        'staff-policy', 'synthetic-policy', 'sin-unavailable', 'sin-delivery', 'bucket-mail', 'bucket-mail-rate', 'bucket-code', 'bucket-field-changed', 'bucket-value', 'invitation-csv', 'invitation-duplicate',
      ].includes(error.stage)) stage = error.stage;
      else if (!(error instanceof PortalError) && !(error instanceof HttpsError) && [7, 14, 'PERMISSION_DENIED', 'UNAVAILABLE'].includes(error?.code))
        stage = 'backend-access';
      const safe =
        error instanceof PortalError
          ? new HttpsError(error.code, error.message)
          : error instanceof HttpsError
            ? error
            : new HttpsError(
                'unavailable',
                'A portal backend service is unavailable. Try again or provide the reference to the operator.',
              );
      // Fixed categories only. Never record request data, provider claims or upstream exceptions.
      console.info(JSON.stringify({ event: 'portal_request_rejected', reference, stage, code: safe.code }));
      res.status(safe.httpErrorCode.status).json({
        error: { ...safe.toJSON(), details: { reference, stage } },
      });
    }
  };
}
