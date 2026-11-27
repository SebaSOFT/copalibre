// Data and text rules: data access below the page tier (R5), react-intl placement (R6),
// literal text nodes (R10) and catalogue resolution. Registers stay in `../../check-atomic-composition.mjs`.

import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { isExempt } from '../../check-ui-text-catalogue-coverage.mjs';
import { DECLARED_UI_TIERS } from './tiers.mjs';

export function checkDataAccess(nodes) {
  const violations = [];
  for (const node of nodes.values()) {
    if (!DECLARED_UI_TIERS.has(node.tier)) continue;
    if (node.dataSignals > 0) {
      violations.push({
        path: node.path,
        line: 1,
        message: `${node.path} (tier: ${node.tier}) contains a fetch/RealtimeClient/EventSource call. Data access belongs to the page tier only.`,
      });
    }
    for (const imp of node.imports) {
      if (imp.resolved && /(?:^|\/)(?:public-api-client|api-client)\.ts$/.test(imp.resolved)) {
        violations.push({
          path: node.path,
          line: imp.line,
          message: `${node.path}:${imp.line}: imports an API client (${imp.resolved}). Data access belongs to the page tier only.`,
        });
      }
    }
  }
  return violations;
}

export function checkI18nPlacement(nodes) {
  const violations = [];
  for (const node of nodes.values()) {
    if (node.tier !== 'atoms' && node.tier !== 'molecules') continue;
    if (node.i18nSignals === 0) continue;
    violations.push({
      path: node.path,
      line: 1,
      message: `${node.path} (tier: ${node.tier}) formats its own message via react-intl. i18n sits at organism and above; an atom or molecule takes rendered strings as props.`,
    });
  }
  return violations;
}

export function checkLiteralTextNodes(nodes) {
  const violations = [];
  for (const node of nodes.values()) {
    for (const textNode of node.textNodes) {
      if (isExempt(textNode.text)) continue;
      violations.push({
        path: node.path,
        line: textNode.line,
        message: `${node.path}:${textNode.line}: rendered text "${textNode.text.trim().slice(0, 60)}" is a literal, not a catalogue descriptor.`,
      });
    }
  }
  return violations;
}

const MESSAGE_ID_IN_DEFINE = /id:\s*'([^']+)'/g;

// A locale value is double-quoted instead of single-quoted precisely when
// it contains an apostrophe (e.g. French/Italian "l'organisation") — both
// are valid, equally common in these catalogues, and the key itself is
// always single-quoted either way.
const MESSAGE_ID_IN_RECORD = /^\s*'([a-zA-Z][\w.]*)':\s*['"]/gm;

/** Extracts every message id a catalogue file defines, in either its `defineMessages` or plain-Record shape. */
export function extractCatalogueIds(path) {
  const source = readFileSync(path, 'utf8');
  const ids = new Set();
  for (const match of source.matchAll(MESSAGE_ID_IN_DEFINE)) ids.add(match[1]);
  for (const match of source.matchAll(MESSAGE_ID_IN_RECORD)) ids.add(match[1]);
  return ids;
}

/** A catalogue family: a source (English) file and its locale siblings, all in one directory. */
const CATALOGUE_FAMILIES = [
  { dir: 'control/i18n', prefix: 'messages.' },
  { dir: 'lib/i18n', prefix: 'public-messages.' },
];

const CATALOGUE_LOCALES = ['de', 'en', 'es', 'fr', 'it', 'pt', 'ru', 'zh'];

export function checkCatalogueResolution(webSrcDir) {
  const violations = [];
  for (const family of CATALOGUE_FAMILIES) {
    const sourcePath = join(webSrcDir, family.dir, `${family.prefix}en.ts`);
    const sourceIds = extractCatalogueIds(sourcePath);

    for (const locale of CATALOGUE_LOCALES) {
      if (locale === 'en') continue;
      const localeRelPath = `${family.dir}/${family.prefix}${locale}.ts`;
      const localePath = join(webSrcDir, localeRelPath);
      const localeIds = extractCatalogueIds(localePath);

      for (const id of sourceIds) {
        if (localeIds.has(id)) continue;
        violations.push({
          path: localeRelPath,
          line: 1,
          message: `${localeRelPath}: missing message id "${id}", present in ${family.prefix}en.ts. Every descriptor must resolve in all eight catalogues.`,
        });
      }
    }
  }
  return violations;
}
