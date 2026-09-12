/**
 * The preview seam's guarantees, checked at the source rather than trusted.
 *
 * The seam renders production components through the production renderer, which
 * is exactly why it needs a gate: a route that renders whatever it is handed
 * would be a rendering hole in the surface built to show what actually renders.
 *
 * This lives beside `pages/` rather than inside it. Astro routes every file
 * under `src/pages/`, so a test placed there becomes a public endpoint that the
 * build then tries to render — which is exactly what happened the first time.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const route = readFileSync(join(here, 'preview/AstroPreview.astro'), 'utf8');
const config = readFileSync(join(here, '../astro.config.mjs'), 'utf8');

describe('the Astro preview route', () => {
  it('is unreachable outside development', () => {
    // Without this the seam becomes a public route on every deployment.
    expect(route).toContain('import.meta.env.DEV');
    expect(route).toMatch(/if \(!import\.meta\.env\.DEV[^)]*\)[\s\S]{0,80}status: 404/);
    expect(config).toMatch(/if \(command === 'dev'\)\s*\{\s*injectRoute/);
    expect(config).toContain("entrypoint: './src/preview/AstroPreview.astro'");
  });

  it('renders only allowlisted component identifiers', () => {
    expect(route).toContain('PREVIEWABLE');
    expect(route).toMatch(/PREVIEWABLE\.has\(component\)/);
  });

  it('accepts a locale only from the supported set', () => {
    // A locale taken straight from the query string reaches `lang` and the
    // catalogue lookup; the supported list is what keeps that bounded.
    expect(route).toContain('SUPPORTED_LANGUAGES');
    expect(route).toMatch(/\)\s*\?\s*\(requested as SupportedLanguage\)\s*:\s*'en'/);
  });

  it('never interpolates request input into markup', () => {
    // `set:html` is Astro's raw-markup escape hatch. The seam has no use for it,
    // and its absence is the difference between framing a component and
    // rendering whatever a caller supplies.
    expect(route).not.toContain('set:html');
  });

  it('keeps itself out of search results', () => {
    expect(route).toContain('noindex');
  });
});
