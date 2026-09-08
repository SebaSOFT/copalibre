import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkTextCatalogueCoverage, scanWebSources } from './check-ui-text-catalogue-coverage.mjs';

test('a catalogue-sourced attribute is not a finding', () => {
  const code = `
    export function Screen() {
      return <nav aria-label={intl.formatMessage(messages.sections)}>x</nav>;
    }
  `;
  assert.equal(checkTextCatalogueCoverage('Screen.tsx', code).length, 0);
});

test('a hardcoded attribute is reported with its value and line', () => {
  const code = [
    'export function Screen() {',
    '  return <nav aria-label="Sections">x</nav>;',
    '}',
  ].join('\n');
  const findings = checkTextCatalogueCoverage('Screen.tsx', code);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 2);
  assert.match(findings[0].message, /aria-label="Sections"/);
});

test('every text-bearing attribute is covered, not only aria-label', () => {
  const code = [
    '<img alt="A team photo" />',
    '<input placeholder="Your full name" />',
    '<abbr title="Goals for">GF</abbr>',
  ].join('\n');
  assert.equal(checkTextCatalogueCoverage('Screen.tsx', code).length, 3);
});

test('strings nobody translates are exempt', () => {
  const code = [
    '<img alt="" />', // decorative
    '<span title=" · " />', // a separator
    '<span title="90:00" />', // a clock
    '<a title="https://example.com" />', // a URL
    '<div aria-label="live" />', // a status code
    '<input placeholder="^1.0.0" />', // a version range
    '<input placeholder="file:///…" />', // a URI example
    '<input placeholder="scoring.pointsPerWin" />', // a dot-path example
  ].join('\n');
  assert.equal(checkTextCatalogueCoverage('Screen.tsx', code).length, 0);
});

test('the product name is exempt, because a brand must not be translated', () => {
  const code = '<img alt="CopaLibre" />\n<div title="COPALIBRE CMD" />';
  assert.equal(checkTextCatalogueCoverage('Screen.tsx', code).length, 0);
});

test('a URI containing // is not mistaken for a comment, which would eat the closing quote', () => {
  // The bug this pins: blanking `file:///…`'s third slash as a line comment ran
  // the value past its own quote and swallowed the next four lines of JSX.
  const code = ['<input placeholder="file:///…" />', '<nav aria-label="Sections">x</nav>'].join(
    '\n',
  );
  const findings = checkTextCatalogueCoverage('Screen.tsx', code);
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /aria-label="Sections"/);
});

test('text named only in a comment is not a finding', () => {
  const code = [
    '// <nav aria-label="Sections" />',
    '{/* <img alt="A photo" /> */}',
    'const ok = 1;',
  ].join('\n');
  assert.equal(checkTextCatalogueCoverage('Screen.tsx', code).length, 0);
});

test('the debt register admits its recorded count and nothing beyond it', () => {
  const one = '<nav aria-label="Sections" />';
  // modal.tsx is recorded at 1.
  assert.equal(checkTextCatalogueCoverage('modal.tsx', one).length, 0);
  assert.equal(checkTextCatalogueCoverage('modal.tsx', `${one}\n${one}`).length, 1);
  // A file not listed gets no allowance.
  assert.equal(checkTextCatalogueCoverage('NotListed.tsx', one).length, 1);
});

test('the debt register ratchets: improving below the recorded count asks for it to be lowered', () => {
  const findings = checkTextCatalogueCoverage('modal.tsx', 'const nothing = 1;');
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /fewer than the 1 recorded/);
});

test('a story file is not scanned: its text is a demonstration, not interface copy', () => {
  const root = mkdtempSync(join(tmpdir(), 'catalogue-coverage-'));
  writeFileSync(join(root, 'Thing.stories.tsx'), '<iframe title="A demonstration frame" />');
  assert.deepEqual(scanWebSources(root), {});

  // The same string in a real component is still a finding.
  writeFileSync(join(root, 'Thing.tsx'), '<iframe title="A demonstration frame" />');
  assert.equal(Object.keys(scanWebSources(root)).length, 1);
});
