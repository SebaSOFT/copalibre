import { readFile, writeFile } from 'node:fs/promises';
import { refreshDesignTokens } from '../design-document.js';

const path = new URL('../../../../DESIGN.md', import.meta.url);
const before = await readFile(path, 'utf8');
const after = refreshDesignTokens(before);
if (before !== after) await writeFile(path, after);
process.stdout.write(
  before === after ? 'DESIGN.md tokens are current.\n' : 'Refreshed DESIGN.md token frontmatter.\n',
);
