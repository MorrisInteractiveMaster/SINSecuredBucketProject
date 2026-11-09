import { applicationDefault } from 'firebase-admin/app';
import { createInterface } from 'node:readline/promises';

const project = 'gen-lang-client-0948635471';
const terminal = createInterface({ input: process.stdin, output: process.stdout });
try {
  const uid = (await terminal.question('Exact Firebase UID for a read-only diagnostic: ')).trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw new Error();
  const { access_token: accessToken } = await applicationDefault().getAccessToken();
  const response = await fetch(
    'https://identitytoolkit.googleapis.com/v1/projects/' + project + '/accounts:lookup',
    {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ localId: [uid] }),
      signal: AbortSignal.timeout(10000),
    },
  );
  const body = await response.json();
  const detail = body.error?.message;
  let category = 'unclassified';
  if (response.ok) category = body.users?.length ? 'user-found' : 'user-not-found';
  else if (typeof detail === 'string' && /end user credentials|quota project/i.test(detail)) {
    category = 'end-user-credentials-or-quota-project';
  } else if (response.status === 403) category = 'permission-or-service-access-denied';
  else if (response.status === 401) category = 'credentials-rejected';
  console.log(JSON.stringify({ status: response.status, category }));
  if (!response.ok || !body.users?.length) process.exitCode = 1;
} catch {
  console.error('Lookup diagnostic failed before a classifiable response. Check credentials, UID format and connectivity.');
  process.exitCode = 1;
} finally {
  terminal.close();
}
