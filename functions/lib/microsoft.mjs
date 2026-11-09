import { createRemoteJWKSet, jwtVerify } from 'jose';
import { PortalError, deny } from './security.mjs';
const jwks = createRemoteJWKSet(
  new URL('https://login.microsoftonline.com/common/discovery/v2.0/keys'),
);
export async function verifyOrganizationalAssertion(
  idToken,
  { tenantId, clientId, providerUid },
  verificationKey = jwks,
) {
  if (
    !/^[0-9a-f-]{36}$/i.test(tenantId || '') ||
    !clientId ||
    typeof idToken !== 'string' ||
    idToken.length > 16384
  )
    deny('permission-denied', 'Microsoft sign-in proof is missing or cannot be checked.', 'microsoft-assertion');
  try {
    const { payload } = await jwtVerify(idToken, verificationKey, {
      algorithms: ['RS256'],
      audience: clientId,
      issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
      requiredClaims: ['exp'],
      maxTokenAge: '10m',
      clockTolerance: 10,
    });
    // Entra oid (not pairwise sub) matches Firebase's organizational Microsoft UID.
    // acct=0 (member) is an optional ID-token claim that the owner must configure.
    if (
      payload.aud !== clientId ||
      payload.tid !== tenantId ||
      payload.oid !== providerUid ||
      ![0, '0'].includes(payload.acct)
    )
      deny('permission-denied', 'Microsoft organization membership or the linked identity could not be verified.', 'microsoft-member-binding');
    const account = payload.preferred_username ?? payload.email;
    return {
      tenantId: payload.tid, objectId: payload.oid, member: true,
      appRoles: Array.isArray(payload.roles) ? payload.roles : [],
      accountEmail: typeof account === 'string' ? account.trim().toLowerCase() : null,
    };
  } catch (error) {
    if (error instanceof PortalError) throw error;
    if (['ERR_JWKS_TIMEOUT', 'ERR_JWKS_FETCH_FAILED'].includes(error?.code))
      deny('unavailable', 'Microsoft identity verification is temporarily unavailable.', 'microsoft-assertion');
    deny('permission-denied', 'Microsoft sign-in proof was rejected. Sign in again with the approved organizational account.', 'microsoft-assertion');
  }
}
