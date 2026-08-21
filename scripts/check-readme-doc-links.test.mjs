import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractLinkTargets, findOrphanedDocs, isLinked } from './check-readme-doc-links.mjs';

test('extracts every markdown link target', () => {
  const readme =
    'See [self-hosting](docs/self-hosting.md) and [reverse proxy](docs/deployment/reverse-proxy/).';
  assert.deepEqual(extractLinkTargets(readme), [
    'docs/self-hosting.md',
    'docs/deployment/reverse-proxy/',
  ]);
});

test('a file linked by its exact path is reachable', () => {
  assert.equal(isLinked('docs/self-hosting.md', ['docs/self-hosting.md']), true);
});

test('a file inside a linked directory is reachable, with or without a trailing slash on the link', () => {
  assert.equal(
    isLinked('docs/deployment/reverse-proxy/caddy.md', ['docs/deployment/reverse-proxy/']),
    true,
  );
  assert.equal(
    isLinked('docs/deployment/reverse-proxy/caddy.md', ['docs/deployment/reverse-proxy']),
    true,
  );
});

test('a file not linked at all, and not inside any linked directory, is orphaned', () => {
  assert.equal(isLinked('docs/BROADCAST-TV.md', ['docs/self-hosting.md']), false);
});

test('a similarly-named but distinct path does not count as a match', () => {
  // docs/deployment/kamal.md must not be considered linked just because
  // docs/deployment/reverse-proxy/ is linked — same parent, different file.
  assert.equal(isLinked('docs/deployment/kamal.md', ['docs/deployment/reverse-proxy/']), false);
});

test('findOrphanedDocs reports only the files with no reachable link', () => {
  const readme = 'See [linked](docs/linked.md) and [dir](docs/covered/).';
  const docs = ['docs/linked.md', 'docs/covered/inner.md', 'docs/orphan.md'];
  assert.deepEqual(findOrphanedDocs(docs, readme), ['docs/orphan.md']);
});

test('an empty README orphans every doc file', () => {
  assert.deepEqual(findOrphanedDocs(['docs/a.md', 'docs/b.md'], 'Nothing here.'), [
    'docs/a.md',
    'docs/b.md',
  ]);
});
