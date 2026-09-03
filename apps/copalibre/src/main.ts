import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runCli } from './cli.js';
import { systemProcessRunner } from './process-runner.js';

export function loadEnv(cwd: string = process.cwd(), env: NodeJS.ProcessEnv = process.env): void {
  const envPath = join(cwd, '.env');
  if (!existsSync(envPath)) return;
  try {
    const content = readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let value = trimmed.slice(eqIdx + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (env[key] === undefined) {
          env[key] = value;
        }
      }
    }
  } catch {
    // Best-effort loading: ignore unreadable .env
  }
}

async function main(): Promise<void> {
  loadEnv();
  process.exitCode = await runCli(process.argv.slice(2), process.env, systemProcessRunner);
}

void main();
