import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('.', import.meta.url));
const writers = new Set([
  'recordResult',
  'supersedeResult',
  'anullSurplusMatches',
  'reinstateAnulledMatches',
]);
const routed = new Map([
  ['command', ['assertSidesDecided', 'afterOutcomeChange']],
  ['bulkLoad', ['assertSidesDecided', 'afterOutcomeChange']],
  ['correct', ['afterOutcomeChange']],
  ['anullSurplusOf', []],
]);

function filesOf(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return filesOf(path);
    return entry.name.endsWith('.ts') && !entry.name.includes('.test.') ? [path] : [];
  });
}

describe('outcome writer routing', () => {
  it('routes every repository result writer through the transaction hook and guards', () => {
    const found: string[] = [];
    const violations: string[] = [];
    for (const path of filesOf(root)) {
      const source = ts.createSourceFile(
        path,
        readFileSync(path, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );
      const visit = (node: ts.Node) => {
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          writers.has(node.expression.name.text)
        ) {
          let owner: ts.Node | undefined = node.parent;
          while (owner && !ts.isMethodDeclaration(owner) && !ts.isFunctionDeclaration(owner))
            owner = owner.parent;
          const name = owner?.name?.getText(source) ?? '(anonymous)';
          const file = relative(root, path);
          found.push(`${file}:${name}:${node.expression.name.text}`);
          const required =
            file === 'controllers/match-control.controller.ts' ? routed.get(name) : undefined;
          if (
            required === undefined ||
            required.some((hook) => !owner?.getText(source).includes(`${hook}(`))
          )
            violations.push(`${file}:${name} is an unrouted outcome writer`);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(violations).toEqual([]);
    expect(found.sort()).toEqual([
      'controllers/match-control.controller.ts:anullSurplusOf:anullSurplusMatches',
      'controllers/match-control.controller.ts:bulkLoad:recordResult',
      'controllers/match-control.controller.ts:command:recordResult',
      'controllers/match-control.controller.ts:correct:reinstateAnulledMatches',
      'controllers/match-control.controller.ts:correct:supersedeResult',
    ]);
    // The one delegated writer is private and both callers resolve in their transaction.
    const controller = readFileSync(join(root, 'controllers/match-control.controller.ts'), 'utf8');
    expect(controller.match(/this\.anullSurplusOf\(/g)).toHaveLength(3);
  });
});
