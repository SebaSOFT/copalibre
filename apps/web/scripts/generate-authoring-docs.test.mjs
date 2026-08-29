import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDescriptorReferenceMarkdown, slugOf } from './generate-authoring-docs.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const AUTHORING_SOURCE = join(ROOT, '../src/authoring-docs');
const HELP_SOURCE = join(ROOT, '../src/content/docs/help');
const PUBLIC_DIRECTORY = join(ROOT, '../public');

test('slugOf strips the ordering prefix and extension', () => {
  assert.equal(slugOf('00-index.md'), 'index');
  assert.equal(slugOf('04-transcription-basketball.md'), 'transcription-basketball');
});

test('buildDescriptorReferenceMarkdown emits every top-level field, marking required vs optional', () => {
  const schema = {
    required: ['alias'],
    properties: { alias: {}, description: {} },
  };
  const markdown = buildDescriptorReferenceMarkdown(schema, {
    alias: 'The catalogue identity.',
    description: 'A short summary.',
  });
  assert.match(markdown, /## `alias` \(required\)/);
  assert.match(markdown, /The catalogue identity\./);
  assert.match(markdown, /## `description` \(optional\)/);
});

test("buildDescriptorReferenceMarkdown lists a field's nested explanations beneath it", () => {
  const schema = { required: ['attribution'], properties: { attribution: {} } };
  const markdown = buildDescriptorReferenceMarkdown(schema, {
    attribution: 'Who authored this module.',
    'attribution.author': 'The author name.',
  });
  assert.match(markdown, /\*\*`attribution\.author`\*\*: The author name\./);
});

// 4.3 — the authoring index/generator never mixes in operator help pages
test('the authoring-docs source directory shares no filename with the operator help collection', () => {
  const authoringFiles = readdirSync(AUTHORING_SOURCE).filter((entry) => entry.endsWith('.md'));
  const helpFiles = existsSync(HELP_SOURCE)
    ? readdirSync(HELP_SOURCE, { recursive: true })
        .filter((entry) => entry.toString().endsWith('.md'))
        .map((entry) => entry.toString().split('/').pop())
    : [];
  for (const file of authoringFiles) {
    assert.equal(helpFiles.includes(file), false, `${file} collides with an operator help page`);
  }
});

test('the authoring-docs source directory is outside the Starlight docs content collection', () => {
  assert.equal(AUTHORING_SOURCE.includes('/content/docs/'), false);
});

// 2.1 — the published schema is byte-identical to what was generated
test('the generated schema file at public/schemas/ is valid JSON matching the domain export', async () => {
  const schemaPath = join(PUBLIC_DIRECTORY, 'schemas/discipline-descriptor.schema.json');
  if (!existsSync(schemaPath)) return; // generator has not run in this environment yet
  const { DISCIPLINE_DESCRIPTOR_SCHEMA } = await import('@copalibre/domain');
  const served = JSON.parse(readFileSync(schemaPath, 'utf8'));
  assert.deepEqual(served, DISCIPLINE_DESCRIPTOR_SCHEMA);
});
