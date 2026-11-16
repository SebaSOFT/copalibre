import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withoutEvalProbe, withoutHostedFonts } from './copy-scalar-assets.mjs';

const RULE = `@font-face {
  font-family: "Inter";
  font-weight: 100 900;
  src: url(https://fonts.scalar.com/inter-latin.woff2) format("woff2");
  unicode-range: U+0000-00FF;
}`;

test('removes every font rule that names the hosted font origin, and nothing else', () => {
  const css = `.a { color: red }\n${RULE}\n.b { color: blue }\n${RULE.replace('Inter', 'JetBrains Mono')}`;
  assert.equal(withoutHostedFonts(css), '.a { color: red }\n\n.b { color: blue }\n');
});

test('keeps a font rule that points somewhere else', () => {
  const own = '@font-face { font-family: "Own"; src: url(/fonts/own.woff2); }';
  assert.equal(withoutHostedFonts(`${own}\n${RULE}`), `${own}\n`);
});

test('fails when the host is named outside a font rule, so an upgrade cannot reintroduce the call', () => {
  assert.throws(
    () => withoutHostedFonts('const url = "https://fonts.scalar.com/inter-latin.woff2";'),
    /still names fonts\.scalar\.com/,
  );
});

test('the pinned bundle holds no reference to the hosted fonts once stripped', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const path = new URL(
    '../../../node_modules/@scalar/api-reference/dist/browser/standalone.js',
    import.meta.url,
  );
  if (!existsSync(path)) return;
  assert.equal(withoutHostedFonts(readFileSync(path, 'utf8')).includes('fonts.scalar.com'), false);
});

test('the eval probe answers no without asking, once', () => {
  assert.equal(
    withoutEvalProbe('a;M=()=>{try{return Function(``),!0}catch{return!1}};b'),
    'a;M=()=>{return!1};b',
  );
});

test('an eval probe that is missing or repeated fails the copy', () => {
  assert.throws(() => withoutEvalProbe('nothing here'), /exactly once, found 0/);
  const probe = 'try{return Function(``),!0}catch{return!1}';
  assert.throws(() => withoutEvalProbe(probe + probe), /exactly once, found 2/);
});

test('the pinned bundle carries the probe exactly once', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const path = new URL(
    '../../../node_modules/@scalar/api-reference/dist/browser/standalone.js',
    import.meta.url,
  );
  if (!existsSync(path)) return;
  assert.equal(withoutEvalProbe(readFileSync(path, 'utf8')).includes('Function(``)'), false);
});
