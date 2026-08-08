import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import type { ObjectStorageAdapter } from './types.js';

export interface FilesystemStorageConfig {
  readonly profile: 'filesystem';
  readonly rootDirectory: string;
}

export class UnsafeObjectKeyError extends Error {
  constructor(readonly key: string) {
    super(`Object key "${key}" resolves outside the configured storage root`);
    this.name = 'UnsafeObjectKeyError';
  }
}

/** Rejects a key that would `..`-escape `rootDirectory` — keys are never fully trusted (module aliases, uploaded filenames). */
function resolveSafePath(rootDirectory: string, key: string): string {
  const root = resolve(rootDirectory);
  const target = resolve(root, key);
  const withinRoot = relative(root, target);
  if (withinRoot.startsWith('..') || resolve(root, withinRoot) !== target) {
    throw new UnsafeObjectKeyError(key);
  }
  return target;
}

/** Single-node self-hosted fallback (architecture doc's explicit allowance) — no separate storage service required. */
export function createFilesystemAdapter(config: FilesystemStorageConfig): ObjectStorageAdapter {
  return {
    profile: 'filesystem',

    async put(key, body) {
      const path = resolveSafePath(config.rootDirectory, key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, body);
      return { key };
    },

    async get(reference) {
      const path = resolveSafePath(config.rootDirectory, reference.key);
      const body = await readFile(path);
      return { body };
    },

    async delete(reference) {
      const path = resolveSafePath(config.rootDirectory, reference.key);
      await rm(path, { force: true });
    },
  };
}
