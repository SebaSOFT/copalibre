import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const ROOT = new URL('../', import.meta.url);
const API = 'https://api.github.com';
const API_VERSION = '2022-11-28';

/**
 * @typedef {{
 *   readonly package: string;
 *   readonly ghsa: string;
 *   readonly upstreamIssue: string;
 *   readonly dependencyPath: string;
 *   readonly runtimeExposure: string;
 *   readonly dismissalReason: 'not_used' | 'tolerable_risk';
 * }} KnownUnpatchedAdvisory
 */

/** @type {Readonly<Record<number, KnownUnpatchedAdvisory>>} */
export const KNOWN_UNPATCHED_ADVISORIES = Object.freeze({
  71: Object.freeze({
    package: 'braces',
    ghsa: 'GHSA-vfj7-8cjw-p6xm',
    upstreamIssue: 'https://github.com/micromatch/braces/issues/70',
    dependencyPath: 'apps/web -> starlight-llms-txt -> micromatch -> braces',
    runtimeExposure: 'none; build-time documentation route glob filtering only',
    dismissalReason: 'not_used',
  }),
  72: Object.freeze({
    package: 'http-cache-semantics',
    ghsa: 'GHSA-ch52-4w7c-c8xp',
    upstreamIssue: 'https://github.com/kornelski/http-cache-semantics/issues/56',
    dependencyPath:
      'apps/web -> astro -> http-cache-semantics; root license scan -> pacote -> make-fetch-happen -> http-cache-semantics',
    runtimeExposure: 'none; static site build caching and CI license scan only',
    dismissalReason: 'tolerable_risk',
  }),
});

export function compareStableVersions(left, right) {
  const leftParts = stableParts(left);
  const rightParts = stableParts(right);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index++) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

export function checkPatchedFloor(packageName, versions, firstPatchedVersion) {
  if (firstPatchedVersion === null || firstPatchedVersion === undefined) return [];
  stableParts(firstPatchedVersion);
  return versions
    .filter((version) => compareStableVersions(version, firstPatchedVersion) < 0)
    .map(
      (version) =>
        `${packageName}: locked ${version} is below upstream patched version ${firstPatchedVersion}; update package.json resolutions`,
    );
}

export function checkManifestResolutionFloor(packageName, resolutions, firstPatchedVersion) {
  const entries = Object.entries(resolutions).filter(([selector]) =>
    selector.startsWith(`${packageName}@`),
  );
  if (entries.length === 0) {
    return [
      `${packageName}: package.json resolutions has no explicit pin for upstream patched version ${firstPatchedVersion}`,
    ];
  }
  return entries.flatMap(([selector, version]) =>
    checkPatchedFloor(packageName, [version], firstPatchedVersion).map(
      (failure) => `${selector}: ${failure}`,
    ),
  );
}

export function inspectOpenAlerts(alerts, known = KNOWN_UNPATCHED_ADVISORIES) {
  const failures = [];
  const reviewed = [];
  for (const alert of alerts) {
    const registered = known[alert.number];
    const packageName = alert.security_vulnerability?.package?.name;
    const ghsa = alert.security_advisory?.ghsa_id;
    if (!registered) {
      failures.push(
        `Dependabot alert #${alert.number} (${packageName ?? 'unknown package'}, ${ghsa ?? 'unknown GHSA'}) is open and has no reviewed register entry`,
      );
      continue;
    }
    if (registered.package !== packageName || registered.ghsa !== ghsa) {
      failures.push(
        `Dependabot alert #${alert.number} no longer matches its register entry: expected ${registered.package}/${registered.ghsa}, received ${packageName}/${ghsa}`,
      );
      continue;
    }
    reviewed.push({ number: alert.number, packageName, ghsa });
  }
  return { failures, reviewed };
}

export function lockVersions(lockText, packageName) {
  const lock = parse(lockText);
  return Object.values(lock)
    .filter((entry) => entry.resolution?.startsWith(`${packageName}@npm:`))
    .map((entry) => entry.version);
}

export async function checkDependabotAlerts({
  repository,
  token,
  fetchImpl = fetch,
  lockText = readFileSync(new URL('yarn.lock', ROOT), 'utf8'),
  known = KNOWN_UNPATCHED_ADVISORIES,
}) {
  if (!repository) throw new Error('Set GITHUB_REPOSITORY or configure the origin remote');
  if (!token) throw new Error('Set GH_TOKEN or GITHUB_TOKEN with Dependabot alerts read access');

  const alerts = await listOpenAlerts(repository, token, fetchImpl);
  const { failures, reviewed } = inspectOpenAlerts(alerts, known);
  const manifest = JSON.parse(readFileSync(new URL('package.json', ROOT), 'utf8'));

  for (const [number, entry] of Object.entries(known)) {
    const advisory = await githubJson(`/advisories/${entry.ghsa}`, token, fetchImpl);
    const packageVulnerabilities = (advisory.vulnerabilities ?? []).filter(
      (vulnerability) =>
        vulnerability.package?.ecosystem === 'npm' && vulnerability.package?.name === entry.package,
    );
    if (packageVulnerabilities.length === 0) {
      failures.push(`${entry.ghsa}: advisory has no npm vulnerability record for ${entry.package}`);
      continue;
    }
    const patchedVersions = packageVulnerabilities
      .map((vulnerability) => vulnerability.first_patched_version?.identifier)
      .filter((version) => version !== undefined && version !== null);
    const lockedVersions = lockVersions(lockText, entry.package);
    if (lockedVersions.length === 0) {
      failures.push(
        `${entry.package}: advisory is registered but no locked package instance was found`,
      );
      continue;
    }
    if (patchedVersions.length > 0) {
      const earliestPatch = patchedVersions.sort(compareStableVersions)[0];
      failures.push(...checkPatchedFloor(entry.package, lockedVersions, earliestPatch));
      failures.push(
        ...checkManifestResolutionFloor(entry.package, manifest.resolutions ?? {}, earliestPatch),
      );
    } else if (alerts.some((alert) => alert.number === Number(number))) {
      process.stdout.write(
        `Reviewed open alert #${number}: ${entry.package} has no upstream patched version; ${entry.upstreamIssue}\n`,
      );
    }
  }

  if (failures.length > 0) throw new Error(failures.join('\n'));
  return { openAlertCount: alerts.length, reviewedAlertCount: reviewed.length };
}

async function listOpenAlerts(repository, token, fetchImpl) {
  const alerts = [];
  let url = `${API}/repos/${repository}/dependabot/alerts?state=open&per_page=100`;
  while (url) {
    const response = await githubResponse(url, token, fetchImpl);
    const result = await response.json();
    if (!Array.isArray(result))
      throw new Error('Dependabot alerts API returned a non-array response');
    alerts.push(...result);
    url = nextPageUrl(response.headers?.get('link'));
  }
  return alerts;
}

async function githubJson(path, token, fetchImpl) {
  const response = await githubResponse(`${API}${path}`, token, fetchImpl);
  return response.json();
}

async function githubResponse(url, token, fetchImpl) {
  const response = await fetchImpl(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': API_VERSION,
    },
  });
  if (!response.ok) {
    throw new Error(
      `GitHub API ${url.replace(API, '')} returned HTTP ${response.status}: ${await response.text()}`,
    );
  }
  return response;
}

function nextPageUrl(linkHeader) {
  if (!linkHeader) return null;
  return (
    linkHeader
      .split(',')
      .map((link) => /^\s*<([^>]+)>;\s*rel="next"/.exec(link)?.[1])
      .find(Boolean) ?? null
  );
}

function repositoryFromOrigin() {
  const origin = execFileSync('git', ['config', '--get', 'remote.origin.url'], {
    cwd: fileURLToPath(ROOT),
    encoding: 'utf8',
  }).trim();
  const normalized = origin.replace(/^git@github\.com:/, 'https://github.com/');
  const match = /^https:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/.exec(normalized);
  if (!match?.[1]) throw new Error(`Cannot determine GitHub repository from origin: ${origin}`);
  return match[1];
}

function stableParts(version) {
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`Expected a stable x.y.z version, received ${String(version)}`);
  }
  return version.split('.').map(Number);
}

async function main() {
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY ?? repositoryFromOrigin();
  const result = await checkDependabotAlerts({ repository, token });
  process.stdout.write(
    `Dependabot audit passed: ${result.openAlertCount} open alerts, ${result.reviewedAlertCount} reviewed entries\n`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`Dependabot audit failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
