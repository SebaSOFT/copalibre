import { DESCRIPTOR_FIELD_EXPLANATIONS, DISCIPLINE_DESCRIPTOR_SCHEMA } from '@copalibre/domain';

// Enforces platform/help-and-api-docs's authoring-guide coverage guarantee
// (openspec 0163): every top-level field the discipline descriptor schema
// declares has a non-empty entry in DESCRIPTOR_FIELD_EXPLANATIONS — the same
// map both copalibre_descriptor_schema (the MCP tool) and the published
// authoring guide's generated reference page read — and no entry in that
// map names a field the schema does not declare (a stale key left behind by
// a rename). Mirrors check-help-coverage.mjs's shape: pure, testable
// functions plus a thin main().

/** Top-level property names the schema declares. */
export function schemaFieldNames(schema) {
  return Object.keys(schema.properties ?? {});
}

/** Field names with no entry, or an empty-string entry, in `explanations`. */
export function fieldsMissingExplanations(fieldNames, explanations) {
  return fieldNames.filter((name) => !explanations[name]?.trim());
}

/**
 * Explanation keys whose base field (before the first `.` or `[]`) is not a
 * real top-level schema field — a stale or mistyped key.
 */
export function orphanedExplanationKeys(explanationKeys, fieldNames) {
  const known = new Set(fieldNames);
  return explanationKeys.filter((key) => {
    const base = key.split(/[.[]/)[0];
    return !known.has(base);
  });
}

function main() {
  const fieldNames = schemaFieldNames(DISCIPLINE_DESCRIPTOR_SCHEMA);
  const missing = fieldsMissingExplanations(fieldNames, DESCRIPTOR_FIELD_EXPLANATIONS);
  const orphaned = orphanedExplanationKeys(Object.keys(DESCRIPTOR_FIELD_EXPLANATIONS), fieldNames);

  let failed = false;

  if (missing.length > 0) {
    failed = true;
    process.stderr.write(
      `${missing.length} descriptor field(s) have no authoring-guide explanation — add an entry to ` +
        `packages/domain/src/descriptors/descriptor-field-explanations.ts:\n` +
        missing.map((name) => `  - ${name}\n`).join(''),
    );
  }

  if (orphaned.length > 0) {
    failed = true;
    process.stderr.write(
      `${orphaned.length} authoring-guide explanation(s) name a field the schema no longer declares ` +
        `(a stale key from a rename) — remove or fix in ` +
        `packages/domain/src/descriptors/descriptor-field-explanations.ts:\n` +
        orphaned.map((key) => `  - ${key}\n`).join(''),
    );
  }

  if (failed) {
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `Descriptor guide coverage OK: ${fieldNames.length} schema field(s), ` +
      `${Object.keys(DESCRIPTOR_FIELD_EXPLANATIONS).length} explanation(s), no gaps.\n`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
