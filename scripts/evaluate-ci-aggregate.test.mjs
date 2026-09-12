import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAggregateStatus, STABLE_CHECK_NAMES } from './evaluate-ci-aggregate.mjs';

describe('evaluate-ci-aggregate', () => {
  it('defines the 5 stable required aggregate check names', () => {
    assert.deepEqual(STABLE_CHECK_NAMES, [
      'Unit tests',
      'Integration tests',
      'E2E tests',
      'Public web build',
      'Help docs build',
    ]);
  });

  it('passes when all required children succeed', () => {
    const result = evaluateAggregateStatus({
      checkName: 'Unit tests',
      requiredChildren: ['unit-group-1', 'unit-group-2'],
      childResults: {
        'unit-group-1': 'success',
        'unit-group-2': 'success',
      },
    });

    assert.equal(result.outcome, 'success');
  });

  it('fails when a required child fails alongside an intentionally excluded group', () => {
    const result = evaluateAggregateStatus({
      checkName: 'Integration tests',
      requiredChildren: ['integration-group-1'],
      excludedChildren: ['integration-group-2'],
      childResults: {
        'integration-group-1': 'failure',
        'integration-group-2': 'skipped',
      },
    });

    assert.equal(result.outcome, 'failure');
    assert.match(result.reason ?? '', /integration-group-1.*failed/i);
  });

  it('fails when a required child is cancelled', () => {
    const result = evaluateAggregateStatus({
      checkName: 'E2E tests',
      requiredChildren: ['e2e-shard-1', 'e2e-shard-2'],
      childResults: {
        'e2e-shard-1': 'success',
        'e2e-shard-2': 'cancelled',
      },
    });

    assert.equal(result.outcome, 'failure');
    assert.match(result.reason ?? '', /cancelled/i);
  });

  it('fails when a required child never reported a result', () => {
    const result = evaluateAggregateStatus({
      checkName: 'Unit tests',
      requiredChildren: ['unit-group-1', 'unit-group-2'],
      childResults: {
        'unit-group-1': 'success',
      },
    });

    assert.equal(result.outcome, 'failure');
    assert.match(result.reason ?? '', /never reported/i);
  });

  it('reports clean skipped status when entire check is intentionally excluded', () => {
    const result = evaluateAggregateStatus({
      checkName: 'Integration tests',
      requiredChildren: [],
      childResults: {},
      checkExcluded: true,
    });

    assert.equal(result.outcome, 'skipped');
    assert.match(result.reason ?? '', /intentionally excluded/i);
  });

  it('fails when a required child is unexpectedly skipped', () => {
    const result = evaluateAggregateStatus({
      checkName: 'Public web build',
      requiredChildren: ['web-inspect'],
      excludedChildren: [],
      childResults: {
        'web-inspect': 'skipped',
      },
    });

    assert.equal(result.outcome, 'failure');
    assert.match(result.reason ?? '', /unexpectedly skipped/i);
  });

  // Task 1.9 failure injection test across all 5 families
  for (const family of STABLE_CHECK_NAMES) {
    it(`failure-injection: ${family} aggregate cannot report success if its worker fails`, () => {
      const result = evaluateAggregateStatus({
        checkName: family,
        requiredChildren: [`${family}-worker`],
        childResults: {
          [`${family}-worker`]: 'failure',
        },
      });

      assert.notEqual(result.outcome, 'success');
      assert.equal(result.outcome, 'failure');
    });
  }
});
