/**
 * Runtime peer guard.
 *
 * Some packages ship JavaScript that must run against runtime assets built for one exact version of a
 * peer. `@imgly/background-removal` serves WebAssembly built for one `onnxruntime-web` release and
 * declares that release as an exact peer. Yarn reports an unmet peer as a warning and installs anyway,
 * so a routine dependency bump can break the feature while every build step stays green.
 *
 * This guard reads `yarn.lock` and fails when the locked peer of a listed package does not satisfy the
 * range that package declares. The list is reviewed by hand: the repository has other unmet peers
 * (type packages, build tooling) that do not change runtime behaviour.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import semver from 'semver';
import { parse } from 'yaml';

/** Package → the peer whose locked version must satisfy the package's declared peer range. */
export const RUNTIME_PEERS = Object.freeze({
  '@imgly/background-removal': 'onnxruntime-web',
});

function packageNameOf(descriptor) {
  const at = descriptor.indexOf('@', descriptor.startsWith('@') ? 1 : 0);
  return at === -1 ? descriptor : descriptor.slice(0, at);
}

/** Every locked version of `name`, from the lockfile's entry keys. */
export function lockedEntries(lock, name) {
  const entries = [];
  for (const [key, entry] of Object.entries(lock)) {
    if (key === '__metadata' || typeof entry !== 'object' || entry === null) continue;
    const descriptors = key.split(',').map((part) => part.trim());
    if (descriptors.some((descriptor) => packageNameOf(descriptor) === name)) {
      entries.push(entry);
    }
  }
  return entries;
}

/**
 * Returns one message per broken pair; an empty list means every listed package's peer is satisfied.
 * A listed package that is not in the lockfile is not a failure: it may have been removed on purpose.
 */
export function checkRuntimePeers(lock, peers = RUNTIME_PEERS) {
  const failures = [];
  for (const [name, peer] of Object.entries(peers)) {
    for (const entry of lockedEntries(lock, name)) {
      const range = entry.peerDependencies?.[peer];
      if (range === undefined) {
        failures.push(
          `${name}@${entry.version} no longer declares ${peer} as a peer; review the list`,
        );
        continue;
      }
      const peerVersions = lockedEntries(lock, peer).map((peerEntry) => peerEntry.version);
      if (peerVersions.length === 0) {
        failures.push(`${name}@${entry.version} needs ${peer} ${range}, which is not locked`);
        continue;
      }
      for (const version of peerVersions) {
        if (!semver.satisfies(version, String(range))) {
          failures.push(
            `${name}@${entry.version} needs ${peer} ${range}, but ${peer}@${version} is locked`,
          );
        }
      }
    }
  }
  return failures;
}

export function readLock(path = new URL('../yarn.lock', import.meta.url)) {
  return parse(readFileSync(path, 'utf8'));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const failures = checkRuntimePeers(readLock());
  if (failures.length > 0) {
    for (const failure of failures) process.stderr.write(`Runtime peer mismatch: ${failure}\n`);
    process.exit(1);
  }
  process.stdout.write(
    `Runtime peers satisfied: ${Object.keys(RUNTIME_PEERS).length} reviewed package(s)\n`,
  );
}
