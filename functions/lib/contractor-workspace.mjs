import { parseCsvRows, normalizeEmail, emailLocalPart } from './csv.mjs';
export function previewContractorCsv(text, existing) {
  const parsed = parseCsvRows(text);
  const header = parsed[0]?.map((cell) => cell.trim().toLowerCase());
  if (!header || !['name,email,status', 'email,status', 'name,email', 'email'].includes(header.join(',')) || parsed.length < 2 || parsed.length > 101)
    throw new Error('Use a CSV with name,email,status (or email) and 1–100 rows.');
  const seen = new Set();
  return parsed.slice(1).map((cells, index) => {
    const input = Object.fromEntries(header.map((key, i) => [key, cells[i]?.trim() ?? '']));
    let email = input.email, reason = '';
    try { email = normalizeEmail(email); } catch { reason = 'Invalid email'; }
    if (cells.length !== header.length || (input.name || '').length > 100 || /[\x00-\x1f]/.test(input.name || '')) reason = 'Invalid columns or name';
    const status = (input.status || 'active').toLowerCase();
    if (!['active', 'revoked', 'removed'].includes(status)) reason = 'Use active, revoked or removed for status';
    const duplicate = seen.has(email); seen.add(email);
    const row = existing.find((entry) => entry.email.toLowerCase() === email);
    const category = reason ? 'invalid' : duplicate ? 'duplicate' : row ? row.invitationStatus : status === 'active' ? 'new' : status;
    const eligible = !reason && !duplicate && status === 'active' && (row ? row.invitationStatus === 'active' : status === 'active');
    return { key: String(index), line: index + 2, name: row?.name || input.name || emailLocalPart(input.email), email, row, category, eligible,
      reason: reason || (status !== 'active' ? 'CSV status changes are not applied here. Use an explicit reviewed access action.' : duplicate ? 'Duplicate CSV row; first occurrence only.' : !eligible ? 'Access is not active. Review restoration or renewal separately on the existing contractor.' : row ? 'Existing identity, name and expiry are preserved; only missing requests will be assigned.' : 'New contractor; review expiry and requests before adding.') };
  });
}
export function assignmentBatches(choices) {
  const groups = new Map();
  for (const choice of choices) {
    const types = [...new Set(choice.templateIds)].sort();
    for (let i = 0; i < types.length; i += 50) {
      const part = types.slice(i, i + 50), key = part.join(',');
      if (!groups.has(key)) groups.set(key, { templateIds: part, invitationIds: [] });
      if (!groups.get(key).invitationIds.includes(choice.invitationId)) groups.get(key).invitationIds.push(choice.invitationId);
    }
  }
  const batches = [];
  for (const group of groups.values()) {
    const size = Math.max(1, Math.floor(50 / group.templateIds.length));
    for (let i = 0; i < group.invitationIds.length; i += size) batches.push({ templateIds: group.templateIds, invitationIds: group.invitationIds.slice(i, i + size) });
  }
  return batches;
}
export function creationBatches(rows) {
  const batches = []; let current = [], count = 0;
  for (const row of rows) {
    if (!row.templateIds.length || row.templateIds.length > 50) throw new Error('Select 1–50 request types per new contractor.');
    if (current.length && (current.length === 25 || count + row.templateIds.length > 50)) { batches.push({ rows: current }); current = []; count = 0; }
    current.push(row); count += row.templateIds.length;
  }
  if (current.length) batches.push({ rows: current });
  return batches;
}
