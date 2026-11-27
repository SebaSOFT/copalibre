// Tier-contract rules: tier membership (R1), import direction (R2) and page template
// hierarchy (R14). Registers stay in `../../check-atomic-composition.mjs`.

import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// ---------------------------------------------------------------------------
// R1 — tier membership: every file under a `ui/` directory declares its tier
// by living directly inside one of the four library-tier subdirectories.
// ---------------------------------------------------------------------------

export const DECLARED_UI_TIERS = new Set(['atoms', 'molecules', 'organisms', 'layouts']);

export function checkTierMembership(nodes) {
  const violations = [];
  for (const node of nodes.values()) {
    if (!node.isComponent) continue; // not a component — outside the tier system
    const segments = node.path.split('/');
    const uiIndex = segments.indexOf('ui');
    if (uiIndex === -1) continue; // not a library file at all — not this rule's concern
    const tierSegment = segments[uiIndex + 1];
    if (segments.length > uiIndex + 1 && DECLARED_UI_TIERS.has(tierSegment)) continue;

    violations.push({
      path: node.path,
      line: 1,
      message:
        `${node.path} sits directly inside a ui/ directory without a declared tier ` +
        `(one of ${[...DECLARED_UI_TIERS].join(', ')}). Move it into a tier subdirectory or ` +
        'record it in KNOWN_UNDECLARED_TIER with a stated reason.',
    });
  }
  return violations;
}

// ---------------------------------------------------------------------------
// R2 — import direction: imports point downward only. No library tier may
// import a screen component, and no tier may import a higher-ranked tier.
// ---------------------------------------------------------------------------

/**
 * Ascending rank — a file may import its own rank or lower, never higher.
 * `screen` covers every file outside a `ui/` library directory: today's
 * `*Page.tsx` (screen template role) and `*Route.tsx` (page-controller role)
 * sit in the same flat directory pending the tier rename, so
 * they share one rank until that split exists on disk to check against.
 */
const TIER_RANK = { atoms: 0, molecules: 1, organisms: 2, layouts: 3, screen: 4 };

export function checkImportDirection(nodes, edges) {
  const violations = [];
  for (const edge of edges) {
    const fromNode = nodes.get(edge.from);
    const toNode = nodes.get(edge.to);
    if (!fromNode || !toNode) continue;
    // A plain data/utility module (a catalogue, a formatting helper, an API
    // client) is not a tier member; importing one is never a direction
    // violation regardless of which tier does the importing.
    if (!toNode.isComponent) continue;
    const fromRank = TIER_RANK[fromNode.tier] ?? TIER_RANK.screen;
    const toRank = TIER_RANK[toNode.tier] ?? TIER_RANK.screen;
    if (toRank <= fromRank) continue;

    violations.push({
      path: edge.from,
      line: edge.line ?? 1,
      message:
        `${edge.from} (tier: ${fromNode.tier}) imports ${edge.to} (tier: ${toNode.tier}), ` +
        'which ranks above it. Imports point downward only — a tier may import its own tier ' +
        'or lower, never a tier above it.',
    });
  }
  return violations;
}

/**
 * A page may return a template directly or place it first in a Fragment when
 * it owns overlays such as dialogs. Content before the template moves the
 * template's breadcrumb and title below auxiliary screen content.
 *
 * @param {Map<string, { path: string }>} nodes
 * @param {string} webSrcDir
 * @returns {readonly { path: string, line: number, message: string }[]}
 */
export function checkPageTemplateHierarchy(nodes, webSrcDir) {
  const violations = [];

  for (const node of nodes.values()) {
    if (!node.path.startsWith('control/components/pages/') || !node.path.endsWith('.tsx')) {
      continue;
    }

    const source = readFileSync(join(webSrcDir, node.path), 'utf8');
    const sourceFile = ts.createSourceFile(
      node.path,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );

    function visit(current) {
      if (ts.isReturnStatement(current) && current.expression !== undefined) {
        let expression = current.expression;
        while (ts.isParenthesizedExpression(expression)) expression = expression.expression;

        if (ts.isJsxFragment(expression)) {
          const children = expression.children;
          const templateIndex = children.findIndex((child) => {
            const tag = ts.isJsxElement(child)
              ? child.openingElement.tagName
              : ts.isJsxSelfClosingElement(child)
                ? child.tagName
                : undefined;
            const tagName = tag?.getText(sourceFile).split('.').at(-1);
            return tagName?.endsWith('Template') ?? false;
          });

          if (templateIndex > 0) {
            const leading = children
              .slice(0, templateIndex)
              .find((child) =>
                ts.isJsxText(child)
                  ? child.text.trim().length > 0
                  : ts.isJsxExpression(child)
                    ? child.expression !== undefined
                    : true,
              );

            if (leading !== undefined) {
              const line =
                sourceFile.getLineAndCharacterOfPosition(leading.getStart(sourceFile)).line + 1;
              violations.push({
                path: node.path,
                line,
                message: `${node.path}:${line}: page renders content before its template; put the template first so its breadcrumb and title remain the primary header.`,
              });
            }
          }
        }
      }

      ts.forEachChild(current, visit);
    }

    visit(sourceFile);
  }

  return violations;
}
