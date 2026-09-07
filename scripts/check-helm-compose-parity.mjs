import { readdirSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';

/**
 * The K3s Helm chart must expose the same environment-variable
 * contract as docker-compose.yml's Level 1 install — no K3s-only variable for
 * application configuration. `x-application-environment` is the shared
 * contract api/events/worker/scheduler/migrate/doctor all merge in; `web`
 * carries its own, much smaller block instead.
 *
 * Parity covers the services themselves, not only their variables: a service
 * present in one install path and absent from the other ships a proxy target
 * that resolves in Compose and 502s on Kubernetes, which is exactly what
 * happened when `web-ssr` was added to Compose alone.
 */

/**
 * What each Compose service in the default profile corresponds to in the
 * chart. A service missing from this table fails the check: adding one is a
 * decision about how Kubernetes runs it, not something to leave implicit.
 *
 * - `role`: an entry in values.yaml's `roles` map, deployed by the shared
 *   Deployment template.
 * - `template`: a dedicated template file, named here.
 * - `external`: deliberately not chart-managed, with the reason.
 */
export const SERVICE_COUNTERPARTS = {
  api: { kind: 'role', role: 'api' },
  events: { kind: 'role', role: 'events' },
  worker: { kind: 'role', role: 'worker' },
  scheduler: { kind: 'role', role: 'scheduler' },
  'web-ssr': { kind: 'role', role: 'web-ssr' },
  web: { kind: 'template', template: 'web-deployment.yaml' },
  migrate: { kind: 'template', template: 'job-migrate.yaml' },
  gateway: {
    kind: 'template',
    template: 'ingress.yaml',
    // Compose terminates and routes through its own Caddy; Kubernetes does the
    // same job through an Ingress and the cluster's controller.
    note: 'the cluster ingress controller plays the gateway role',
  },
  postgres: {
    kind: 'external',
    reason: 'the chart consumes DATABASE_URL; a cluster brings its own database',
  },
};

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

/**
 * Every Compose service in the default profile (a profiled service is opt-in,
 * so the chart owes it nothing) must have a counterpart the chart actually
 * renders, and every `roles` entry must exist in Compose.
 *
 * @param {string} composeYaml
 * @param {string} valuesYaml
 * @param {readonly string[]} templateFiles file names under templates/
 */
export function compareServices(composeYaml, valuesYaml, templateFiles) {
  const compose = parse(composeYaml);
  const values = parse(valuesYaml);
  const templates = new Set(templateFiles);
  const roles = Object.keys(values.roles ?? {});
  const services = Object.entries(compose.services ?? {})
    .filter(([, service]) => (service?.profiles ?? []).length === 0)
    .map(([name]) => name);

  const undecided = services.filter((name) => SERVICE_COUNTERPARTS[name] === undefined);
  const unrendered = services.flatMap((name) => {
    const counterpart = SERVICE_COUNTERPARTS[name];
    if (counterpart === undefined) return [];
    if (counterpart.kind === 'role' && !roles.includes(counterpart.role)) {
      return [`${name}: no '${counterpart.role}' entry in values.yaml roles`];
    }
    if (counterpart.kind === 'template' && !templates.has(counterpart.template)) {
      return [`${name}: no templates/${counterpart.template} in the chart`];
    }
    return [];
  });
  const rolesWithoutService = roles.filter((role) => {
    const counterpart = SERVICE_COUNTERPARTS[role];
    return counterpart === undefined || counterpart.kind !== 'role' || !services.includes(role);
  });

  return { undecided, unrendered, rolesWithoutService };
}

/**
 * @param {ReturnType<typeof compareEnvKeys>} diff
 * @param {ReturnType<typeof compareServices>} [services]
 */
export function isClean(diff, services) {
  return (
    diff.shared.onlyInCompose.length === 0 &&
    diff.shared.onlyInValues.length === 0 &&
    diff.web.onlyInCompose.length === 0 &&
    diff.web.onlyInValues.length === 0 &&
    (services === undefined ||
      (services.undecided.length === 0 &&
        services.unrendered.length === 0 &&
        services.rolesWithoutService.length === 0))
  );
}

/**
 * @param {ReturnType<typeof compareEnvKeys>} diff
 * @param {ReturnType<typeof compareServices>} [services]
 */
export function formatReport(diff, services) {
  const lines = [];
  if (services !== undefined) {
    if (services.undecided.length > 0) {
      lines.push('  services: in docker-compose.yml with no decided chart counterpart:');
      for (const name of services.undecided) lines.push(`    - ${name}`);
      lines.push(
        "    Add it to SERVICE_COUNTERPARTS in this script: a 'role', a named 'template', or",
      );
      lines.push("    'external' with the reason it is not chart-managed.");
    }
    for (const problem of services.unrendered) {
      lines.push(`  services: ${problem}`);
    }
    if (services.rolesWithoutService.length > 0) {
      lines.push('  services: in values.yaml roles but not a default-profile Compose service:');
      for (const role of services.rolesWithoutService) lines.push(`    - ${role}`);
    }
  }
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
  const templateFiles = readdirSync(new URL('../deploy/helm/copalibre/templates', import.meta.url));
  const diff = compareEnvKeys(composeYaml, valuesYaml);
  const services = compareServices(composeYaml, valuesYaml, templateFiles);
  if (isClean(diff, services)) {
    process.stdout.write(
      'docker-compose.yml and the Helm chart agree on every service and every env var.\n',
    );
  } else {
    process.stderr.write(`Compose/Helm parity check failed:\n${formatReport(diff, services)}\n`);
    process.exit(1);
  }
}
