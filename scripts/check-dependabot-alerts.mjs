import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import semver from 'semver';
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
  73: Object.freeze({
    package: 'sprintf-js',
    ghsa: 'GHSA-hp3w-g68c-fv3c',
    upstreamIssue: 'https://github.com/alexei/sprintf.js/issues/237',
    dependencyPath:
      'every workspace -> jest -> @jest/core -> @jest/reporters -> @jest/transform -> babel-plugin-istanbul -> @istanbuljs/load-nyc-config -> js-yaml@3 -> argparse@1 -> sprintf-js',
    runtimeExposure:
      'none; test-time coverage tooling only, which reads YAML configuration and never formats a string with attacker-controlled precision specifiers',
    dismissalReason: 'not_used',
  }),
});

/**
 * Packages deliberately removed from the dependency graph while an alert for
 * them can still be open on `main`. An alert for a package with no locked
 * instance passes only when the package is listed here AND is absent from the
 * lockfile; any other missing instance still fails, because a package that
 * vanished without a reviewed reason is more likely a broken lock read than a
 * fix.
 *
 * @typedef {{
 *   readonly removedBy: string;
 *   readonly evidence: string;
 * }} ReviewedRemoval
 */

/** @type {Readonly<Record<string, ReviewedRemoval>>} */
export const REVIEWED_REMOVALS = Object.freeze({});

/**
 * How an open alert stands against the checkout. GitHub's own state is kept
 * apart: an alert open on `main` can be `patched-in-checkout` here, and only a
 * later query after a release reaches `main` can show it closed.
 *
 * @typedef {'patched-in-checkout' | 'vulnerable-in-checkout' | 'removed-dependency'
 *   | 'reviewed-unpatched' | 'unresolved'} AlertClassification
 */

export function compareStableVersions(left, right) {
  const leftParts = stableParts(left);
  const rightParts = stableParts(right);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index++) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

export function checkPatchedFloor(
  packageName,
  versions,
  firstPatchedVersion,
  vulnerableVersionRange,
) {
  if (firstPatchedVersion === null || firstPatchedVersion === undefined) return [];
  stableParts(firstPatchedVersion);
  const affectedVersions = vulnerableVersionRange
    ? versions.filter((version) => matchesVersionRange(version, vulnerableVersionRange))
    : versions;
  return affectedVersions
    .filter((version) => compareStableVersions(version, firstPatchedVersion) < 0)
    .map(
      (version) =>
        `${packageName}: locked ${version} is below upstream patched version ${firstPatchedVersion}; update package.json resolutions`,
    );
}

export function checkManifestResolutionFloor(
  packageName,
  resolutions,
  firstPatchedVersion,
  lockedVersions,
  vulnerableVersionRange,
) {
  const entries = Object.entries(resolutions).filter(
    ([selector]) => selector === packageName || selector.startsWith(`${packageName}@`),
  );
  if (entries.length === 0) {
    if (
      lockedVersions &&
      !lockedVersions.some((version) => semver.major(version) === semver.major(firstPatchedVersion))
    ) {
      return [];
    }
    return [
      `${packageName}: package.json resolutions has no explicit pin for upstream patched version ${firstPatchedVersion}`,
    ];
  }
  const patchedMajor = semver.major(firstPatchedVersion);
  const applicableEntries = entries.filter(
    ([selector, version]) =>
      resolutionTargetsRange(selector, packageName, vulnerableVersionRange) ||
      semver.major(version) === patchedMajor,
  );
  if (applicableEntries.length === 0) {
    if (
      lockedVersions &&
      !lockedVersions.some((version) => semver.major(version) === patchedMajor)
    ) {
      return [];
    }
    return [
      `${packageName}: package.json resolutions has no explicit pin for upstream patched version ${firstPatchedVersion}`,
    ];
  }
  return applicableEntries.flatMap(([selector, version]) =>
    checkPatchedFloor(packageName, [version], firstPatchedVersion).map(
      (failure) => `${selector}: ${failure}`,
    ),
  );
}

export function inspectOpenAlerts(
  alerts,
  known = KNOWN_UNPATCHED_ADVISORIES,
  { lockText, resolutions = {}, removals = REVIEWED_REMOVALS } = {},
) {
  const failures = [];
  const reviewed = [];
  const patchedInCheckout = [];
  /** @type {Array<{ number: number; packageName?: string; ghsa?: string; classification: AlertClassification; lockedVersions: string[] }>} */
  const classified = [];
  const classify = (alert, packageName, ghsa, classification, lockedVersions = []) =>
    classified.push({ number: alert.number, packageName, ghsa, classification, lockedVersions });
  for (const alert of alerts) {
    const malformed = malformedAlert(alert);
    if (malformed) {
      failures.push(malformed);
      classify(alert, undefined, undefined, 'unresolved');
      continue;
    }
    const registered = known[alert.number];
    const packageName = alert.security_vulnerability?.package?.name;
    const ghsa = alert.security_advisory?.ghsa_id;
    if (!registered) {
      const firstPatchedVersion = alert.security_vulnerability?.first_patched_version?.identifier;
      const vulnerableVersionRange = alert.security_vulnerability?.vulnerable_version_range;
      if (firstPatchedVersion && packageName && lockText) {
        const versions = lockVersions(lockText, packageName);
        if (versions.length === 0) {
          if (removals[packageName]) {
            classify(alert, packageName, ghsa, 'removed-dependency');
            continue;
          }
          failures.push(
            `Dependabot alert #${alert.number} (${packageName}, ${ghsa ?? 'unknown GHSA'}) has a published fix but no locked package instance was found`,
          );
          classify(alert, packageName, ghsa, 'unresolved');
          continue;
        }
        if (removals[packageName]) {
          failures.push(
            `${packageName}: registered as removed but ${versions.join(', ')} is still locked; remove the register entry or the package`,
          );
        }
        const patchFailures = [
          ...checkPatchedFloor(packageName, versions, firstPatchedVersion, vulnerableVersionRange),
          ...checkManifestResolutionFloor(
            packageName,
            resolutions,
            firstPatchedVersion,
            versions,
            vulnerableVersionRange,
          ),
        ];
        failures.push(...patchFailures);
        if (patchFailures.length === 0) {
          patchedInCheckout.push({ number: alert.number, packageName, ghsa, firstPatchedVersion });
          classify(alert, packageName, ghsa, 'patched-in-checkout', versions);
        } else {
          classify(alert, packageName, ghsa, 'vulnerable-in-checkout', versions);
        }
        continue;
      }
      failures.push(
        `Dependabot alert #${alert.number} (${packageName ?? 'unknown package'}, ${ghsa ?? 'unknown GHSA'}) is open and has no reviewed register entry`,
      );
      classify(alert, packageName, ghsa, 'unresolved');
      continue;
    }
    if (registered.package !== packageName || registered.ghsa !== ghsa) {
      failures.push(
        `Dependabot alert #${alert.number} no longer matches its register entry: expected ${registered.package}/${registered.ghsa}, received ${packageName}/${ghsa}`,
      );
      classify(alert, packageName, ghsa, 'unresolved');
      continue;
    }
    // Accepted risk is never a fix: it stays its own classification.
    reviewed.push({ number: alert.number, packageName, ghsa });
    classify(
      alert,
      packageName,
      ghsa,
      'reviewed-unpatched',
      lockText ? lockVersions(lockText, packageName) : [],
    );
  }
  return { failures, reviewed, patchedInCheckout, classified };
}

/**
 * An alert record missing the fields the classification depends on. Treated
 * as a failure, never as nothing to report: a truncated or changed API
 * response must not read as a clean checkout.
 */
function malformedAlert(alert) {
  if (!alert || typeof alert !== 'object' || !Number.isInteger(alert.number)) {
    return 'Dependabot alerts API returned an alert without a numeric id';
  }
  const packageName = alert.security_vulnerability?.package?.name;
  const ghsa = alert.security_advisory?.ghsa_id;
  if (typeof packageName !== 'string' || packageName.length === 0 || typeof ghsa !== 'string') {
    return `Dependabot alert #${alert.number} has no package name or GHSA id`;
  }
  const patched = alert.security_vulnerability?.first_patched_version?.identifier;
  if (patched !== undefined && patched !== null && !semver.valid(patched)) {
    return `Dependabot alert #${alert.number} (${packageName}) has an unreadable patched version ${String(patched)}`;
  }
  const range = alert.security_vulnerability?.vulnerable_version_range;
  if (range !== undefined && range !== null && !semver.validRange(range.replace(/,\s*/g, ' '))) {
    return `Dependabot alert #${alert.number} (${packageName}) has an unreadable vulnerable range ${String(range)}`;
  }
  return undefined;
}

/**
 * The nonsecret inventory behind a verdict: when, against which revisions,
 * and how every open alert stands in the checkout. GitHub state is reported
 * as GitHub reports it; nothing here claims an alert closed.
 */
export function buildInventory({ alerts, classified, sourceSha, mainSha, generatedAt }) {
  const byNumber = new Map(classified.map((entry) => [entry.number, entry]));
  return {
    generatedAt,
    sourceSha,
    mainSha,
    githubOpenAlerts: alerts.length,
    classificationCounts: classified.reduce((counts, entry) => {
      counts[entry.classification] = (counts[entry.classification] ?? 0) + 1;
      return counts;
    }, {}),
    alerts: alerts.map((alert) => ({
      number: alert.number,
      githubState: alert.state ?? 'open',
      package: alert.security_vulnerability?.package?.name,
      ghsa: alert.security_advisory?.ghsa_id,
      severity: alert.security_advisory?.severity ?? alert.security_vulnerability?.severity,
      vulnerableVersionRange: alert.security_vulnerability?.vulnerable_version_range,
      firstPatchedVersion: alert.security_vulnerability?.first_patched_version?.identifier ?? null,
      manifest: alert.dependency?.manifest_path,
      scope: alert.dependency?.scope,
      relationship: alert.dependency?.relationship,
      lockedVersions: byNumber.get(alert.number)?.lockedVersions ?? [],
      classification: byNumber.get(alert.number)?.classification ?? 'unresolved',
    })),
  };
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
  const manifest = JSON.parse(readFileSync(new URL('package.json', ROOT), 'utf8'));
  const { failures, reviewed, patchedInCheckout, classified } = inspectOpenAlerts(alerts, known, {
    lockText,
    resolutions: manifest.resolutions ?? {},
  });

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
    const patchedVersions = packageVulnerabilities.filter(
      (vulnerability) => vulnerability.first_patched_version?.identifier,
    );
    const lockedVersions = lockVersions(lockText, entry.package);
    if (lockedVersions.length === 0) {
      failures.push(
        `${entry.package}: advisory is registered but no locked package instance was found`,
      );
      continue;
    }
    if (patchedVersions.length > 0) {
      for (const vulnerability of patchedVersions) {
        const firstPatchedVersion = vulnerability.first_patched_version.identifier;
        failures.push(
          ...checkPatchedFloor(
            entry.package,
            lockedVersions,
            firstPatchedVersion,
            vulnerability.vulnerable_version_range,
          ),
        );
        failures.push(
          ...checkManifestResolutionFloor(
            entry.package,
            manifest.resolutions ?? {},
            firstPatchedVersion,
            lockedVersions,
            vulnerability.vulnerable_version_range,
          ),
        );
      }
    } else if (alerts.some((alert) => alert.number === Number(number))) {
      process.stdout.write(
        `Reviewed open alert #${number}: ${entry.package} has no upstream patched version; ${entry.upstreamIssue}\n`,
      );
    }
  }

  if (failures.length > 0) throw new Error(failures.join('\n'));
  return {
    openAlertCount: alerts.length,
    reviewedAlertCount: reviewed.length,
    patchedAlertCount: patchedInCheckout.length,
    alerts,
    classified,
  };
}

async function listOpenAlerts(repository, token, fetchImpl) {
  const alerts = [];
  let url = `${API}/repos/${repository}/dependabot/alerts?state=open&per_page=100`;
  while (url) {
    const response = await githubResponse(url, token, fetchImpl);
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error('Dependabot alerts API returned a body that is not JSON');
    }
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

function matchesVersionRange(version, range) {
  return semver.satisfies(version, normalizeVulnerableVersionRange(range));
}

function resolutionTargetsRange(selector, packageName, vulnerableVersionRange) {
  if (!vulnerableVersionRange || selector === packageName) return true;
  const prefix = `${packageName}@npm:`;
  if (!selector.startsWith(prefix)) return true;
  const versionRange = selector.slice(prefix.length);
  if (!semver.validRange(versionRange)) return true;
  return semver.intersects(versionRange, normalizeVulnerableVersionRange(vulnerableVersionRange));
}

function normalizeVulnerableVersionRange(range) {
  const normalized = range.replace(/,\s*/g, ' ');
  if (!semver.validRange(normalized)) {
    throw new Error(`Expected a valid GitHub vulnerable version range, received ${range}`);
  }
  return normalized;
}

function gitRevision(ref) {
  try {
    return execFileSync('git', ['rev-parse', ref], {
      cwd: fileURLToPath(ROOT),
      encoding: 'utf8',
    }).trim();
  } catch {
    return null;
  }
}

async function main() {
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY ?? repositoryFromOrigin();
  const result = await checkDependabotAlerts({ repository, token });
  if (process.argv.includes('--report')) {
    const inventory = buildInventory({
      alerts: result.alerts,
      classified: result.classified,
      sourceSha: gitRevision('HEAD'),
      mainSha: gitRevision('origin/main'),
      generatedAt: new Date().toISOString(),
    });
    process.stdout.write(`${JSON.stringify(inventory, null, 2)}\n`);
    return;
  }
  process.stdout.write(
    `Dependabot audit passed: ${result.openAlertCount} open alerts, ${result.reviewedAlertCount} reviewed entries, ${result.patchedAlertCount} patched in checkout\n`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`Dependabot audit failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
