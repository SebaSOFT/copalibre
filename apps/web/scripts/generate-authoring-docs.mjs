import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DESCRIPTOR_FIELD_EXPLANATIONS, DISCIPLINE_DESCRIPTOR_SCHEMA } from '@copalibre/domain';

// Generates the agent-facing authoring contract (openspec 0163) as a
// separate pipeline from Starlight's `docs` content collection and the
// `starlight-llms-txt` plugin that reads it — the source files under
// src/authoring-docs/ are never part of that collection, so llms.txt and
// llms-full.txt (generated from the collection) are provably untouched by
// this script, rather than merely asserted unchanged by convention.
//
// Produces, all under apps/web/public/ so they are served at a stable URL:
//   - schemas/discipline-descriptor.schema.json — byte-identical to the
//     schema the domain validator uses, because it is the same imported
//     object, serialized once.
//   - authoring/<slug>.md — each guide page individually fetchable.
//   - authoring/transcriptions/<name>.json — each worked transcription's
//     real, validating descriptor.
//   - llms-authoring.txt — every guide page concatenated into the single
//     file an agent is expected to retrieve first.

const ROOT = dirname(fileURLToPath(import.meta.url));
const SOURCE_DIRECTORY = join(ROOT, '../src/authoring-docs');
const PUBLIC_DIRECTORY = join(ROOT, '../public');
const TRANSCRIPTIONS_DIRECTORY = join(SOURCE_DIRECTORY, 'transcriptions');

/** Strips a `NN-` ordering prefix and the extension: `"01-descriptor-reference.md"` -> `"descriptor-reference"`. */
export function slugOf(filename) {
  return filename.replace(/^\d+-/, '').replace(/\.md$/, '');
}

/**
 * Builds the descriptor field reference from the schema and its
 * explanations directly — never hand-copied prose, so it cannot drift from
 * either (design.md, "The guide drifts from the schema").
 */
export function buildDescriptorReferenceMarkdown(schema, explanations) {
  const required = new Set(schema.required ?? []);
  const topLevelKeys = Object.keys(schema.properties ?? {});
  const lines = [
    '# Discipline descriptor field reference',
    '',
    'Generated from the schema and its field explanations — the same object ' +
      '`copalibre_descriptor_schema` returns and `copalibre_descriptor_validate` checks against. ' +
      'Every top-level field the schema declares has an entry below; a field with nested ' +
      'declarations (an array of objects, say) lists its own notable sub-fields beneath it.',
    '',
  ];
  for (const key of topLevelKeys) {
    const requirement = required.has(key) ? 'required' : 'optional';
    const text = explanations[key];
    lines.push(`## \`${key}\` (${requirement})`, '');
    if (text) lines.push(text, '');
    const nestedKeys = Object.keys(explanations).filter(
      (candidate) => candidate.startsWith(`${key}.`) || candidate.startsWith(`${key}[]`),
    );
    for (const nestedKey of nestedKeys) {
      lines.push(`- **\`${nestedKey}\`**: ${explanations[nestedKey]}`);
    }
    if (nestedKeys.length > 0) lines.push('');
  }
  return lines.join('\n');
}

/**
 * Every guide page's filename in order, including the generated descriptor
 * reference — which has no file on disk (its content is built, never hand-
 * authored) but still needs a place in the sort order and a slug.
 */
function listGuidePages() {
  return [
    ...readdirSync(SOURCE_DIRECTORY).filter((entry) => entry.endsWith('.md')),
    '01-descriptor-reference.md',
  ].sort();
}

function main() {
  mkdirSync(join(PUBLIC_DIRECTORY, 'schemas'), { recursive: true });
  mkdirSync(join(PUBLIC_DIRECTORY, 'authoring/transcriptions'), { recursive: true });

  writeFileSync(
    join(PUBLIC_DIRECTORY, 'schemas/discipline-descriptor.schema.json'),
    JSON.stringify(DISCIPLINE_DESCRIPTOR_SCHEMA, null, 2) + '\n',
  );

  const referenceMarkdown = buildDescriptorReferenceMarkdown(
    DISCIPLINE_DESCRIPTOR_SCHEMA,
    DESCRIPTOR_FIELD_EXPLANATIONS,
  );

  const pages = listGuidePages().map((filename) => {
    if (filename === '01-descriptor-reference.md') {
      return { filename, slug: slugOf(filename), content: referenceMarkdown };
    }
    return {
      filename,
      slug: slugOf(filename),
      content: readFileSync(join(SOURCE_DIRECTORY, filename), 'utf8'),
    };
  });

  for (const page of pages) {
    writeFileSync(join(PUBLIC_DIRECTORY, `authoring/${page.slug}.md`), page.content);
  }

  for (const entry of readdirSync(TRANSCRIPTIONS_DIRECTORY)) {
    writeFileSync(
      join(PUBLIC_DIRECTORY, `authoring/transcriptions/${entry}`),
      readFileSync(join(TRANSCRIPTIONS_DIRECTORY, entry)),
    );
  }

  const banner = [
    '# CopaLibre discipline-authoring contract',
    '',
    "> Machine-facing documentation for turning a sport's regulations into a CopaLibre discipline " +
      'module. Separate from llms.txt/llms-full.txt (operator documentation for the control panel ' +
      'and CLI) by design — see /authoring/index.md for how to use this file.',
    '',
  ].join('\n');

  const body = pages.map((page) => page.content.trimEnd()).join('\n\n---\n\n');
  writeFileSync(join(PUBLIC_DIRECTORY, 'llms-authoring.txt'), `${banner}\n${body}\n`);

  process.stdout.write(
    `Generated llms-authoring.txt from ${pages.length} page(s), the descriptor schema, and ` +
      `${readdirSync(TRANSCRIPTIONS_DIRECTORY).length} worked-transcription descriptor(s).\n`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
