import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const emblemAstro = readFileSync(join(here, 'EmblemImage.astro'), 'utf8');
const personAstro = readFileSync(join(here, 'PersonPhotoImage.astro'), 'utf8');

describe('EmblemImage display atom', () => {
  it('enforces a 1:1 square frame and proportional sizing from size prop', () => {
    expect(emblemAstro).toContain('style={`width: ${size}px`}');
    expect(emblemAstro).toMatch(/\.cl-emblem-frame\s*\{[^}]*aspect-ratio:\s*1\s*\/\s*1/);
  });

  it('centers and contains the emblem with a token-based safe inset', () => {
    expect(emblemAstro).toMatch(/\.cl-emblem-frame img\s*\{[^}]*object-fit:\s*contain/);
    expect(emblemAstro).toMatch(/\.cl-emblem-frame img\s*\{[^}]*padding:\s*var\(--cl-space-2\)/);
  });

  it('renders an accessible placeholder with title and fallback onerror handler', () => {
    expect(emblemAstro).toContain('<svg');
    expect(emblemAstro).toContain('class="cl-emblem-placeholder"');
    expect(emblemAstro).toContain('<title>{placeholderAlt}</title>');
    expect(emblemAstro).toContain('this.nextElementSibling.style.display');
  });
});

describe('EmblemImage bare mode', () => {
  it('drops the frame, chamfer and inset and keeps only the 1:1 image', () => {
    expect(emblemAstro).toContain("bare && 'cl-emblem-frame--bare'");
    expect(emblemAstro).toMatch(/\.cl-emblem-frame--bare\s*\{[^}]*border:\s*0/);
    expect(emblemAstro).toMatch(/\.cl-emblem-frame--bare\s*\{[^}]*background:\s*none/);
    expect(emblemAstro).toMatch(/\.cl-emblem-frame--bare\s*\{[^}]*border-radius:\s*0/);
    expect(emblemAstro).toMatch(/\.cl-emblem-frame--bare img\s*\{[^}]*padding:\s*0/);
  });
});

describe('PersonPhotoImage display atom', () => {
  it('keeps person-photo geometry separate without imposing emblem 1:1 aspect-ratio', () => {
    expect(personAstro).toContain('style={`width: ${size}px`}');
    expect(personAstro).not.toMatch(/\.cl-person-photo-frame\s*\{[^}]*aspect-ratio:\s*1\s*\/\s*1/);
  });

  it('contains the foreground subject without stretching or clipping using safe inset', () => {
    expect(personAstro).toMatch(/\.cl-person-photo-frame img\s*\{[^}]*object-fit:\s*contain/);
    expect(personAstro).toMatch(
      /\.cl-person-photo-frame img\s*\{[^}]*padding:\s*var\(--cl-space-2\)/,
    );
  });

  it('renders a distinct profile placeholder with title and fallback onerror handler', () => {
    expect(personAstro).toContain('class="cl-person-photo-placeholder"');
    expect(personAstro).toContain('viewBox="0 0 96 96"');
    expect(personAstro).toContain('<title>{placeholderAlt}</title>');
    expect(personAstro).toContain('this.nextElementSibling.style.display');
  });
});
