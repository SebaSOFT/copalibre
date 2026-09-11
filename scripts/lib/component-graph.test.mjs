import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildGraph, resolveSpecifier, tierOf, surfaceOf } from './component-graph.mjs';

const webSrc = fileURLToPath(new URL('../../apps/web/src', import.meta.url));

test('the resolver leaves zero unresolved relative imports across apps/web/src', () => {
  const graph = buildGraph(webSrc);
  assert.deepEqual(
    graph.unresolved,
    [],
    `unresolved relative imports: ${graph.unresolved.map((u) => `${u.from} -> ${u.specifier}`).join(', ')}`,
  );
});

test('the graph resolves the current node/edge count (229/735 at task 1.1, growing as this change adds files)', () => {
  const graph = buildGraph(webSrc);
  assert.equal(graph.nodes.size, 238);
  assert.equal(graph.edges.length, 743);
});

test('a type-only import is not counted as a render', () => {
  const root = mkdtempSync(join(tmpdir(), 'component-graph-'));
  writeFileSync(join(root, 'Card.tsx'), 'export function Card() { return null; }');
  writeFileSync(
    join(root, 'Consumer.tsx'),
    [
      "import type { Card } from './Card.js';",
      'export function Consumer(props: { card: Card }) { return null; }',
    ].join('\n'),
  );

  const graph = buildGraph(root);
  const consumer = graph.nodes.get('Consumer.tsx');
  assert.equal(consumer.imports.length, 1);
  assert.equal(consumer.imports[0].names[0].typeOnly, true);
  assert.equal(consumer.imports[0].names[0].rendered, false);
  assert.deepEqual(consumer.rendered, []);

  const edge = graph.edges.find((e) => e.from === 'Consumer.tsx');
  assert.equal(edge.typeOnly, true);
  assert.equal(edge.rendered, false);
});

test('a value import that is rendered as JSX is counted as a render', () => {
  const root = mkdtempSync(join(tmpdir(), 'component-graph-'));
  writeFileSync(join(root, 'Card.tsx'), 'export function Card() { return null; }');
  writeFileSync(
    join(root, 'Consumer.tsx'),
    ["import { Card } from './Card.js';", 'export function Consumer() { return <Card />; }'].join(
      '\n',
    ),
  );

  const graph = buildGraph(root);
  const consumer = graph.nodes.get('Consumer.tsx');
  assert.deepEqual(consumer.rendered, ['Card']);
  const edge = graph.edges.find((e) => e.from === 'Consumer.tsx');
  assert.equal(edge.rendered, true);
  assert.equal(edge.typeOnly, false);
});

test('a mixed import marks only the type-flagged name type-only', () => {
  const root = mkdtempSync(join(tmpdir(), 'component-graph-'));
  writeFileSync(
    join(root, 'lib.ts'),
    'export type Props = {}; export function helper() { return 1; }',
  );
  writeFileSync(
    join(root, 'Consumer.ts'),
    "import { type Props, helper } from './lib.js';\nhelper();",
  );

  const graph = buildGraph(root);
  const [propsImport, helperImport] = graph.nodes.get('Consumer.ts').imports[0].names;
  assert.equal(propsImport.name, 'Props');
  assert.equal(propsImport.typeOnly, true);
  assert.equal(helperImport.name, 'helper');
  assert.equal(helperImport.typeOnly, false);
});

test('.astro imports resolve their real extension directly, without .js rewriting', () => {
  const root = mkdtempSync(join(tmpdir(), 'component-graph-'));
  writeFileSync(join(root, 'Atom.astro'), '<div></div>');
  writeFileSync(
    join(root, 'Organism.astro'),
    "---\nimport Atom from './Atom.astro';\n---\n<Atom />",
  );

  const graph = buildGraph(root);
  const node = graph.nodes.get('Organism.astro');
  assert.equal(node.imports[0].resolved, 'Atom.astro');
  assert.equal(node.rendered[0], 'Atom');
});

test('a bare package specifier is external and produces no unresolved entry or graph edge', () => {
  const root = mkdtempSync(join(tmpdir(), 'component-graph-'));
  writeFileSync(join(root, 'Consumer.tsx'), "import { useState } from 'react';\nuseState(0);");

  const graph = buildGraph(root);
  assert.deepEqual(graph.unresolved, []);
  assert.equal(graph.edges.length, 0);
});

test('a non-source asset import (css, svg, json) is not treated as unresolved', () => {
  const root = mkdtempSync(join(tmpdir(), 'component-graph-'));
  writeFileSync(join(root, 'styles.css'), '.a { color: red; }');
  writeFileSync(
    join(root, 'Consumer.tsx'),
    "import './styles.css';\nexport function Consumer() {}",
  );

  const graph = buildGraph(root);
  assert.deepEqual(graph.unresolved, []);
});

test('a genuinely missing relative source file is reported as unresolved', () => {
  const root = mkdtempSync(join(tmpdir(), 'component-graph-'));
  writeFileSync(join(root, 'Consumer.tsx'), "import { Missing } from './missing.js';\nMissing;");

  const graph = buildGraph(root);
  assert.equal(graph.unresolved.length, 1);
  assert.equal(graph.unresolved[0].specifier, './missing.js');
});

test('resolveSpecifier resolves a .js specifier against a sibling .tsx source', () => {
  const root = mkdtempSync(join(tmpdir(), 'component-graph-'));
  writeFileSync(join(root, 'button.tsx'), 'export function Button() { return null; }');
  const from = join(root, 'Consumer.tsx');
  const result = resolveSpecifier(from, './button.js');
  assert.equal(result.resolved, join(root, 'button.tsx'));
});

test('tierOf reads the nearest ui/<tier> ancestor; a non-library file is a screen', () => {
  assert.equal(tierOf('control/components/ui/atoms/button.tsx'), 'atoms');
  assert.equal(tierOf('components/ui/organisms/MatchCard.tsx'), 'organisms');
  assert.equal(tierOf('control/components/pages/MatchConsolePage.tsx'), 'screen');
});

test('surfaceOf classifies control, tv and public paths', () => {
  assert.equal(surfaceOf('control/components/ui/atoms/button.tsx'), 'control');
  assert.equal(surfaceOf('components/tv/TvDashboard.tsx'), 'tv');
  assert.equal(surfaceOf('components/ui/organisms/MatchCard.tsx'), 'public');
  assert.equal(surfaceOf('lib/i18n/public-messages.en.ts'), 'shared');
});

test('a nested-directory structure resolves import specifiers without an index file', () => {
  const root = mkdtempSync(join(tmpdir(), 'component-graph-'));
  mkdirSync(join(root, 'ui/atoms'), { recursive: true });
  writeFileSync(join(root, 'ui/atoms/button.tsx'), 'export function Button() { return null; }');
  writeFileSync(
    join(root, 'Consumer.tsx'),
    "import { Button } from './ui/atoms/button.js';\nexport function Consumer() { return <Button />; }",
  );

  const graph = buildGraph(root);
  const node = graph.nodes.get('Consumer.tsx');
  assert.equal(node.imports[0].resolved, 'ui/atoms/button.tsx');
  assert.deepEqual(node.rendered, ['Button']);
});
