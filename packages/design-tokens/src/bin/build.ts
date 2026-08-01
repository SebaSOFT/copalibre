import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateCss } from '../generate/css.js';
import { generateStyleGuide } from '../generate/style-guide.js';
import { generateTailwindModule } from '../generate/tailwind.js';

/** Writes the generated artefacts. Run by `build:css` and `build:tailwind`. */
const OUT = join(dirname(fileURLToPath(import.meta.url)), '../../generated');

async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true });
  await Promise.all([
    writeFile(join(OUT, 'copalibre.css'), generateCss(), 'utf8'),
    writeFile(join(OUT, 'tailwind-theme.js'), generateTailwindModule(), 'utf8'),
    writeFile(join(OUT, 'style-guide.html'), generateStyleGuide(), 'utf8'),
  ]);
  process.stdout.write(`Wrote tokens to ${OUT}\n`);
}

void main();
