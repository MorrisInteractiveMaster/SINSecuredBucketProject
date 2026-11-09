// Shared metadata contract. No ciphertext, government identifiers, secrets or tokens.
export const META_COLUMNS = [
  ['name', 'Name'],
  ['email', 'Email'],
  ['invitationId', 'Invitation ID'],
  ['reference', 'Submission reference'],
  ['invitationAt', 'Invited at'],
  ['provider', 'Provider'],
  ['invitationStatus', 'Invitation status'],
  ['submissionStatus', 'Submission status'],
  ['submittedAt', 'Submitted at'],
  ['retrievalStatus', 'Retrieval'],
  ['transferStatus', 'Transfer'],
  ['disposalStatus', 'Disposal'],
  ['lastAction', 'Last action'],
  ['lastActionAt', 'Last action at'],
  ['auditReference', 'Audit reference'],
];
export const META_FIELDS = META_COLUMNS.map(([key]) => key);
export function neutralCell(value) {
  const s = String(value ?? '').replace(/[\t\r\n\u0000-\u001f]/g, ' ');
  return /^[\s]*[=+@-]/.test(s) ? "'" + s : s;
}
export function filterRows(rows, filter = {}) {
  const q = String(filter.search || '')
    .toLowerCase()
    .trim();
  return rows.filter(
    (r) =>
      (!q ||
        [r.name, r.email, r.reference, r.invitationId].some((v) =>
          String(v || '')
            .toLowerCase()
            .includes(q),
        )) &&
      (!filter.status ||
        filter.status === 'all' ||
        r.submissionStatus === filter.status) &&
      (!filter.provider ||
        filter.provider === 'all' ||
        r.provider === filter.provider) &&
      (!filter.admin ||
        filter.admin === 'all' ||
        r.responsibleAdminUid === filter.admin) &&
      (!filter.action ||
        filter.action === 'all' ||
        (filter.action === 'retrieval' &&
          r.submissionStatus === 'submitted' &&
          r.retrievalStatus === 'not_started') ||
        (filter.action === 'attention' && r.attention)) &&
      (!filter.from ||
        (r.invitationAt && r.invitationAt.slice(0, 10) >= filter.from)) &&
      (!filter.to ||
        (r.invitationAt && r.invitationAt.slice(0, 10) <= filter.to)),
  );
}
export function sortRows(rows, sort = 'name', direction = 'asc') {
  if (!META_FIELDS.includes(sort)) sort = 'name';
  return [...rows].sort(
    (a, b) =>
      String(a[sort] ?? '').localeCompare(String(b[sort] ?? '')) *
        (direction === 'desc' ? -1 : 1) ||
      a.invitationId.localeCompare(b.invitationId),
  );
}
export function toTsv(rows, fields = META_FIELDS, header = true) {
  return [
    ...(header
      ? [
          fields
            .map((f) => META_COLUMNS.find(([key]) => key === f)[1])
            .join('\t'),
        ]
      : []),
    ...rows.map((r) => fields.map((f) => neutralCell(r[f])).join('\t')),
  ].join('\n');
}
