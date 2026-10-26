import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  changedStringsFromBody,
  collectChangedStrings,
  formatChanges,
  parseCatalogue,
} from './list-changed-strings.mjs';

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

test('parses English message descriptors and translated message entries by stable id', () => {
  const english = parseCatalogue(
    `export const messages = defineMessages({
      greeting: { id: 'control.greeting', defaultMessage: 'Hello' },
    });`,
    'messages.en.ts',
  );
  const spanish = parseCatalogue(
    `export const messages: Record<string, string> = {
      'control.greeting': 'Hola',
      'control.concatenated': 'Texto largo ' + 'en dos partes',
    };`,
    'messages.es.ts',
  );

  assert.deepEqual([...english], [['control.greeting', 'Hello']]);
  assert.deepEqual(
    [...spanish],
    [
      ['control.greeting', 'Hola'],
      ['control.concatenated', 'Texto largo en dos partes'],
    ],
  );
});

test('lists added, changed and removed keys across control and public catalogues', () => {
  const repository = mkdtempSync(join(tmpdir(), 'changed-strings-'));
  try {
    git(repository, 'init', '--quiet');
    git(repository, 'config', 'user.name', 'Changed Strings Test');
    git(repository, 'config', 'user.email', 'changed-strings@example.test');

    const controlPath = join(repository, 'apps/web/src/control/i18n/messages.es.ts');
    const publicPath = join(repository, 'apps/web/src/lib/i18n/public-messages.es.ts');
    mkdirSync(join(repository, 'apps/web/src/control/i18n'), { recursive: true });
    mkdirSync(join(repository, 'apps/web/src/lib/i18n'), { recursive: true });

    writeFileSync(
      controlPath,
      `export const messages: Record<string, string> = {
        'control.changed': 'Texto anterior',
        'control.removed': 'Texto quitado',
        'control.unchanged': 'Igual',
      };\n`,
    );
    writeFileSync(
      publicPath,
      `export const messages: Record<string, string> = {
        'publicWeb.changed': 'Texto público anterior',
        'publicWeb.removed': 'Texto público quitado',
        'publicWeb.unchanged': 'Igual',
      };\n`,
    );
    git(repository, 'add', '.');
    git(repository, 'commit', '--quiet', '-m', 'base catalogues');
    const baseRef = git(repository, 'rev-parse', 'HEAD');

    writeFileSync(
      controlPath,
      `export const messages: Record<string, string> = {
        'control.added': 'Texto agregado',
        'control.changed': 'Texto nuevo',
        'control.unchanged': 'Igual',
      };\n`,
    );
    writeFileSync(
      publicPath,
      `export const messages: Record<string, string> = {
        'publicWeb.added': 'Texto público agregado',
        'publicWeb.changed': 'Texto público nuevo',
        'publicWeb.unchanged': 'Igual',
      };\n`,
    );
    git(repository, 'add', '.');
    git(repository, 'commit', '--quiet', '-m', 'update catalogues');
    const headRef = git(repository, 'rev-parse', 'HEAD');

    const changes = collectChangedStrings({ cwd: repository, baseRef, headRef });
    const expected = [
      { key: 'control.added', language: 'es', old: null, new: 'Texto agregado' },
      { key: 'control.changed', language: 'es', old: 'Texto anterior', new: 'Texto nuevo' },
      { key: 'control.removed', language: 'es', old: 'Texto quitado', new: null },
      {
        key: 'publicWeb.added',
        language: 'es',
        old: null,
        new: 'Texto público agregado',
      },
      {
        key: 'publicWeb.changed',
        language: 'es',
        old: 'Texto público anterior',
        new: 'Texto público nuevo',
      },
      { key: 'publicWeb.removed', language: 'es', old: 'Texto público quitado', new: null },
    ];

    assert.deepEqual(changes, expected);
    assert.equal(formatChanges(changes), JSON.stringify(expected, null, 2));

    const body = `## Changed interface strings\n\n\`\`\`json\n${formatChanges(changes)}\n\`\`\`\n\n## UI screenshots\n`;
    assert.deepEqual(changedStringsFromBody(body), expected);
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
});
