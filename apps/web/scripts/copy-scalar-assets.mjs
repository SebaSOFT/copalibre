import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const source = join(ROOT, '../../../node_modules/@scalar/api-reference/dist/browser/standalone.js');
const destination = join(ROOT, '../public/vendor/scalar/standalone.js');

if (!existsSync(source)) {
  process.stderr.write(`Scalar standalone bundle is missing: ${source}\n`);
  process.exit(1);
}

mkdirSync(dirname(destination), { recursive: true });
copyFileSync(source, destination);
process.stdout.write(`Copied vendored Scalar bundle to ${destination}\n`);
