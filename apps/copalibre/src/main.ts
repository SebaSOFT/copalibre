import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runCli } from './cli.js';
import { envFileAwareRunner, systemProcessRunner } from './process-runner.js';

/** Loads `.env` into `env` without overriding what is set; returns the keys it set. */
export function loadEnv(
  cwd: string = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
): readonly string[] {
  const loaded: string[] = [];
  const envPath = join(cwd, '.env');
  if (!existsSync(envPath)) return loaded;
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
          loaded.push(key);
        }
      }
    }
  } catch {
    // Best-effort loading: ignore unreadable .env
  }
  return loaded;
}

async function main(): Promise<void> {
  const fromEnvFile = loadEnv();
  process.exitCode = await runCli(
    process.argv.slice(2),
    process.env,
    envFileAwareRunner(systemProcessRunner, fromEnvFile),
  );
}

void main();
