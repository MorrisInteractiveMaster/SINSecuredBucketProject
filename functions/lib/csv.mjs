// Shared bounded RFC4180-style parser. No filesystem, network, eval or spreadsheet formulas.
export function normalizeEmail(value) {
  if (typeof value !== 'string') throw new Error('Invalid email');
  const email = value.trim().toLowerCase();
  if (
    email.length > 254 ||
    !/^[a-z0-9.!#$%&'*+/?^_`{|}~=-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(
      email,
    )
  )
    throw new Error('Invalid email');
  return email; // Never remove dots, plus addressing or infer aliases.
}
export function emailLocalPart(email) {
  const value = typeof email === 'string' ? email.trim() : '';
  const at = value.indexOf('@');
  return at > 0 ? value.slice(0, at) : '';
}
export function parseAllowlistCsv(text, { preserveBlankName = false } = {}) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > 65536)
    throw new Error('CSV limit is 64 KiB');
  text = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [],
    value = '',
    quoted = false,
    ended = false;
  function cell() {
    row.push(value);
    value = '';
    ended = false;
  }
  function line() {
    cell();
    if (row.some((x) => x.trim() !== '')) rows.push(row);
    row = [];
  }
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          quoted = false;
          ended = true;
        }
      } else value += c;
      continue;
    }
    if (c === '"') {
      if (value !== '' || ended) throw new Error('Malformed CSV');
      quoted = true;
    } else if (c === ',') cell();
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      line();
    } else {
      if (ended) throw new Error('Malformed CSV');
      value += c;
    }
  }
  if (quoted) throw new Error('Unclosed quote');
  if (value || row.length || ended) line();
  const header = rows[0]?.map((x) => x.trim().toLowerCase()).join(',');
  const hasName = header === 'name,email,status';
  if (!hasName && header !== 'email,status')
    throw new Error('Required header: name,email,status or email,status');
  if (rows.length < 2 || rows.length > 101)
    throw new Error('Import 1–100 rows');
  const seen = new Set();
  return rows.slice(1).map((r, index) => {
    const rowNumber = index + 2;
    if (r.length !== (hasName ? 3 : 2)) throw new Error('Row ' + rowNumber + ' does not match the header');
    const [rawName, rawEmail, rawStatus] = hasName ? r : ['', ...r];
    const name = rawName.trim(), status = rawStatus.trim().toLowerCase();
    let email;
    try {
      email = normalizeEmail(rawEmail);
    } catch {
      throw new Error('Row ' + rowNumber + ' has an invalid email');
    }
    if (
      name.length > 100 ||
      /[\x00-\x08\x0B-\x1F]/.test(name) ||
      !['active', 'revoked', 'removed'].includes(status)
    )
      throw new Error('Row ' + rowNumber + ' has an invalid name or status');
    if (seen.has(email)) throw new Error('Duplicate email at row ' + rowNumber);
    seen.add(email);
    return { name: name || (preserveBlankName ? '' : emailLocalPart(rawEmail)), email, status };
  });
}
