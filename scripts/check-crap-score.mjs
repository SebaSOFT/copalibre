import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/**
 * Change-risk (CRAP) score: complexity^2 * (1 - coverage)^3 + complexity.
 * A function that is both complex and undertested scores high; either a low
 * complexity or a high coverage collapses the score back toward `complexity`.
 * See openspec/changes/0227-crap-score-reporting/design.md for the formula source
 * and threshold rationale.
 */
export const THRESHOLD = 30;

/**
 * Ratcheting debt register — same shape and rule as KNOWN_HARDCODED in
 * check-ui-text-catalogue-coverage.mjs. Key:
 * `<workspace>/<relative-file-path>#<enclosing named symbol>[.<nth-anonymous-child>]`.
 * Value: the CRAP score recorded when the function was grandfathered. A
 * recomputed score above THRESHOLD that isn't here, or a recorded score that
 * rises, fails the check. A recorded score may only fall (or be deleted once
 * it's fully addressed) — debt cannot grow back silently.
 */
export const KNOWN_CRAP = new Map([
  // Recorded by openspec 0227's first repository-wide run (tasks.md 1.7). A
  // score may only fall from here, or the entry be deleted once it does.
  // seriesStateBarLabels resolved by openspec 0228 (added tests; score 9.01).
  // titleFor resolved by openspec 0228 (lookup-table refactor; score 2.00).
  // ControlApp resolved by openspec 0228 (lookup-table refactor; score 12.00).
  // TournamentSetupWizard resolved by openspec 0228 (extracted NameStep,
  // DisciplineStep, FormatStep, WindowStep, RulesStep; score 10.00).
  // MatchConsoleTemplate resolved by openspec 0228 (extracted AlertsSection,
  // SyncStatusSection, BreadcrumbSection, StatusSection; score 20.06).
  // parseControlPath resolved by openspec 0229 (declarative ORG_SCOPED_ROUTES
  // / TOURNAMENT_SCOPED_ROUTES tables; score 10.08).
  // canActivate resolved by openspec 0229 (tests only, no refactor needed:
  // complexity 27 was already under threshold; score 27.04).
  // validateModulePackage resolved by openspec 0229 (extracted
  // validateDisciplineOrProfileSemantics; score 15.00).
  ['@copalibre/tournament-engine/src/standings/index.ts#computeAccounting', 66.84],
  ['@copalibre/tournament-engine/src/fixtures/custom-bracket.ts#validateCustomBracket', 38.34],
  ['@copalibre/tournament-engine/src/fixtures/swiss.ts#generateNextSwissRoundFixtures', 36.97],
  ['@copalibre/tournament-engine/src/statistics/fold.ts#foldStatistics', 36.03],
  ['@copalibre/tournament-engine/src/advancement/index.ts#resolveSlot', 32.21],
  ['@copalibre/tournament-engine/src/fixtures/double-elimination.ts#buildDoubleElimination', 30.92],
]);

const BRANCH_KINDS = new Set([
  ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.ConditionalExpression,
  ts.SyntaxKind.CaseClause,
  ts.SyntaxKind.CatchClause,
  ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement,
]);

const LOGICAL_OPERATORS = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
]);

const FUNCTION_KINDS = new Set([
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.FunctionExpression,
  ts.SyntaxKind.ArrowFunction,
  ts.SyntaxKind.MethodDeclaration,
  ts.SyntaxKind.GetAccessor,
  ts.SyntaxKind.SetAccessor,
  ts.SyntaxKind.Constructor,
]);

function isBranchNode(node) {
  if (BRANCH_KINDS.has(node.kind)) return true;
  return ts.isBinaryExpression(node) && LOGICAL_OPERATORS.has(node.operatorToken.kind);
}

/**
 * McCabe cyclomatic complexity: 1 + branching nodes owned by this function.
 * Descending stops at a nested function-like node — its branches belong to
 * its own entry, not its parent's, matching how each is scored separately.
 */
export function complexityOf(fnNode) {
  let complexity = 1;
  function visit(node) {
    if (node !== fnNode && FUNCTION_KINDS.has(node.kind)) return;
    if (node !== fnNode && isBranchNode(node)) complexity++;
    ts.forEachChild(node, visit);
  }
  ts.forEachChild(fnNode, visit);
  return complexity;
}

/** The name a function-like node was declared with, or undefined if anonymous. */
function declaredName(node) {
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessor(node) ||
    ts.isSetAccessor(node)
  ) {
    return node.name && ts.isIdentifier(node.name) ? node.name.text : undefined;
  }
  if (ts.isConstructorDeclaration(node)) return 'constructor';
  if ((ts.isFunctionExpression(node) || ts.isArrowFunction(node)) && node.name)
    return node.name.text;
  const parent = node.parent;
  if (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name))
    return parent.name.text;
  if (parent && ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name))
    return parent.name.text;
  if (parent && ts.isPropertyDeclaration(parent) && ts.isIdentifier(parent.name))
    return parent.name.text;
  return undefined;
}

/**
 * Nearest ancestor with a stable name, for anonymous functions. Walking up
 * `.parent` (not the function-only chain) means a name attaches even when the
 * anonymous function's direct container is itself unnamed.
 */
function nearestNamedAncestor(node) {
  let current = node.parent;
  while (current) {
    const name =
      declaredName(current) ??
      ((ts.isClassDeclaration(current) || ts.isClassExpression(current)) && current.name
        ? current.name.text
        : undefined);
    if (name) return name;
    current = current.parent;
  }
  return '(module)';
}

function lineOf(sourceFile, pos) {
  return sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
}

/**
 * Every function-like node in document order, with a stable identity. An
 * anonymous function's identity is `<nearest named ancestor>.<n>`, where `n`
 * counts prior anonymous siblings under the same ancestor — stable across a
 * pure reformat that shifts line numbers, since document order doesn't move.
 */
export function collectFunctions(sourceFile) {
  const functions = [];
  const anonymousIndexByAncestor = new Map();

  function visit(node) {
    if (FUNCTION_KINDS.has(node.kind)) {
      const name = declaredName(node);
      let identity = name;
      if (!identity) {
        const ancestor = nearestNamedAncestor(node);
        const index = anonymousIndexByAncestor.get(ancestor) ?? 0;
        anonymousIndexByAncestor.set(ancestor, index + 1);
        identity = `${ancestor}.${index}`;
      }
      functions.push({
        identity,
        startLine: lineOf(sourceFile, node.getStart(sourceFile)),
        endLine: lineOf(sourceFile, node.getEnd()),
        complexity: complexityOf(node),
      });
    }
    ts.forEachChild(node, visit);
  }
  ts.forEachChild(sourceFile, visit);
  return functions;
}

/**
 * Coverage ratio for the statements and branch locations whose reported line
 * falls within [startLine, endLine]. A function with no instrumented unit in
 * its span (a pure type signature, a trivial re-export) counts as covered —
 * there is nothing there to be undertested.
 */
export function coverageOf(entry, startLine, endLine) {
  let total = 0;
  let covered = 0;

  for (const [id, loc] of Object.entries(entry.statementMap)) {
    if (loc.start.line < startLine || loc.start.line > endLine) continue;
    total++;
    if (entry.s[id] > 0) covered++;
  }
  for (const [id, branch] of Object.entries(entry.branchMap)) {
    if (branch.loc.start.line < startLine || branch.loc.start.line > endLine) continue;
    const hits = entry.b[id] ?? [];
    for (let i = 0; i < branch.locations.length; i++) {
      total++;
      if (hits[i] > 0) covered++;
    }
  }

  return total === 0 ? 1 : covered / total;
}

export function crapScore(complexity, coverage) {
  return complexity ** 2 * (1 - coverage) ** 3 + complexity;
}

const NON_SOURCE = /\.(test|stories)\./;

/**
 * @param {string} workspaceName - e.g. "@copalibre/worker"
 * @param {string} workspaceDir - absolute path to the workspace directory
 * @returns {{ offenders: object[], warning?: string }}
 */
export function checkWorkspace(workspaceName, workspaceDir) {
  const coveragePath = join(workspaceDir, 'coverage', 'coverage-final.json');
  if (!existsSync(coveragePath)) {
    return { offenders: [], warning: `${workspaceName}: no coverage-final.json yet, skipping` };
  }

  const coverage = JSON.parse(readFileSync(coveragePath, 'utf8'));
  const offenders = [];

  for (const [absolutePath, entry] of Object.entries(coverage)) {
    if (NON_SOURCE.test(absolutePath) || !existsSync(absolutePath)) continue;
    const relativePath = relative(workspaceDir, absolutePath);
    const source = readFileSync(absolutePath, 'utf8');
    const sourceFile = ts.createSourceFile(
      absolutePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );

    for (const fn of collectFunctions(sourceFile)) {
      const coverageRatio = coverageOf(entry, fn.startLine, fn.endLine);
      // Rounded to 2dp: the register is hand-transcribed at that precision, and
      // a raw-float difference below it is not a real regression.
      const score = Math.round(crapScore(fn.complexity, coverageRatio) * 100) / 100;
      const key = `${workspaceName}/${relativePath}#${fn.identity}`;
      const recorded = KNOWN_CRAP.get(key);

      if (recorded === undefined) {
        if (score > THRESHOLD) {
          offenders.push({
            key,
            score,
            complexity: fn.complexity,
            coverage: coverageRatio,
            reason: `new function above threshold ${THRESHOLD}`,
          });
        }
      } else if (score > recorded) {
        offenders.push({
          key,
          score,
          complexity: fn.complexity,
          coverage: coverageRatio,
          reason: `regressed from recorded ${recorded.toFixed(2)}`,
        });
      }
    }
  }

  return { offenders };
}

export function findWorkspaces(repoRoot) {
  const manifest = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
  const workspaces = [];
  for (const pattern of manifest.workspaces) {
    const baseDir = join(repoRoot, pattern.replace(/\/\*$/, ''));
    if (!existsSync(baseDir)) continue;
    for (const entry of readdirSync(baseDir)) {
      const workspaceDir = join(baseDir, entry);
      const packageJsonPath = join(workspaceDir, 'package.json');
      if (!existsSync(packageJsonPath)) continue;
      const { name } = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
      workspaces.push({ name, dir: workspaceDir });
    }
  }
  return workspaces;
}

export function runCheck(repoRoot) {
  const offenders = [];
  const warnings = [];
  for (const { name, dir } of findWorkspaces(repoRoot)) {
    const result = checkWorkspace(name, dir);
    offenders.push(...result.offenders);
    if (result.warning) warnings.push(result.warning);
  }
  return { offenders, warnings };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const repoRoot = fileURLToPath(new URL('../', import.meta.url));
  const { offenders, warnings } = runCheck(repoRoot);

  for (const warning of warnings) {
    process.stdout.write(`[33m[WARN][0m ${warning}\n`);
  }

  if (offenders.length === 0) {
    process.stdout.write('[32m[PASS][0m No change-risk (CRAP) offenders found.\n');
    process.exit(0);
  }

  process.stdout.write(`[31m[FAIL][0m ${offenders.length} change-risk (CRAP) offender(s):\n\n`);
  for (const offender of offenders.sort((a, b) => b.score - a.score)) {
    process.stdout.write(
      `  ${offender.key}\n` +
        `    CRAP ${offender.score.toFixed(2)} (complexity ${offender.complexity}, coverage ` +
        `${(offender.coverage * 100).toFixed(0)}%) — ${offender.reason}\n`,
    );
  }
  process.exit(1);
}
