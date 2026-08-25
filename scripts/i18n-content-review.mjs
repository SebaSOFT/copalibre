#!/usr/bin/env node
// Builds a per-locale content-accuracy review report: loads a locale's message
// catalogue, the English source, and the domain-term glossary, validates a
// reviewer-supplied flag list against them, and writes a structured report.
// See docs/i18n-glossary.md's "Review workflow" section for the full process
// this supports — the flagging judgment itself is supplied via --flags, not
// produced by this script (no live LLM call happens here).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, basename } from 'node:path';

export function extractObjectLiteral(source, callSiteMarker) {
  const markerIndex = source.indexOf(callSiteMarker);
  if (markerIndex === -1) {
    throw new Error(`Could not find "${callSiteMarker}" in source`);
  }
  const braceStart = source.indexOf('{', markerIndex);
  if (braceStart === -1) {
    throw new Error(`Could not find an opening "{" after "${callSiteMarker}"`);
  }
  let depth = 0;
  let end = -1;
  for (let i = braceStart; i < source.length; i += 1) {
    const char = source[i];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) {
    throw new Error(`Unbalanced braces after "${callSiteMarker}"`);
  }
  return source.slice(braceStart, end + 1);
}

function evalObjectLiteral(literalText) {
  return new Function(`"use strict"; return (${literalText});`)();
}

export function loadDefineMessagesCatalogue(filePath) {
  const source = readFileSync(filePath, 'utf8');
  const literal = extractObjectLiteral(source, 'defineMessages(');
  const descriptors = evalObjectLiteral(literal);
  const byId = new Map();
  for (const descriptor of Object.values(descriptors)) {
    byId.set(descriptor.id, descriptor.defaultMessage);
  }
  return byId;
}

export function loadFlatCatalogue(filePath) {
  const source = readFileSync(filePath, 'utf8');
  const literal = extractObjectLiteral(source, '= {');
  const entries = evalObjectLiteral(literal);
  return new Map(Object.entries(entries));
}

export function loadGlossaryTerms(glossaryPath) {
  const source = readFileSync(glossaryPath, 'utf8');
  const terms = [];
  const headingRe = /^###\s+(.+)$/gm;
  let match;
  while ((match = headingRe.exec(source)) !== null) {
    const heading = match[1];
    const termRe = /`([^`]+)`/g;
    let termMatch;
    while ((termMatch = termRe.exec(heading)) !== null) {
      terms.push(termMatch[1]);
    }
  }
  return terms;
}

function findGlossaryHits(text, glossaryTerms) {
  const lower = text.toLowerCase();
  return glossaryTerms.filter((term) => lower.includes(term.toLowerCase()));
}

export function buildReport({ locale, sourceCatalogue, localeCatalogue, glossaryTerms, flags }) {
  const entries = flags.map((flag) => {
    if (!sourceCatalogue.has(flag.key)) {
      throw new Error(`Flagged key "${flag.key}" does not exist in the English source catalogue`);
    }
    if (!localeCatalogue.has(flag.key)) {
      throw new Error(`Flagged key "${flag.key}" does not exist in the ${locale} catalogue`);
    }
    const englishSource = sourceCatalogue.get(flag.key);
    const currentTranslation = localeCatalogue.get(flag.key);
    return {
      key: flag.key,
      englishSource,
      currentTranslation,
      concern: flag.concern,
      proposedReplacement: flag.proposedReplacement ?? null,
      glossaryHits: findGlossaryHits(`${englishSource} ${flag.concern}`, glossaryTerms),
      status: 'unconfirmed',
    };
  });
  return {
    locale,
    generatedAt: new Date().toISOString(),
    flaggedCount: entries.length,
    entries,
  };
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const value = argv[i + 1];
    args[key] = value;
    i += 1;
  }
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/i18n-content-review.mjs --locale <code> --catalogue <path> --source <path> --flags <path> [--glossary <path>] [--out <path>]

  --locale     Locale code being reviewed (e.g. es, fr, de)
  --catalogue  Path to the locale's flat message catalogue (messages.<locale>.ts)
  --source     Path to the English source catalogue (messages.en.ts, uses defineMessages)
  --flags      Path to a JSON file: [{ key, concern, proposedReplacement? }, ...]
  --glossary   Path to the glossary doc (default: docs/i18n-glossary.md)
  --out        Report output path (default: docs/i18n-reports/<catalogue-basename>.<locale>.json)
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help !== undefined || !args.locale || !args.catalogue || !args.source || !args.flags) {
    printHelp();
    process.exitCode = args.help !== undefined ? 0 : 1;
    return;
  }
  const glossaryPath = args.glossary ?? 'docs/i18n-glossary.md';
  const sourceCatalogue = loadDefineMessagesCatalogue(args.source);
  const localeCatalogue = loadFlatCatalogue(args.catalogue);
  const glossaryTerms = loadGlossaryTerms(glossaryPath);
  const flags = JSON.parse(readFileSync(args.flags, 'utf8'));

  const report = buildReport({
    locale: args.locale,
    sourceCatalogue,
    localeCatalogue,
    glossaryTerms,
    flags,
  });

  const outPath =
    args.out ?? `docs/i18n-reports/${basename(args.catalogue, '.ts')}.${args.locale}.json`;
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote ${report.flaggedCount} flagged entries to ${outPath}`);
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
