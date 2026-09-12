import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * OpenSpec 0221 Build Artifact Identity Validation.
 * Tags and validates build artifacts with run, commit, and configuration identity.
 *
 * @typedef {Object} BuildIdentity
 * @property {string} runId
 * @property {string} runAttempt
 * @property {string} commitSha
 * @property {string} configuration
 * @property {string} createdAt
 */

/**
 * @param {{ runId?: string, runAttempt?: string, commitSha?: string, configuration?: string }} options
 * @returns {BuildIdentity}
 */
export function generateBuildIdentity(options = {}) {
  return {
    runId: options.runId || process.env.GITHUB_RUN_ID || 'local',
    runAttempt: options.runAttempt || process.env.GITHUB_RUN_ATTEMPT || '1',
    commitSha: options.commitSha || process.env.GITHUB_SHA || 'local',
    configuration: options.configuration || process.env.BUILD_CONFIGURATION || 'production',
    createdAt: new Date().toISOString(),
  };
}

/**
 * @param {string} distDir
 * @param {BuildIdentity} identity
 * @returns {string}
 */
export function writeBuildIdentity(distDir, identity) {
  const filePath = join(distDir, '.build-identity.json');
  writeFileSync(filePath, JSON.stringify(identity, null, 2), 'utf8');
  return filePath;
}

/**
 * @param {string} distDir
 * @param {{ runId?: string, commitSha?: string, configuration?: string }} expected
 * @returns {{ valid: boolean, error?: string, identity?: BuildIdentity }}
 */
export function verifyBuildIdentity(distDir, expected = {}) {
  const filePath = join(distDir, '.build-identity.json');
  if (!existsSync(filePath)) {
    return {
      valid: false,
      error: `Build artifact identity manifest not found at ${filePath}`,
    };
  }

  let identity;
  try {
    identity = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (err) {
    return {
      valid: false,
      error: `Failed to parse build identity manifest: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (expected.commitSha && identity.commitSha !== expected.commitSha) {
    return {
      valid: false,
      error: `Build artifact commit SHA mismatch: expected ${expected.commitSha} but found ${identity.commitSha}`,
      identity,
    };
  }

  if (expected.runId && identity.runId !== expected.runId) {
    return {
      valid: false,
      error: `Build artifact run ID mismatch: expected ${expected.runId} but found ${identity.runId}`,
      identity,
    };
  }

  if (expected.configuration && identity.configuration !== expected.configuration) {
    return {
      valid: false,
      error: `Build artifact configuration mismatch: expected ${expected.configuration} but found ${identity.configuration}`,
      identity,
    };
  }

  return { valid: true, identity };
}

// CLI entrypoint
if (process.argv[1] && process.argv[1].endsWith('build-identity.mjs')) {
  const action = process.argv[2];
  const args = Object.fromEntries(
    process.argv
      .slice(3)
      .filter((arg) => arg.startsWith('--'))
      .map((arg) => {
        const [k, v] = arg.slice(2).split('=');
        return [k, v ?? 'true'];
      }),
  );

  const dist = args['dist'] || 'apps/web/dist';

  if (action === 'generate') {
    const identity = generateBuildIdentity({
      runId: args['run-id'],
      runAttempt: args['run-attempt'],
      commitSha: args['commit-sha'],
      configuration: args['config'],
    });
    const manifestPath = writeBuildIdentity(dist, identity);
    process.stdout.write(`Build identity written to ${manifestPath}\n`);
    process.exit(0);
  } else if (action === 'verify') {
    const result = verifyBuildIdentity(dist, {
      runId: args['run-id'],
      commitSha: args['commit-sha'],
      configuration: args['config'],
    });
    if (!result.valid) {
      process.stderr.write(`::error::${result.error}\n`);
      process.exit(1);
    }
    process.stdout.write(
      `Build identity verified: commit ${result.identity?.commitSha} (${result.identity?.configuration})\n`,
    );
    process.exit(0);
  } else {
    process.stderr.write(
      `Usage: node scripts/build-identity.mjs <generate|verify> [--dist=path] [--run-id=id] [--commit-sha=sha] [--config=conf]\n`,
    );
    process.exit(1);
  }
}
