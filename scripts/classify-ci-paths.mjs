#!/usr/bin/env node
// Classifies a pull request's changed paths for ci.yml's `detect-changes`
// job: `frontendOnly` gates whether `integration-tests` runs, `backendOnly`
// gates `e2e-tests`, and `cliOnly`/`docsOnly` gate `openapi-contract-lint`
// (apps/copalibre has no other workspace consumer and defines no API
// endpoints of its own, and neither prose nor Starlight content can change
// what apps/api generates — neither category can affect the OpenAPI
// contract). A changed path under a content collection
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
export const CLI_ONLY_PATTERN = /^apps\/copalibre\//;
export const DOCS_ONLY_PATTERN =
  /^(docs\/|README\.md$|RELEASE\.md$|AGENTS\.md$|THIRD_PARTY_NOTICES\.md$)/;
export const WORKFLOW_PATTERN = /^\.github\/workflows\//;

/**
 * @param {readonly string[]} changedPaths
 * @param {{ isWorkflowChange?: boolean }} [options]
 * @returns {{ frontendOnly: boolean, backendOnly: boolean, cliOnly: boolean, docsOnly: boolean }}
 */
export function classify(changedPaths, options = {}) {
  const workflowChanged =
    options.isWorkflowChange === true || changedPaths.some((path) => WORKFLOW_PATTERN.test(path));

  // A workflow-file change is exactly the PR that must never trust any of
  // these skip paths — including this one, the first time it existed at
  // all: skipping a job for a change to the logic that skips that same job
  // would mean the skip's own correctness goes unverified by the PR that
  // changes it.
  if (changedPaths.length === 0 || workflowChanged) {
    return { frontendOnly: false, backendOnly: false, cliOnly: false, docsOnly: false };
  }

  const frontendOnly = changedPaths.every((path) => FRONTEND_PATTERN.test(path));

  // A path counts against backendOnly only if it's frontend-relevant AND
  // not content-only — frontend-irrelevant paths never counted either way,
  // and a content-only path is frontend-relevant but doesn't need e2e-tests
  // on its own.
  const backendOnly = changedPaths.every(
    (path) => !FRONTEND_RELEVANT_PATTERN.test(path) || CONTENT_ONLY_PATTERN.test(path),
  );

  // apps/copalibre has no other workspace consumer (nothing in the monorepo
  // imports from it), so a diff confined to it can't affect any other
  // workspace's own tests or build.
  const cliOnly = changedPaths.every((path) => CLI_ONLY_PATTERN.test(path));

  // "Documentation" here means prose, not code: repo-level docs/ and the
  // handful of root-level prose files, unioned with the Starlight content
  // collections already recognized above as content-only.
  const docsOnly = changedPaths.every(
    (path) => DOCS_ONLY_PATTERN.test(path) || CONTENT_ONLY_PATTERN.test(path),
  );

  return { frontendOnly, backendOnly, cliOnly, docsOnly };
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
  const { frontendOnly, backendOnly, cliOnly, docsOnly } = classify(changedPaths, {
    isWorkflowChange,
  });
  process.stdout.write(`frontend_only=${frontendOnly}\n`);
  process.stdout.write(`backend_only=${backendOnly}\n`);
  process.stdout.write(`cli_only=${cliOnly}\n`);
  process.stdout.write(`docs_only=${docsOnly}\n`);
}
