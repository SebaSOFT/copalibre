import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const VERSION = '1.7.0';
const BASE_URL = `https://staticimgly.com/@imgly/background-removal-data/${VERSION}/dist`;
const PUBLIC_DIR = join(ROOT, '../public/background-removal', VERSION);
const ASSET_DIR = join(PUBLIC_DIR, 'assets');
const PINNED_MANIFEST = join(ROOT, `background-removal-resources-${VERSION}.json`);
const REQUIRED_RESOURCES = [
  '/models/isnet_quint8',
  '/onnxruntime-web/ort-wasm-simd-threaded.wasm',
  '/onnxruntime-web/ort-wasm-simd-threaded.mjs',
];

async function fetchChecked(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Asset request failed (${response.status}): ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

const pinnedResources = JSON.parse(await readFile(PINNED_MANIFEST, 'utf8'));
let upstreamResources;
try {
  upstreamResources = JSON.parse(await readFile(join(ASSET_DIR, 'resources.json'), 'utf8'));
} catch {
  const upstream = await fetchChecked(`${BASE_URL}/resources.json`);
  upstreamResources = JSON.parse(upstream.toString('utf8'));
}
const selected = Object.fromEntries(
  REQUIRED_RESOURCES.map((key) => {
    const resource = upstreamResources[key];
    if (!resource || !Array.isArray(resource.chunks)) {
      throw new Error(`Pinned IMG.LY resource is missing: ${key}`);
    }
    return [key, resource];
  }),
);
if (JSON.stringify(selected) !== JSON.stringify(pinnedResources)) {
  throw new Error(
    `Upstream IMG.LY ${VERSION} resource manifest differs from the reviewed, pinned manifest`,
  );
}

await mkdir(ASSET_DIR, { recursive: true });
const chunks = new Map();
for (const resource of Object.values(selected)) {
  for (const chunk of resource.chunks) chunks.set(chunk.name, chunk.hash);
}

for (const [name, expectedHash] of chunks) {
  const destination = join(ASSET_DIR, name);
  let bytes;
  try {
    bytes = await readFile(destination);
  } catch {
    bytes = await fetchChecked(`${BASE_URL}/${name}`);
  }
  const actualHash = createHash('sha256').update(bytes).digest('hex');
  if (actualHash !== expectedHash || name !== expectedHash) {
    throw new Error(`IMG.LY asset checksum mismatch for ${name}`);
  }
  if (bytes.byteLength) await writeFile(destination, bytes);
}

await writeFile(join(ASSET_DIR, 'resources.json'), JSON.stringify(pinnedResources));
process.stdout.write(
  `Prepared ${chunks.size} verified IMG.LY model/runtime assets (${VERSION}) in ${ASSET_DIR}\n`,
);
