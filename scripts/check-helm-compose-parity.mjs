import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

/**
 * The K3s Helm chart must expose the same environment-variable
 * contract as docker-compose.yml's Level 1 install — no K3s-only variable for
 * application configuration. `x-application-environment` is the shared
 * contract api/events/worker/scheduler/migrate/doctor all merge in; `web`
 * carries its own, much smaller block instead.
 */

/**
 * @param {string} composeYaml
 * @param {string} valuesYaml
 */
export function compareEnvKeys(composeYaml, valuesYaml) {
  const compose = parse(composeYaml);
  const values = parse(valuesYaml);
  return {
    shared: diffKeys(
      Object.keys(compose['x-application-environment'] ?? {}),
      Object.keys(values.env ?? {}),
    ),
    web: diffKeys(
      Object.keys(compose.services?.web?.environment ?? {}),
      Object.keys(values.web?.env ?? {}),
    ),
  };
}

/** @param {ReturnType<typeof compareEnvKeys>} diff */
export function isClean(diff) {
  return (
    diff.shared.onlyInCompose.length === 0 &&
    diff.shared.onlyInValues.length === 0 &&
    diff.web.onlyInCompose.length === 0 &&
    diff.web.onlyInValues.length === 0
  );
}

/** @param {ReturnType<typeof compareEnvKeys>} diff */
export function formatReport(diff) {
  const lines = [];
  for (const [label, section] of [
    ['shared (api/events/worker/scheduler/migrate/doctor)', diff.shared],
    ['web', diff.web],
  ]) {
    if (section.onlyInCompose.length > 0) {
      lines.push(`  ${label}: in docker-compose.yml but missing from values.yaml env:`);
      for (const key of section.onlyInCompose) lines.push(`    - ${key}`);
    }
    if (section.onlyInValues.length > 0) {
      lines.push(`  ${label}: in values.yaml env but missing from docker-compose.yml:`);
      for (const key of section.onlyInValues) lines.push(`    - ${key}`);
    }
  }
  return lines.join('\n');
}

function diffKeys(composeKeys, valuesKeys) {
  const valuesSet = new Set(valuesKeys);
  const composeSet = new Set(composeKeys);
  return {
    onlyInCompose: composeKeys.filter((key) => !valuesSet.has(key)),
    onlyInValues: valuesKeys.filter((key) => !composeSet.has(key)),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const composeYaml = readFileSync(new URL('../docker-compose.yml', import.meta.url), 'utf8');
  const valuesYaml = readFileSync(
    new URL('../deploy/helm/copalibre/values.yaml', import.meta.url),
    'utf8',
  );
  const diff = compareEnvKeys(composeYaml, valuesYaml);
  if (isClean(diff)) {
    process.stdout.write('docker-compose.yml and the Helm chart agree on every env var.\n');
  } else {
    process.stderr.write(`Environment-variable parity check failed:\n${formatReport(diff)}\n`);
    process.exit(1);
  }
}
