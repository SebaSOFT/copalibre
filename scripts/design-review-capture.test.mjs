import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ALL_LANGUAGES,
  EXTENDED_WIDTH,
  expandExtendedPass,
  expandFirstPass,
  groupByContext,
  isWrongPage,
  loadManifest,
  resolvePath,
  selectOverflowing,
  viewportFor,
} from './design-review-capture.mjs';

const ids = {
  org: 'org',
  tournament: 'cup',
  match: 'match-id',
  person: 'person-id',
  club: 'club-id',
  discipline: 'discipline-alias',
};

test('the route manifest loads and every route names a known surface', () => {
  const manifest = loadManifest();
  assert.ok(manifest.routes.length > 0);
  for (const route of manifest.routes) assert.ok(manifest.surfaces[route.surface], route.id);
});

test('route ids are unique, because screenshot names derive from them', () => {
  const routes = loadManifest().routes.map((route) => route.id);
  assert.equal(new Set(routes).size, routes.length);
});

test('each surface expands to its own widths, and Control gets no phone width', () => {
  const captures = expandFirstPass(loadManifest(), ids);
  const widthsOf = (surface) =>
    [
      ...new Set(captures.filter((capture) => capture.surface === surface).map((c) => c.width)),
    ].sort((left, right) => left - right);
  assert.deepEqual(widthsOf('public'), [375, 768, 1024, 1440]);
  assert.deepEqual(widthsOf('auth'), [375, 768, 1024, 1440]);
  assert.deepEqual(widthsOf('help'), [375, 768, 1024, 1440]);
  assert.deepEqual(widthsOf('control'), [768, 1024, 1440]);
  assert.deepEqual(widthsOf('tv'), [1280, 1920]);
});

test('every path resolves with the demo identifiers', () => {
  const captures = expandFirstPass(loadManifest(), ids);
  for (const capture of captures) assert.doesNotMatch(capture.path, /[{}]/);
});

test('an unresolved placeholder is an error, not a broken URL', () => {
  assert.throws(() => resolvePath('/{org}/{missing}', { org: 'x' }), /no value for "\{missing\}"/);
});

test('the overflow filter selects only overflowing phone-width pages', () => {
  const manifest = loadManifest();
  const clean = { id: 'public-home', surface: 'public', pageOverflow: false, elements: [] };
  const pageOverflow = {
    id: 'public-matches',
    surface: 'public',
    pageOverflow: true,
    elements: [],
  };
  const elementOverflow = {
    id: 'auth-login',
    surface: 'auth',
    pageOverflow: false,
    elements: [{ element: 'div', scrollWidth: 400, clientWidth: 300 }],
  };
  const control = { id: 'control-roles', surface: 'control', pageOverflow: true, elements: [] };
  assert.deepEqual(selectOverflowing(manifest, [clean, pageOverflow, elementOverflow, control]), [
    'public-matches',
    'auth-login',
  ]);
});

test('a route that overflows at several widths is flagged once', () => {
  const entry = { id: 'public-matches', surface: 'public', pageOverflow: true, elements: [] };
  assert.deepEqual(selectOverflowing(loadManifest(), [entry, entry]), ['public-matches']);
});

test('the extended pass produces exactly 8 x 1 captures per flagged page at 188px', () => {
  const captures = expandExtendedPass(loadManifest(), ids, ['public-matches']);
  assert.equal(captures.length, ALL_LANGUAGES.length);
  assert.equal(captures.length, 8);
  assert.ok(captures.every((capture) => capture.width === EXTENDED_WIDTH));
  assert.deepEqual(captures.map((capture) => capture.language).sort(), [...ALL_LANGUAGES].sort());
});

test('Control signs in once per language, inside the sign-in rate limit', () => {
  const control = expandFirstPass(loadManifest(), ids).filter((c) => c.surface === 'control');
  const groups = groupByContext(control);
  assert.equal(groups.length, 2);
  assert.ok(groups.every((group) => new Set(group.map((c) => c.language)).size === 1));
});

test('an error page counts as a wrong capture unless the route expects it', () => {
  assert.equal(isWrongPage({ httpStatus: 404 }), true);
  assert.equal(isWrongPage({ httpStatus: 200 }), false);
  assert.equal(isWrongPage({ httpStatus: 404, expectNotFound: true }), false);
  assert.equal(isWrongPage({}), false);
});

test('TV uses broadcast heights and other surfaces a fixed review height', () => {
  assert.deepEqual(viewportFor('tv', 1920), { width: 1920, height: 1080 });
  assert.deepEqual(viewportFor('tv', 1280), { width: 1280, height: 720 });
  assert.deepEqual(viewportFor('control', 1024), { width: 1024, height: 900 });
});
