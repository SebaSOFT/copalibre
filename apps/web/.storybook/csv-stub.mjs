/**
 * A browser stand-in for `csv-parse` and `csv-stringify`, used only by the
 * component workbench.
 *
 * Why it exists: `apps/web/src/lib/language-preference.ts` imports three i18n
 * constants from `@copalibre/domain`'s barrel, and that barrel also re-exports
 * the CSV importer and exporter, which depend on `csv-parse` and
 * `csv-stringify`. Both read `Buffer` at module scope, so importing either in a
 * browser throws before any component renders — which is what happened to all
 * 78 stories at once.
 *
 * The application does not hit this because a production build tree-shakes the
 * unused branch out; a dev server does not tree-shake. Narrowing that barrel
 * import is worth doing on its own merits — it puts a CSV parser in the
 * dependency graph of every browser bundle — but the domain package's public
 * surface is not this workbench's to change, so the workbench substitutes a
 * stub instead.
 *
 * It throws rather than returning empty: no story parses a CSV, and a story
 * that started to should fail loudly here rather than silently get no rows.
 */
function unavailable() {
  throw new Error(
    'csv-parse/csv-stringify are stubbed in the component workbench: CSV handling ' +
      'is server-side code and no story exercises it. See ' +
      'apps/web/.storybook/csv-stub.mjs.',
  );
}

export const parse = unavailable;
export const stringify = unavailable;
export default { parse: unavailable, stringify: unavailable };
