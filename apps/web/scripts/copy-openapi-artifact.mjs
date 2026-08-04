import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const source = join(ROOT, '../../../packages/contracts/openapi/v1.json');
const destination = join(ROOT, '../public/openapi/v1.json');

if (!existsSync(source)) {
  process.stderr.write(`OpenAPI artifact is missing: ${source}\n`);
  process.exit(1);
}

mkdirSync(dirname(destination), { recursive: true });
copyFileSync(source, destination);
process.stdout.write(`Copied reviewed OpenAPI artifact to ${destination}\n`);
