/**
 * OpenSpec 0221 Aggregate Status Evaluator.
 *
 * Preserves stable required aggregate check names:
 * - 'Unit tests'
 * - 'Integration tests'
 * - 'E2E tests'
 * - 'Public web build'
 * - 'Help docs build'
 *
 * Ensures aggregate status distinguishes an intentionally excluded group/check
 * from a missing, failed, or cancelled required group.
 * A required-child failure alongside an intentionally excluded group MUST fail.
 * A cancelled or unrecorded required child MUST fail.
 */

export const STABLE_CHECK_NAMES = [
  'Unit tests',
  'Integration tests',
  'E2E tests',
  'Public web build',
  'Help docs build',
];

/**
 * @typedef {'success' | 'failure' | 'cancelled' | 'skipped'} JobResult
 */

/**
 * @param {Object} params
 * @param {string} params.checkName
 * @param {string[]} params.requiredChildren - job IDs that were expected to execute
 * @param {string[]} [params.excludedChildren] - job IDs intentionally excluded by path scope
 * @param {Record<string, JobResult>} params.childResults - actual job outcome map
 * @param {boolean} [params.checkExcluded] - true if the entire family was excluded by scope
 * @returns {{ outcome: 'success' | 'failure' | 'skipped', reason?: string }}
 */
export function evaluateAggregateStatus({
  checkName,
  requiredChildren,
  excludedChildren = [],
  childResults,
  checkExcluded = false,
}) {
  if (checkExcluded) {
    return {
      outcome: 'skipped',
      reason: `Check '${checkName}' was intentionally excluded by change scope`,
    };
  }

  // 1. Check for any required children that failed
  for (const child of requiredChildren) {
    const result = childResults[child];
    if (result === 'failure') {
      return {
        outcome: 'failure',
        reason: `Required child '${child}' in '${checkName}' failed`,
      };
    }
    if (result === 'cancelled') {
      return {
        outcome: 'failure',
        reason: `Required child '${child}' in '${checkName}' was cancelled`,
      };
    }
    if (!result) {
      return {
        outcome: 'failure',
        reason: `Required child '${child}' in '${checkName}' never reported a result`,
      };
    }
    if (result === 'skipped') {
      // If a required child skipped without being in excludedChildren, that is unexpected
      if (!excludedChildren.includes(child)) {
        return {
          outcome: 'failure',
          reason: `Required child '${child}' in '${checkName}' was unexpectedly skipped`,
        };
      }
    }
  }

  // 2. If requiredChildren is empty but excludedChildren has members
  if (requiredChildren.length === 0 && excludedChildren.length > 0) {
    return {
      outcome: 'skipped',
      reason: `All groups for '${checkName}' were intentionally excluded`,
    };
  }

  // 3. All required children reported 'success'
  return {
    outcome: 'success',
  };
}

// CLI entrypoint
if (process.argv[1] && process.argv[1].endsWith('evaluate-ci-aggregate.mjs')) {
  const args = Object.fromEntries(
    process.argv
      .slice(2)
      .filter((arg) => arg.startsWith('--'))
      .map((arg) => {
        const [k, v] = arg.slice(2).split('=');
        return [k, v ?? 'true'];
      }),
  );

  const checkName = args['check'] || 'Unit tests';
  const required = args['required'] ? args['required'].split(',') : [];
  const excluded = args['excluded'] ? args['excluded'].split(',') : [];
  const checkExcluded = args['check-excluded'] === 'true';
  const resultsJson = args['results'] || '{}';

  let childResults = {};
  try {
    childResults = JSON.parse(resultsJson);
  } catch (err) {
    process.stderr.write(`::error::Invalid JSON in --results: ${err.message}\n`);
    process.exit(1);
  }

  const verdict = evaluateAggregateStatus({
    checkName,
    requiredChildren: required,
    excludedChildren: excluded,
    childResults,
    checkExcluded,
  });

  if (verdict.outcome === 'failure') {
    process.stderr.write(`::error::${verdict.reason}\n`);
    process.exit(1);
  }

  process.stdout.write(
    `Aggregate '${checkName}': ${verdict.outcome} ${verdict.reason ? `(${verdict.reason})` : ''}\n`,
  );
  process.exit(0);
}
