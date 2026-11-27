// Naming and ownership rules: orphaned components (R7), casing and duplicate names (R9) and
// single atom ownership (R13). Registers stay in `../../check-atomic-composition.mjs`.

import { GOVERNED_ELEMENTS } from '../../check-ui-ownership.mjs';

/**
 * Case- and separator-insensitive: a story title names a component the way
 * Storybook titles do ("Astro preview", a human phrase) while a file
 * basename names it the way the filesystem does ("AstroPreview" or, since the kebab-case rename,
 * "astro-preview") — never the same string, even
 * when they mean the same component. `checkOrphans` normalizes both sides
 * before comparing rather than requiring the two conventions to coincide.
 */
function normalizeComponentName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** The last `/`-segment of a storyId's title, before the ` — scenario` suffix. */
function referenceIndexComponentNames(referenceIndex) {
  const names = new Set();
  for (const entry of referenceIndex) {
    if (entry.consumers.length > 0) continue; // has a real consumer; not what exempts an orphan
    const title = entry.storyId.split(' — ')[0] ?? entry.storyId;
    const segment = title.split('/').pop();
    if (segment) names.add(normalizeComponentName(segment));
  }
  return names;
}

export function checkOrphans(nodes, edges, referenceIndex) {
  const consumedTargets = new Set(edges.filter((e) => e.rendered).map((e) => e.to));
  const exemptNames = referenceIndexComponentNames(referenceIndex);
  const violations = [];

  for (const node of nodes.values()) {
    if (!node.isComponent) continue;
    if (!node.path.split('/').includes('ui')) continue; // library-adjacent files only
    if (consumedTargets.has(node.path)) continue;

    const baseName = node.path
      .split('/')
      .pop()
      .replace(/\.(tsx|astro|ts)$/, '');
    if (exemptNames.has(normalizeComponentName(baseName))) continue;

    violations.push({
      path: node.path,
      line: 1,
      message: `${node.path} has no production consumer and no reference-index row explaining why. Adopt it, delete it, merge it, or record it in reference-index.ts with a reason.`,
    });
  }
  return violations;
}

const KEBAB_CASE = /^[a-z][a-z0-9-]*\.(tsx|ts)$/;

const PASCAL_CASE = /^[A-Z][A-Za-z0-9]*\.astro$/;

export function checkCasing(nodes) {
  const violations = [];
  for (const node of nodes.values()) {
    const segments = node.path.split('/');
    if (!segments.includes('ui')) continue;
    const fileName = segments[segments.length - 1];
    const isControl = node.path.startsWith('control/');

    if (isControl && !KEBAB_CASE.test(fileName)) {
      violations.push({
        path: node.path,
        line: 1,
        message: `${node.path}: control library files are kebab-case; ${fileName} is not.`,
      });
    } else if (!isControl && node.path.endsWith('.astro') && !PASCAL_CASE.test(fileName)) {
      violations.push({
        path: node.path,
        line: 1,
        message: `${node.path}: public library .astro files are PascalCase; ${fileName} is not.`,
      });
    }
  }
  return violations;
}

/** Route files under `pages/` legitimately repeat a name across route trees (Astro file routing). */
export function checkDuplicateNames(nodes) {
  const byBaseName = new Map();
  for (const node of nodes.values()) {
    if (!node.isComponent) continue;
    if (node.path.startsWith('pages/')) continue;
    const baseName = node.path
      .split('/')
      .pop()
      .replace(/\.(tsx|astro)$/, '');
    if (!byBaseName.has(baseName)) byBaseName.set(baseName, []);
    byBaseName.get(baseName).push(node.path);
  }

  const violations = [];
  for (const [baseName, paths] of byBaseName) {
    if (paths.length < 2) continue;
    for (const path of paths) {
      violations.push({
        path,
        line: 1,
        message: `${path}: base name "${baseName}" is shared with ${paths.filter((p) => p !== path).join(', ')}. No two components may share a base name.`,
      });
    }
  }
  return violations;
}

export function checkSingleAtomOwnership(nodes) {
  const bySurfaceElement = new Map();
  for (const node of nodes.values()) {
    if (node.tier !== 'atoms') continue;
    const governedTags = new Set(
      node.nativeElements.map((e) => e.tag).filter((tag) => GOVERNED_ELEMENTS.includes(tag)),
    );
    for (const tag of governedTags) {
      const key = `${node.surface}::${tag}`;
      if (!bySurfaceElement.has(key)) bySurfaceElement.set(key, []);
      bySurfaceElement.get(key).push(node.path);
    }
  }

  const violations = [];
  for (const [key, paths] of bySurfaceElement) {
    if (paths.length < 2) continue;
    const [, tag] = key.split('::');
    for (const path of paths) {
      violations.push({
        path,
        line: 1,
        message: `${path}: renders a raw <${tag}> from scratch, and so does ${paths.filter((p) => p !== path).join(', ')}, within the same surface. At most one atom may own a governed element.`,
      });
    }
  }
  return violations;
}
