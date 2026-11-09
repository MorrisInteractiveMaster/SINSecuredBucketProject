import { seedMvp } from './seed-mvp.mjs';
import { startLocalHandlers } from './local-handlers.mjs';
await seedMvp({rich:true});
const child = await startLocalHandlers();
process.stdout.write(
  'Synthetic MVP ready. Start npm run dev in a second terminal. No cloud collection.\n',
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    child.kill('SIGTERM');
    process.exit(0);
  });
await new Promise((resolve) => child.on('exit', resolve));
