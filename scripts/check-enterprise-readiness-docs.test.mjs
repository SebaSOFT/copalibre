import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  containsReadinessClaim,
  extractEvidenceLinks,
  validateReadinessGate,
} from './check-enterprise-readiness-docs.mjs';

test('a doc with no readiness language needs no evidence links', () => {
  const doc = '# Enterprise Kubernetes\n\nThis chart supports autoscaling.\n';
  assert.equal(containsReadinessClaim(doc), false);
  const { ok, problems } = validateReadinessGate(doc, () => undefined);
  assert.equal(ok, true);
  assert.deepEqual(problems, []);
});

test('extracts evidence markdown links', () => {
  const doc =
    '[latest](evidence/multi-node-failover-20260101T000000Z.md) and ' +
    '[other](evidence/backup-restore-20260101T000000Z.md) and [not evidence](README.md)';
  assert.deepEqual(extractEvidenceLinks(doc), [
    'evidence/multi-node-failover-20260101T000000Z.md',
    'evidence/backup-restore-20260101T000000Z.md',
  ]);
});

test('a readiness claim with no evidence links at all fails on both categories', () => {
  const doc = 'CopaLibre is enterprise-ready for Kubernetes.\n';
  const { ok, problems } = validateReadinessGate(doc, () => undefined);
  assert.equal(ok, false);
  assert.equal(problems.length, 2);
  assert.match(problems[0], /multi-node-failover/);
  assert.match(problems[1], /backup-restore/);
});

test('a readiness claim with linked but non-passing reports fails', () => {
  const doc =
    'This is enterprise-ready. See ' +
    '[report](evidence/multi-node-failover-20260101T000000Z.md) and ' +
    '[report](evidence/backup-restore-20260101T000000Z.md).\n';
  const { ok, problems } = validateReadinessGate(
    doc,
    () => '# Result: FAIL — node did not recover',
  );
  assert.equal(ok, false);
  assert.equal(problems.length, 2);
});

test('a readiness claim with linked, existing, passing reports for both categories passes', () => {
  const doc =
    'This is enterprise-ready. See ' +
    '[report](evidence/multi-node-failover-20260101T000000Z.md) and ' +
    '[report](evidence/backup-restore-20260101T000000Z.md).\n';
  const { ok, problems } = validateReadinessGate(doc, (link) =>
    link.includes('multi-node-failover') ? '- Result: PASS\n' : '- Result: PASS\n',
  );
  assert.equal(ok, true);
  assert.deepEqual(problems, []);
});

test('a readiness claim missing only the backup-restore link fails just that category', () => {
  const doc =
    'This is enterprise-ready. See [report](evidence/multi-node-failover-20260101T000000Z.md).\n';
  const { ok, problems } = validateReadinessGate(doc, () => '- Result: PASS\n');
  assert.equal(ok, false);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /backup-restore/);
});

test('a linked report that does not exist on disk fails', () => {
  const doc =
    'This is enterprise-ready. See ' +
    '[report](evidence/multi-node-failover-20260101T000000Z.md) and ' +
    '[report](evidence/backup-restore-20260101T000000Z.md).\n';
  const { ok, problems } = validateReadinessGate(doc, () => undefined);
  assert.equal(ok, false);
  assert.equal(problems.length, 2);
});
