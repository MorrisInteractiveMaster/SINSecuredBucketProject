import { createRemoteJWKSet, jwtVerify } from 'jose';
import { PortalError, deny } from './security.mjs';
const jwks = createRemoteJWKSet(
  new URL('https://login.microsoftonline.com/common/discovery/v2.0/keys'),
);
export async function verifyOrganizationalAssertion(
  idToken,
  { tenantId, clientId, providerUid },
) {
  if (
    !/^[0-9a-f-]{36}$/i.test(tenantId || '') ||
    !clientId ||
    typeof idToken !== 'string' ||
    idToken.length > 16384
  )
    deny();
  try {
    const { payload } = await jwtVerify(idToken, jwks, {
      algorithms: ['RS256'],
      audience: clientId,
      issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
      maxTokenAge: '10m',
      clockTolerance: 10,
    });
    // Entra oid (not pairwise sub) matches Firebase's organizational Microsoft UID.
    // acct=0 (member) is an optional ID-token claim that the owner must configure.
    if (
      payload.tid !== tenantId ||
      payload.oid !== providerUid ||
      ![0, '0'].includes(payload.acct)
    )
      deny();
    return { tenantId: payload.tid, objectId: payload.oid, member: true };
  } catch (error) {
    if (error instanceof PortalError) throw error;
    deny();
  }
}
