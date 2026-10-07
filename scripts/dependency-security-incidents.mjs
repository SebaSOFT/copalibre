import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REGISTER_URL = new URL('./dependency-security-incidents.json', import.meta.url);

function fail(message) {
  throw new Error(`Dependency security incident register: ${message}`);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isDate(value) {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
  );
}

function validateUrl(value, label) {
  if (!isNonEmptyString(value)) fail(`${label} must be a non-empty URL`);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${label} must be a valid URL`);
  }
  if (parsed.protocol !== 'https:') fail(`${label} must use HTTPS`);
}

function isWorkspacePath(value) {
  return value === '.' || /^(apps|packages)\/[a-z0-9][a-z0-9-]*$/.test(value);
}

export function validateRegister(register) {
  if (!register || typeof register !== 'object' || Array.isArray(register)) {
    fail('root must be a JSON object');
  }
  if (register.schemaVersion !== 1) fail('schemaVersion must equal 1');
  const { coverage } = register;
  if (!coverage || !isDate(coverage.from) || !isDate(coverage.through)) {
    fail('coverage.from and coverage.through must be YYYY-MM-DD dates');
  }
  if (coverage.from > coverage.through) fail('coverage.from must not be after coverage.through');
  if (!['complete', 'partial'].includes(coverage.historicalBaseline)) {
    fail('coverage.historicalBaseline must be complete or partial');
  }
  if (!Array.isArray(register.events)) fail('events must be an array');

  const eventIds = new Set();
  for (const [eventIndex, event] of register.events.entries()) {
    const prefix = `events[${eventIndex}]`;
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      fail(`${prefix} must be an object`);
    }
    for (const field of ['id', 'advisoryId', 'status']) {
      if (!isNonEmptyString(event[field])) fail(`${prefix}.${field} must be a non-empty string`);
    }
    if (eventIds.has(event.id)) fail(`${prefix}.id duplicates ${event.id}`);
    eventIds.add(event.id);
    if (!['resolved', 'exception'].includes(event.status)) {
      fail(`${prefix}.status must be resolved or exception`);
    }
    if (!event.transitivePackage || !isNonEmptyString(event.transitivePackage.name)) {
      fail(`${prefix}.transitivePackage.name is required`);
    }
    for (const field of ['affectedRanges', 'affectedVersions', 'fixedVersions']) {
      const versions = event.transitivePackage[field];
      if (
        !Array.isArray(versions) ||
        versions.length === 0 ||
        versions.some((item) => !isNonEmptyString(item))
      ) {
        fail(`${prefix}.transitivePackage.${field} must be a non-empty string array`);
      }
    }
    if (
      !event.remediation ||
      !isNonEmptyString(event.remediation.kind) ||
      !isNonEmptyString(event.remediation.summary)
    ) {
      fail(`${prefix}.remediation.kind and summary are required`);
    }
    if (event.detectedAt !== null && !isDate(event.detectedAt)) {
      fail(
        `${prefix}.detectedAt must be a YYYY-MM-DD date or null when historical evidence is unavailable`,
      );
    }
    if (!isDate(event.remediatedAt)) fail(`${prefix}.remediatedAt must be a YYYY-MM-DD date`);
    if (!Array.isArray(event.directRoots) || event.directRoots.length === 0) {
      fail(`${prefix}.directRoots must contain at least one attribution`);
    }

    const rootPackages = new Set();
    for (const [rootIndex, root] of event.directRoots.entries()) {
      const rootPrefix = `${prefix}.directRoots[${rootIndex}]`;
      if (!isNonEmptyString(root.package)) fail(`${rootPrefix}.package is required`);
      if (rootPackages.has(root.package)) {
        fail(`${rootPrefix}.package duplicates ${root.package}; combine its workspaces and paths`);
      }
      rootPackages.add(root.package);
      if (!Array.isArray(root.workspaces) || root.workspaces.length === 0) {
        fail(`${rootPrefix}.workspaces must contain at least one workspace path`);
      }
      for (const workspacePath of root.workspaces) {
        if (!isNonEmptyString(workspacePath))
          fail(`${rootPrefix}.workspaces contains an empty path`);
        if (!isWorkspacePath(workspacePath)) {
          fail(`${rootPrefix}.workspaces contains an invalid repository workspace path`);
        }
      }
      if (!Array.isArray(root.dependencyPaths) || root.dependencyPaths.length === 0) {
        fail(`${rootPrefix}.dependencyPaths must contain at least one evidenced path`);
      }
      for (const [pathIndex, dependencyPath] of root.dependencyPaths.entries()) {
        if (
          !Array.isArray(dependencyPath) ||
          dependencyPath.length < 2 ||
          dependencyPath.some((segment) => !isNonEmptyString(segment))
        ) {
          fail(
            `${rootPrefix}.dependencyPaths[${pathIndex}] must contain package names from root to transitive package`,
          );
        }
        if (dependencyPath[0] !== root.package) {
          fail(`${rootPrefix}.dependencyPaths[${pathIndex}] must start with ${root.package}`);
        }
        if (dependencyPath.at(-1) !== event.transitivePackage.name) {
          fail(
            `${rootPrefix}.dependencyPaths[${pathIndex}] must end with ${event.transitivePackage.name}`,
          );
        }
        if (new Set(dependencyPath).size !== dependencyPath.length) {
          fail(`${rootPrefix}.dependencyPaths[${pathIndex}] must not contain a package cycle`);
        }
      }
    }

    if (!Array.isArray(event.evidence) || event.evidence.length < 2) {
      fail(`${prefix}.evidence must contain advisory and remediation references`);
    }
    const evidenceKinds = new Set();
    for (const [evidenceIndex, evidence] of event.evidence.entries()) {
      const evidencePrefix = `${prefix}.evidence[${evidenceIndex}]`;
      if (!['advisory', 'remediation'].includes(evidence.kind)) {
        fail(`${evidencePrefix}.kind must be advisory or remediation`);
      }
      evidenceKinds.add(evidence.kind);
      if (!isNonEmptyString(evidence.label)) fail(`${evidencePrefix}.label is required`);
      validateUrl(evidence.url, `${evidencePrefix}.url`);
      if (evidence.kind === 'advisory' && !evidence.url.includes(event.advisoryId)) {
        fail(`${evidencePrefix}.url must identify ${event.advisoryId}`);
      }
      if (
        evidence.kind === 'remediation' &&
        !evidence.url.includes('/commit/') &&
        !evidence.url.includes('/pull/')
      ) {
        fail(`${evidencePrefix}.url must link to a remediation commit or pull request`);
      }
    }
    if (evidenceKinds.size !== 2) {
      fail(`${prefix}.evidence must include both advisory and remediation references`);
    }
  }

  return register;
}

export function groupIncidents(register) {
  const groups = new Map();
  for (const event of register.events) {
    for (const root of event.directRoots) {
      const current = groups.get(root.package) ?? {
        package: root.package,
        eventIds: new Set(),
        advisories: new Set(),
        transitivePackages: new Set(),
        workspaces: new Set(),
        evidence: new Map(),
      };
      current.eventIds.add(event.id);
      current.advisories.add(event.advisoryId);
      current.transitivePackages.add(event.transitivePackage.name);
      for (const workspacePath of root.workspaces) current.workspaces.add(workspacePath);
      for (const item of event.evidence) current.evidence.set(item.url, item.label);
      groups.set(root.package, current);
    }
  }

  return [...groups.values()]
    .map((group) => ({
      package: group.package,
      eventCount: group.eventIds.size,
      advisoryCount: group.advisories.size,
      transitivePackageCount: group.transitivePackages.size,
      workspaces: [...group.workspaces].sort(),
      evidence: [...group.evidence.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([url, label]) => ({ url, label })),
    }))
    .sort((left, right) => left.package.localeCompare(right.package));
}

export function renderMarkdown(register) {
  const { coverage } = register;
  const baseline =
    coverage.historicalBaseline === 'partial'
      ? 'partial historical baseline'
      : 'complete historical baseline';
  const groups = groupIncidents(register);
  const lines = [
    '## Transitive dependency security incidents',
    '',
    `Coverage: ${coverage.from} through ${coverage.through} (${baseline}). Counts are informational; missing history is not zero history.`,
    '',
    '| Direct dependency root | Events | Advisories | Transitive packages | Workspaces | Evidence |',
    '| --- | ---: | ---: | ---: | --- | --- |',
  ];

  for (const group of groups) {
    const workspaces = group.workspaces.map((workspacePath) => `\`${workspacePath}\``).join(', ');
    const evidence = group.evidence.map(({ url, label }) => `[${label}](${url})`).join('<br>');
    lines.push(
      `| \`${group.package}\` | ${group.eventCount} | ${group.advisoryCount} | ${group.transitivePackageCount} | ${workspaces} | ${evidence} |`,
    );
  }
  if (groups.length === 0) lines.push('| None recorded | 0 | 0 | 0 | — | — |');
  lines.push('');
  return lines.join('\n');
}

export function run({
  registerPath = REGISTER_URL,
  summaryPath = process.env.GITHUB_STEP_SUMMARY,
} = {}) {
  const register = validateRegister(JSON.parse(readFileSync(registerPath, 'utf8')));
  const markdown = renderMarkdown(register);
  if (summaryPath) appendFileSync(summaryPath, `${markdown}\n`);
  else process.stdout.write(markdown);
  return markdown;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    run();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
