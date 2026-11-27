import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * Refuses to publish a release asset unless the checked-out commit is the one
 * the release tag names.
 *
 * The CLI release workflow uploads installer and binary assets to the
 * GitHub Release `v<version>`. The version comes from the checked-out
 * `apps/copalibre/package.json`, so a manual dispatch from any commit carrying
 * the same version string would otherwise attach bytes built from that commit
 * to a release it never was. A `workflow_run` trigger must also come from a
 * successful Release run on `main` in this repository; a
 * successful conclusion alone is not enough.
 */

/**
 * @param {{
 *   version: string,
 *   headSha: string,
 *   tagSha: string | undefined,
 *   event: string,
 *   upstream?: { name?: string, event?: string, headBranch?: string, conclusion?: string, repository?: string, headSha?: string },
 *   repository: string,
 * }} input
 * @returns {string[]} reasons publication is refused; empty when it may proceed
 */
export function releaseSourceProblems(input) {
  const problems = [];
  const tag = `v${input.version}`;
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(input.version)) {
    problems.push(`version "${input.version}" is not a release version`);
  }
  if (!/^[0-9a-f]{40}$/.test(input.headSha)) {
    problems.push('the checked-out commit is not a full SHA');
  }
  if (input.tagSha === undefined) {
    problems.push(`tag ${tag} does not exist; the Release workflow creates it before assets`);
  } else if (input.tagSha !== input.headSha) {
    problems.push(
      `tag ${tag} names ${input.tagSha}, but the checked-out commit is ${input.headSha}`,
    );
  }

  if (input.event === 'workflow_run') {
    const upstream = input.upstream ?? {};
    if (upstream.name !== 'Release') problems.push('the triggering workflow is not Release');
    if (upstream.event !== 'push' && upstream.event !== 'workflow_dispatch') {
      problems.push('the triggering Release run was neither a push nor a manual run');
    }
    if (upstream.headBranch !== 'main') problems.push('the triggering Release run was not on main');
    if (upstream.conclusion !== 'success')
      problems.push('the triggering Release run did not succeed');
    if (upstream.repository !== input.repository) {
      problems.push('the triggering Release run belongs to another repository');
    }
    if (upstream.headSha !== input.headSha) {
      problems.push('the triggering Release run built another commit');
    }
  } else if (input.event !== 'workflow_dispatch') {
    problems.push(`event "${input.event}" may not publish release assets`);
  }
  return problems;
}

function git(args) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return undefined;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const version = JSON.parse(readFileSync('apps/copalibre/package.json', 'utf8')).version;
  const event = process.env.GITHUB_EVENT_NAME ?? '';
  const payload = process.env.GITHUB_EVENT_PATH
    ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
    : {};
  const run = payload.workflow_run;
  const problems = releaseSourceProblems({
    version,
    headSha: git(['rev-parse', 'HEAD']) ?? '',
    tagSha: git(['rev-parse', '--verify', '--quiet', `refs/tags/v${version}^{commit}`]),
    event,
    repository: process.env.GITHUB_REPOSITORY ?? '',
    upstream: run && {
      name: run.name,
      event: run.event,
      headBranch: run.head_branch,
      conclusion: run.conclusion,
      repository: run.repository?.full_name,
      headSha: run.head_sha,
    },
  });
  if (problems.length > 0) {
    for (const problem of problems) process.stderr.write(`Refusing to publish: ${problem}\n`);
    process.exit(1);
  }
  process.stdout.write(`Release source verified: v${version} is the checked-out commit.\n`);
}
