import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

/**
 * Validates docker-compose.dev.yml infrastructure profile configuration:
 * ensures one-shot init containers (object-storage-init) have a healthcheck
 * and keep-alive command so unattended startup with `docker compose --wait` succeeds.
 *
 * @param {string} composeYaml
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateDevCompose(composeYaml) {
  const compose = parse(composeYaml);
  const errors = [];

  const services = compose.services ?? {};
  const initService = services['object-storage-init'];

  if (!initService) {
    errors.push('Missing service object-storage-init');
  } else {
    const profiles = initService.profiles ?? [];
    if (!profiles.includes('infrastructure')) {
      errors.push('object-storage-init must be included in infrastructure profile');
    }

    const command = Array.isArray(initService.command)
      ? initService.command.join(' ')
      : String(initService.command ?? '');
    if (!command.includes('tail -f /dev/null') && !command.includes('sleep infinity')) {
      errors.push(
        'object-storage-init command must keep container alive (e.g. tail -f /dev/null) to satisfy docker compose --wait',
      );
    }

    const healthcheck = initService.healthcheck;
    if (!healthcheck || !healthcheck.test) {
      errors.push('object-storage-init must define a healthcheck to signal bucket readiness');
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const filePath = new URL('../docker-compose.dev.yml', import.meta.url);
  const yamlContent = readFileSync(filePath, 'utf8');
  const result = validateDevCompose(yamlContent);

  if (!result.ok) {
    process.stderr.write(
      `Dev compose validation failed:\n${result.errors.map((e) => `  - ${e}`).join('\n')}\n`,
    );
    process.exit(1);
  }

  process.stdout.write(
    'docker-compose.dev.yml infrastructure profile is valid for unattended startup.\n',
  );
}
