import { createHash, randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { unlink, writeFile } from 'node:fs/promises';

const terminal = createInterface({ input: process.stdin, output: process.stdout });
const guid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
try {
  const tenant = (await terminal.question('Approved Microsoft tenant ID: ')).trim().toLowerCase();
  const client = (await terminal.question('Approved Microsoft OAuth application client ID: ')).trim().toLowerCase();
  if (!guid.test(tenant) || !guid.test(client)) throw new Error('Use the approved Microsoft tenant and application GUIDs.');
  const approved = await terminal.question('Confirm reviewed synthetic cost and isolation controls. Type APPROVE SYNTHETIC: ');
  if (approved !== 'APPROVE SYNTHETIC') throw new Error('Approval was not confirmed.');
  const code = randomBytes(32).toString('hex');
  const digest = createHash('sha256').update(code).digest('hex');
  const expires = new Date(Date.now() + 24 * 3600000).toISOString();
  const target = '.env.owner-activation';
  const codeFile = '.env.owner-activation-code';
  await writeFile(codeFile, code + '\n', { flag: 'wx', mode: 0o600 });
  try {
    await writeFile(target, [
    'MI_OWNER_SETUP_DIGEST=' + digest,
    'MI_OWNER_SETUP_EXPIRES_AT=' + expires,
    'MI_OWNER_SETUP_TENANT_ID=' + tenant,
    'MI_OWNER_SETUP_CLIENT_ID=' + client,
    '',
    ].join('\n'), { flag: 'wx', mode: 0o600 });
  } catch (error) {
    await unlink(codeFile);
    throw error;
  }
  console.log('Private activation code saved to .env.owner-activation-code. Transfer it to Dev through an approved private channel.');
  console.log('Expires at ' + expires + '. The scoped Functions deployment must follow preparation.');
} finally {
  terminal.close();
}
