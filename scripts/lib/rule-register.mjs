/**
 * The ratchet semantics `check-ui-ownership.mjs` established for
 * `KNOWN_RAW_ELEMENTS` and `KNOWN_HANDWRITTEN_CLASSES`, generalized for reuse
 * by every rule in `check-atomic-composition.mjs` (openspec 0225 design.md
 * Decision 4).
 *
 * A register is a `Map<path, count>`. Violations for a path up to the
 * recorded count are withheld; anything beyond it is reported; a path that
 * has *improved* below its recorded count is also reported, naming the
 * register, so debt can only be paid down explicitly, never silently. A path
 * absent from the register gets no allowance at all — every violation there
 * is reported outright.
 */

/**
 * @param {readonly { path: string, line: number, message: string }[]} violations
 * @param {Map<string, number>} register
 * @param {string} registerName
 * @param {string} noun
 * @returns {readonly { path: string, line: number, message: string }[]}
 */
export function ratchet(violations, register, registerName, noun) {
  const byPath = new Map();
  for (const v of violations) {
    if (!byPath.has(v.path)) byPath.set(v.path, []);
    byPath.get(v.path).push(v);
  }

  const reported = [];
  const seenPaths = new Set(byPath.keys());

  for (const [path, allowance] of register) {
    const here = (byPath.get(path) ?? []).sort((a, b) => a.line - b.line);
    seenPaths.delete(path);

    if (here.length > allowance) {
      reported.push(...here.slice(allowance));
    } else if (here.length < allowance) {
      reported.push({
        path,
        line: 1,
        message:
          `${path} now has ${here.length} ${noun}, fewer than the ${allowance} recorded in ` +
          `${registerName}. Lower the number there (or delete the entry at zero) so the debt ` +
          'cannot grow back.',
      });
    }
  }

  for (const path of seenPaths) {
    reported.push(...(byPath.get(path) ?? []));
  }

  return reported.sort((a, b) => (a.path === b.path ? a.line - b.line : a.path < b.path ? -1 : 1));
}

/** Fails a rule's own register when an entry names a path the filesystem does not have (R12). */
export function unreachableRegisterEntries(register, existsFn) {
  const unreachable = [];
  for (const path of register.keys()) {
    if (!existsFn(path)) unreachable.push(path);
  }
  return unreachable;
}
