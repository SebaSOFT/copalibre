import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { imageSize } from 'image-size';
import type { ModuleAssetDescriptor, ModuleAssetKind } from './manifest.js';
import { ASSETS_DIRECTORY_NAME } from './package-format.js';

/**
 * Asset limits (0036-community-module-distribution, task 2.4). No owner
 * decision fixed these numbers; they are a reasonable first pass for
 * web-served background/logo imagery, kept in one place so they are easy to
 * revise without touching the validation logic itself. `copalibre module
 * verify` re-runs this check against installed modules, so a future
 * tightening is detectable rather than silently grandfathered in.
 */
export const MAX_ASSET_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_ASSET_DIMENSIONS: Readonly<
  Record<ModuleAssetKind, { width: number; height: number }>
> = {
  background: { width: 4096, height: 4096 },
  logo: { width: 1024, height: 1024 },
};
/** `svg` is intentionally excluded from PERMITTED_RASTER_FORMATS — it is vector, exempt from dimension limits. */
const PERMITTED_RASTER_FORMATS = new Set(['png', 'jpg', 'webp']);
const PERMITTED_VECTOR_FORMATS = new Set(['svg']);

export interface AssetValidationFailure {
  readonly path: string;
  readonly message: string;
}

/**
 * Validates every asset the manifest declares: present on disk, permitted
 * format, within the size and (for raster formats) dimension limits for its
 * declared kind.
 */
export async function validateModuleAssets(
  directory: string,
  descriptors: readonly ModuleAssetDescriptor[],
): Promise<readonly AssetValidationFailure[]> {
  const failures: AssetValidationFailure[] = [];
  for (const descriptor of descriptors) {
    const failure = await validateOneAsset(directory, descriptor);
    if (failure) failures.push(failure);
  }
  return failures;
}

async function validateOneAsset(
  directory: string,
  descriptor: ModuleAssetDescriptor,
): Promise<AssetValidationFailure | undefined> {
  const path = join(directory, ASSETS_DIRECTORY_NAME, descriptor.path);
  let bytes: Buffer;
  try {
    bytes = await readFile(path);
  } catch {
    return { path: descriptor.path, message: 'declared in the manifest but not present on disk' };
  }

  if (bytes.byteLength > MAX_ASSET_SIZE_BYTES) {
    return {
      path: descriptor.path,
      message: `is ${bytes.byteLength} bytes, exceeding the ${MAX_ASSET_SIZE_BYTES}-byte limit`,
    };
  }

  // Format sniffed from magic bytes *before* handing anything to image-size
  // (GHSA-w3rx-r6r6-pgpr, GHSA-5p2g-fcmc-qvqq — no fixed release exists as of
  // this writing): its ICNS/JXL/HEIF parsers hang in an infinite loop on
  // crafted input, and it auto-detects format from the bytes themselves, so a
  // community-submitted module asset with those magic bytes would reach the
  // vulnerable parser before this file's own format allowlist ever ran. A
  // format outside what this validator permits is now refused here — image-
  // size is never invoked on bytes it wasn't already going to accept.
  const sniffed = sniffFormat(bytes);
  if (sniffed === undefined) {
    return { path: descriptor.path, message: 'is not a recognisable image file' };
  }
  if (!isPermittedFormat(sniffed)) {
    return {
      path: descriptor.path,
      message: `has format "${sniffed}", which is not one of the permitted formats (png, jpg, webp, svg)`,
    };
  }

  let size: { width: number; height: number; type?: string };
  try {
    size = imageSize(bytes);
  } catch {
    return { path: descriptor.path, message: 'is not a recognisable image file' };
  }

  const format = size.type;
  /* istanbul ignore if -- the sniff above already rejects anything image-size wouldn't also call permitted; this guards a case its own contract rules out. */
  if (format === undefined || !isPermittedFormat(format)) {
    return {
      path: descriptor.path,
      message: `has format "${format ?? 'unknown'}", which is not one of the permitted formats (png, jpg, webp, svg)`,
    };
  }

  if (PERMITTED_VECTOR_FORMATS.has(format)) return undefined;

  const limit = MAX_ASSET_DIMENSIONS[descriptor.kind];
  if (size.width > limit.width || size.height > limit.height) {
    return {
      path: descriptor.path,
      message: `is ${size.width}x${size.height}, exceeding the ${limit.width}x${limit.height} limit for a "${descriptor.kind}" asset`,
    };
  }
  return undefined;
}

function isPermittedFormat(format: string): boolean {
  return PERMITTED_RASTER_FORMATS.has(format) || PERMITTED_VECTOR_FORMATS.has(format);
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const RIFF_SIGNATURE = Buffer.from('RIFF', 'ascii');
const WEBP_SIGNATURE = Buffer.from('WEBP', 'ascii');
const GIF87_SIGNATURE = Buffer.from('GIF87a', 'ascii');
const GIF89_SIGNATURE = Buffer.from('GIF89a', 'ascii');
const BMP_SIGNATURE = Buffer.from('BM', 'ascii');
/** Enough of an SVG document to see past a BOM, XML prolog, and doctype/comments. */
const SVG_SNIFF_WINDOW_BYTES = 512;
const SVG_ROOT_ELEMENT = /^\s*(<\?xml[^>]*\?>\s*)?(<!--.*?-->\s*)*(<!doctype[^>]*>\s*)?<svg[\s>]/is;

/**
 * Identifies a format from its own bytes, independent of and ahead of
 * `image-size` — the pre-filter `validateOneAsset` uses to decide whether
 * calling that library is safe at all (see the caller for why).
 *
 * Only formats this module either permits or has an existing test naming
 * explicitly (gif, bmp — "recognised, but not permitted") are identified by
 * name; anything else, including a crafted ICNS/JXL/HEIF payload, reads as
 * unrecognised rather than being named — the security property (never
 * reaching `image-size`) holds either way, so there is no need to maintain a
 * signature for every format the vulnerable parsers themselves would need
 * to recognise.
 */
function sniffFormat(bytes: Buffer): string | undefined {
  if (bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return 'png';
  if (bytes.subarray(0, JPEG_SIGNATURE.length).equals(JPEG_SIGNATURE)) return 'jpg';
  if (bytes.subarray(0, 4).equals(RIFF_SIGNATURE) && bytes.subarray(8, 12).equals(WEBP_SIGNATURE)) {
    return 'webp';
  }
  if (
    bytes.subarray(0, GIF87_SIGNATURE.length).equals(GIF87_SIGNATURE) ||
    bytes.subarray(0, GIF89_SIGNATURE.length).equals(GIF89_SIGNATURE)
  ) {
    return 'gif';
  }
  if (bytes.subarray(0, BMP_SIGNATURE.length).equals(BMP_SIGNATURE)) return 'bmp';
  if (SVG_ROOT_ELEMENT.test(bytes.subarray(0, SVG_SNIFF_WINDOW_BYTES).toString('utf8'))) {
    return 'svg';
  }
  return undefined;
}
