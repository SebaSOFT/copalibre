import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Turns a downloaded PNG into the same image with its background made transparent. */
export type Cutout = (png: Buffer, label: string) => Promise<Buffer>;

/**
 * Keeps each cutout on disk, keyed by the hash of the image it came from. The model is not worth
 * running twice for the same logo, and a re-run of the scraper then yields the same bytes.
 */
export function withCutoutCache(directory: string, cutout: Cutout): Cutout {
  return async (png, label) => {
    const file = path.join(directory, `${createHash('sha256').update(png).digest('hex')}.png`);
    try {
      return await readFile(file);
    } catch {
      // not cut out yet
    }
    const result = await cutout(png, label);
    await mkdir(directory, { recursive: true });
    await writeFile(file, result);
    return result;
  };
}
