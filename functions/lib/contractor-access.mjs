// Shared display policy. Backend authorization remains authoritative.
export const DEFAULT_INVITATION_DAYS = 30;
export function accessStatus(entry, now = Date.now()) {
  const stored = entry.status ?? entry.storedStatus;
  if (stored === 'revoked' || stored === 'removed') return stored;
  if (stored !== 'active') return 'invalid';
  const expiry = typeof entry.expiresAt?.toMillis === 'function' ? entry.expiresAt.toMillis() : Date.parse(entry.expiresAt);
  if (!Number.isFinite(expiry)) return 'invalid';
  return expiry <= now ? 'expired' : 'active';
}
export const accessExplanation = (status) => ({
  active: 'Access is approved until the expiry date.',
  expired: 'Approval is active, but its expiry date has passed. Review a renewal.',
  revoked: 'Access was explicitly revoked. Restore approval first; renewal is a separate decision.',
  removed: 'This record was removed. Restoration requires owner review and is unavailable here.',
  invalid: 'The access record is incomplete or invalid. Ask the portal owner to review it.',
}[status] ?? 'Access requires review.');
