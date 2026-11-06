import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkHtmlSinks, findHtmlSinks } from './check-html-sinks.mjs';

const file = (content, path = 'a.ts') => ({ path, content });

for (const [name, source] of [
  ['innerHTML assignment', 'body.innerHTML = `<p>${name}</p>`;'],
  ['innerHTML assignment', 'body.innerHTML += value;'],
  ['outerHTML assignment', 'node.outerHTML = value;'],
  ['insertAdjacentHTML', "node.insertAdjacentHTML('beforeend', value);"],
  ['document.write', 'document.write(value);'],
  ['document.write', 'document.writeln(value);'],
  ['dangerouslySetInnerHTML', '<div dangerouslySetInnerHTML={{ __html: value }} />'],
]) {
  test(`fails on ${source}`, () => {
    assert.deepEqual(checkHtmlSinks([file(source)], new Map()), [`a.ts:1: ${name}`]);
  });
}

test('names the line of a sink', () => {
  assert.deepEqual(findHtmlSinks('one\ntwo\nbody.innerHTML = x;').forbidden, [
    { line: 3, name: 'innerHTML assignment' },
  ]);
});

test('passes reads, comparisons and property descriptors', () => {
  const source = [
    'const html = body.innerHTML;',
    "if (body.innerHTML === '') run();",
    "Object.defineProperty(el, 'innerHTML', { configurable: true });",
    '// injected via `set:html` inside a script tag',
    'body.replaceChildren(content);',
  ].join('\n');
  assert.deepEqual(checkHtmlSinks([file(source)], new Map()), []);
});

test('fails on an unlisted set:html', () => {
  assert.deepEqual(checkHtmlSinks([file('<div set:html={value} />', 'b.astro')], new Map()), [
    'b.astro: 1 set:html uses, 0 reviewed',
  ]);
});

test('passes a listed set:html', () => {
  const known = new Map([['b.astro', 1]]);
  assert.deepEqual(checkHtmlSinks([file('<div set:html={value} />', 'b.astro')], known), []);
});

test('fails when a listed file gains a use', () => {
  const known = new Map([['b.astro', 1]]);
  const source = '<div set:html={one} />\n<div set:html={two} />';
  assert.deepEqual(checkHtmlSinks([file(source, 'b.astro')], known), [
    'b.astro: 2 set:html uses, 1 reviewed',
  ]);
});

test('fails until a removed use is lowered', () => {
  const known = new Map([['b.astro', 1]]);
  assert.deepEqual(checkHtmlSinks([file('<div />', 'b.astro')], known), [
    'b.astro: 0 set:html uses; lower the recorded 1',
  ]);
});
