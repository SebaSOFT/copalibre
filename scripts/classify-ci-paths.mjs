#!/usr/bin/env node
// Classifies a pull request's changed paths for ci.yml's `detect-changes`
// job: `frontendOnly` gates whether `integration-tests` runs, `backendOnly`
// gates `e2e-tests` and `public-web-build`, and `cliOnly`/`docsOnly` gate
// `openapi-contract-lint`.
//
// Root dependencies, package manager configuration, shared test/type configurations,
// and workflow files take a conservative full-scope path (no skips).
// Workspace changes account for reverse consumers (e.g. apps/web consuming
// packages/domain, packages/rules, packages/tournament-engine, packages/contracts).
// Ambiguous or unresolved paths fall back conservatively to full scope with reasons.

import { readFileSync } from 'node:fs';

// Global files and shared tooling configuration: changes force full scope.
export const GLOBAL_CONFIG_PATTERN =
  /^(package\.json$|yarn\.lock$|\.yarnrc\.yml$|\.yarn\/|tsconfig(\..+)?\.json$|jest\.config(\..+)?$|jest\.integration\.config(\..+)?$|playwright\.config\.ts$|playwright\.compose\.config\.ts$|eslint\.config(\..+)?$|\.prettierrc(\..+)?$|\.github\/|scripts\/classify-ci-paths\.|docker-compose.*\.ya?ml$|Dockerfile.*|deploy\/)/;

// Paths strictly confined to frontend code or apps/web content
export const FRONTEND_PATTERN =
  /^(apps\/web\/|e2e\/|playwright\.config\.ts$|playwright\.compose\.config\.ts$)/;

// Paths relevant to frontend (apps/web or browser e2e tests).
// If any path in a diff matches this, the diff CANNOT be backendOnly.
// Includes apps/web, e2e tests, and all workspace packages consumed by apps/web.
export const FRONTEND_RELEVANT_PATTERN =
  /^(apps\/web\/|e2e\/|playwright\.config\.ts$|playwright\.compose\.config\.ts$|packages\/design-tokens\/|packages\/routing\/|packages\/realtime\/|packages\/contracts\/|packages\/domain\/|packages\/rules\/|packages\/tournament-engine\/|packages\/object-storage\/)/;

// Paths relevant to backend services, APIs, persistence, or background jobs.
// If any path in a diff matches this, the diff CANNOT be frontendOnly.
export const BACKEND_RELEVANT_PATTERN =
  /^(apps\/api\/|apps\/events\/|apps\/worker\/|apps\/scheduler\/|apps\/migrate\/|apps\/seed\/|packages\/persistence\/|packages\/auth\/|packages\/statistics-refold\/|packages\/module-catalogue\/|packages\/module-distribution\/|packages\/domain\/|packages\/rules\/|packages\/tournament-engine\/|packages\/contracts\/|packages\/object-storage\/|packages\/routing\/|packages\/realtime\/)/;

// Content-only documentation under apps/web
export const CONTENT_ONLY_PATTERN = /^apps\/web\/src\/content\//;

// Isolated CLI application (apps/copalibre has no internal consumers)
export const CLI_ONLY_PATTERN = /^apps\/copalibre\//;

// Markdown / prose documentation
export const DOCS_ONLY_PATTERN =
  /^(docs\/|README\.md$|RELEASE\.md$|AGENTS\.md$|THIRD_PARTY_NOTICES\.md$|CHANGELOG\.md$)/;

export const WORKFLOW_PATTERN = /^\.github\//;

/**
 * Checks if a path is recognized within known workspace, config, or doc areas.
 * @param {string} path
 * @returns {boolean}
 */
export function isKnownPath(path) {
  return (
    GLOBAL_CONFIG_PATTERN.test(path) ||
    FRONTEND_RELEVANT_PATTERN.test(path) ||
    BACKEND_RELEVANT_PATTERN.test(path) ||
    CLI_ONLY_PATTERN.test(path) ||
    DOCS_ONLY_PATTERN.test(path) ||
    CONTENT_ONLY_PATTERN.test(path)
  );
}

/**
 * Classifies changed paths into scope flags with inspectable reasons.
 *
 * @param {readonly string[]} changedPaths
 * @param {{ isWorkflowChange?: boolean }} [options]
 * @returns {{
 *   frontendOnly: boolean,
 *   backendOnly: boolean,
 *   cliOnly: boolean,
 *   docsOnly: boolean,
 *   isFullScope: boolean,
 *   fallback: boolean,
 *   reasons: string[],
 * }}
 */
export function classify(changedPaths, options = {}) {
  const reasons = [];

  if (options.isWorkflowChange === true) {
    reasons.push('Explicit workflow change option set');
    return {
      frontendOnly: false,
      backendOnly: false,
      cliOnly: false,
      docsOnly: false,
      isFullScope: true,
      fallback: false,
      reasons,
    };
  }

  if (changedPaths.length === 0) {
    reasons.push('Empty diff: full verification scope required');
    return {
      frontendOnly: false,
      backendOnly: false,
      cliOnly: false,
      docsOnly: false,
      isFullScope: true,
      fallback: false,
      reasons,
    };
  }

  // Check for global configuration, root manifests, or workflow changes
  const globalMatch = changedPaths.find((path) => GLOBAL_CONFIG_PATTERN.test(path));
  if (globalMatch) {
    reasons.push(`Global dependency, workflow, or configuration change: ${globalMatch}`);
    return {
      frontendOnly: false,
      backendOnly: false,
      cliOnly: false,
      docsOnly: false,
      isFullScope: true,
      fallback: false,
      reasons,
    };
  }

  // Check for unmapped, ambiguous, or deleted paths outside known areas
  const unknownPath = changedPaths.find((path) => !isKnownPath(path));
  if (unknownPath) {
    reasons.push(`Conservative fallback: unmapped or ambiguous path: ${unknownPath}`);
    return {
      frontendOnly: false,
      backendOnly: false,
      cliOnly: false,
      docsOnly: false,
      isFullScope: true,
      fallback: true,
      reasons,
    };
  }

  // Check if every path is frontend-only
  const frontendOnly = changedPaths.every((path) => FRONTEND_PATTERN.test(path));
  if (frontendOnly) {
    reasons.push('Confined to frontend-only paths');
  }

  // Check if every path is backend-only:
  // A path is backend-only if it does not affect the frontend (or is content-only documentation).
  const backendOnly = changedPaths.every(
    (path) => !FRONTEND_RELEVANT_PATTERN.test(path) || CONTENT_ONLY_PATTERN.test(path),
  );
  if (backendOnly && !frontendOnly) {
    reasons.push('Confined to backend-only paths (no frontend consumer affected)');
  }

  // Check if diff is confined to the isolated CLI tool
  const cliOnly = changedPaths.every((path) => CLI_ONLY_PATTERN.test(path));
  if (cliOnly) {
    reasons.push('Confined to isolated CLI tool');
  }

  // Check if diff is confined to documentation and/or content collections
  const docsOnly = changedPaths.every(
    (path) => DOCS_ONLY_PATTERN.test(path) || CONTENT_ONLY_PATTERN.test(path),
  );
  if (docsOnly) {
    reasons.push('Confined to documentation or content collections');
  }

  // If a shared package is changed that affects both frontend and backend
  const hasFrontend = changedPaths.some(
    (path) => FRONTEND_RELEVANT_PATTERN.test(path) && !CONTENT_ONLY_PATTERN.test(path),
  );
  const hasBackend = changedPaths.some((path) => BACKEND_RELEVANT_PATTERN.test(path));
  if (hasFrontend && hasBackend && !frontendOnly && !backendOnly) {
    reasons.push('Touches shared package(s) affecting both frontend and backend consumers');
  }

  return {
    frontendOnly,
    backendOnly,
    cliOnly,
    docsOnly,
    isFullScope: !frontendOnly && !backendOnly && !cliOnly && !docsOnly,
    fallback: false,
    reasons,
  };
}

/**
 * Evaluates whether a CI run qualifies as a release candidate.
 * Independent of source path scope.
 *
 * @param {{
 *   eventName?: string,
 *   baseRef?: string,
 *   ref?: string,
 * }} eventContext
 * @returns {boolean}
 */
export function evaluateReleaseEligibility(eventContext = {}) {
  const { eventName, baseRef, ref } = eventContext;
  if (eventName === 'workflow_dispatch') return true;
  if (eventName === 'push' && ref === 'refs/heads/main') return true;
  if (eventName === 'pull_request' && baseRef === 'main') return true;
  return false;
}

/**
 * Resolves the planned verification jobs based on path classification,
 * release candidate status, and event type.
 *
 * @param {{
 *   frontendOnly: boolean,
 *   backendOnly: boolean,
 *   cliOnly: boolean,
 *   docsOnly: boolean,
 * }} classification
 * @param {boolean} isReleaseCandidate
 * @param {{
 *   eventName?: string,
 *   ref?: string,
 * }} [eventContext]
 * @returns {{
 *   lint: boolean,
 *   typecheck: boolean,
 *   unitTests: boolean,
 *   helpDocsBuild: boolean,
 *   publicWebBuild: boolean,
 *   integrationTests: boolean,
 *   e2eTests: boolean,
 *   releaseBuild: boolean,
 *   openapiContractLint: boolean,
 * }}
 */
export function resolveJobPlan(classification, isReleaseCandidate, eventContext = {}) {
  // Manual dispatch and push-to-main select full scope (path skips disabled)
  const isFullScopeEvent =
    eventContext.eventName === 'workflow_dispatch' ||
    (eventContext.eventName === 'push' && eventContext.ref === 'refs/heads/main');

  const effectiveClassification = isFullScopeEvent
    ? { frontendOnly: false, backendOnly: false, cliOnly: false, docsOnly: false }
    : classification;

  return {
    lint: true,
    typecheck: true,
    unitTests: true,
    helpDocsBuild: true,
    publicWebBuild: !effectiveClassification.backendOnly,
    integrationTests: !effectiveClassification.frontendOnly,
    e2eTests: !effectiveClassification.backendOnly && isReleaseCandidate,
    releaseBuild: !effectiveClassification.frontendOnly && isReleaseCandidate,
    openapiContractLint: !effectiveClassification.cliOnly && !effectiveClassification.docsOnly,
  };
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
  const { frontendOnly, backendOnly, cliOnly, docsOnly, reasons } = classify(changedPaths, {
    isWorkflowChange,
  });
  process.stdout.write(`frontend_only=${frontendOnly}\n`);
  process.stdout.write(`backend_only=${backendOnly}\n`);
  process.stdout.write(`cli_only=${cliOnly}\n`);
  process.stdout.write(`docs_only=${docsOnly}\n`);
  if (reasons && reasons.length > 0) {
    process.stdout.write(`reasons=${reasons.join('; ')}\n`);
  }
}
