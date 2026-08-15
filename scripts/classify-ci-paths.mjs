#!/usr/bin/env node
// Classifies a pull request's changed paths for ci.yml's `detect-changes`
// job: `frontendOnly` gates whether `integration-tests` runs, `backendOnly`
// gates `e2e-tests`. A changed path under a content collection
// (`apps/web/src/content/**` — Astro/Starlight data, not code; see
// `apps/web/src/content.config.ts`) doesn't count toward `backendOnly` on
// its own, since "Help docs build" already validates content changes
// structurally on every PR regardless of this classification.
import { readFileSync } from 'node:fs';

export const FRONTEND_PATTERN =
  /^(apps\/web\/|e2e\/|playwright\.config\.ts$|playwright\.compose\.config\.ts$)/;
export const FRONTEND_RELEVANT_PATTERN =
  /^(apps\/web\/|e2e\/|playwright\.config\.ts$|playwright\.compose\.config\.ts$|packages\/design-tokens\/|packages\/routing\/|packages\/realtime\/)/;
export const CONTENT_ONLY_PATTERN = /^apps\/web\/src\/content\//;
export const WORKFLOW_PATTERN = /^\.github\/workflows\//;

/**
 * @param {readonly string[]} changedPaths
 * @param {{ isWorkflowChange?: boolean }} [options]
 * @returns {{ frontendOnly: boolean, backendOnly: boolean }}
 */
export function classify(changedPaths, options = {}) {
  const workflowChanged =
    options.isWorkflowChange === true || changedPaths.some((path) => WORKFLOW_PATTERN.test(path));

  // A workflow-file change is exactly the PR that must never trust either
  // skip path — including this one, the first time it existed at all:
  // skipping e2e-tests/integration-tests for a change to the logic that
  // skips e2e-tests/integration-tests would mean the skip's own correctness
  // goes unverified by the PR that changes it.
  if (changedPaths.length === 0 || workflowChanged) {
    return { frontendOnly: false, backendOnly: false };
  }

  const frontendOnly = changedPaths.every((path) => FRONTEND_PATTERN.test(path));

  // A path counts against backendOnly only if it's frontend-relevant AND
  // not content-only — frontend-irrelevant paths never counted either way,
  // and a content-only path is frontend-relevant but doesn't need e2e-tests
  // on its own.
  const backendOnly = changedPaths.every(
    (path) => !FRONTEND_RELEVANT_PATTERN.test(path) || CONTENT_ONLY_PATTERN.test(path),
  );

  return { frontendOnly, backendOnly };
}

function parseChangedPaths(stdinText) {
  return stdinText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const changedPaths = parseChangedPaths(readFileSync(0, 'utf8'));
  const isWorkflowChange = process.argv.includes('--workflow-change');
  const { frontendOnly, backendOnly } = classify(changedPaths, { isWorkflowChange });
  process.stdout.write(`frontend_only=${frontendOnly}\n`);
  process.stdout.write(`backend_only=${backendOnly}\n`);
}
