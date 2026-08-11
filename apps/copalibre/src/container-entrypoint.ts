import { spawn } from 'node:child_process';
import { resolveProductRole, type ProductRole } from './product-roles.js';

const roleCommands: Record<ProductRole, readonly string[]> = {
  api: ['apps/api/dist/main.js'],
  events: ['apps/events/dist/main.js'],
  worker: ['apps/worker/dist/main.js'],
  scheduler: ['apps/scheduler/dist/main.js'],
  migrate: ['apps/migrate/dist/main.js'],
  doctor: ['apps/copalibre/dist/main.js', 'doctor'],
  'upgrade-check': ['apps/copalibre/dist/main.js', 'upgrade-check'],
  web: ['apps/web/dist/server/entry.mjs'],
};

async function main(): Promise<void> {
  const resolution = resolveProductRole(process.argv.slice(2));
  if (!resolution.ok) {
    process.stderr.write(`[copalibre] ${resolution.message}\n`);
    process.exitCode = 64;
    return;
  }

  process.stderr.write(
    `[copalibre] PRODUCT ROLE: ${resolution.role} (from ${resolution.source})\n`,
  );
  const child = spawn(
    process.execPath,
    [...roleCommands[resolution.role], ...resolution.roleArguments],
    {
      env: { ...process.env, COPALIBRE_IN_CONTAINER: 'true' },
      stdio: 'inherit',
    },
  );
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => child.kill(signal));
  }
  const code = await new Promise<number | null>((resolve) => child.once('exit', resolve));
  process.exitCode = code ?? 1;
}

void main();
