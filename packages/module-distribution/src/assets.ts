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

  let size: { width: number; height: number; type?: string };
  try {
    size = imageSize(bytes);
  } catch {
    return { path: descriptor.path, message: 'is not a recognisable image file' };
  }

  const format = size.type;
  if (format === undefined || !isPermittedFormat(format)) {
    return {
      path: descriptor.path,
      /* istanbul ignore next -- image-size always sets `.type` once it successfully parses an image; this guards a case its own contract rules out. */
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
