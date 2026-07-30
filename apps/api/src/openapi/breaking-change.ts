import type { OpenAPIObject } from '@nestjs/swagger';

/**
 * Breaking-change detection against the last published artifact.
 *
 * Hand-written rather than delegated to a package: the maintained options are
 * either Go binaries (oasdiff) that don't fit a Yarn-only toolchain, or
 * unmaintained npm wrappers. The rule set we need is small and specific — the
 * cases that would break a generated client or an existing caller — so the
 * tradeoff favors ~80 reviewable lines over an abandoned dependency. Revisit if
 * a maintained npm-native tool appears.
 */

export interface BreakingChange {
  readonly kind:
    | 'route-removed'
    | 'response-schema-removed'
    | 'required-request-field-added'
    | 'request-field-type-changed'
    | 'security-added'
    | 'enum-value-removed';
  readonly location: string;
  readonly detail: string;
}

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

export function detectBreakingChanges(
  previous: OpenAPIObject,
  next: OpenAPIObject,
): readonly BreakingChange[] {
  const changes: BreakingChange[] = [];

  for (const [path, previousItem] of Object.entries(previous.paths ?? {})) {
    const nextItem = (next.paths ?? {})[path];

    for (const method of METHODS) {
      const previousOp = pick(previousItem, method);
      if (!previousOp) continue;

      const route = `${method.toUpperCase()} ${path}`;
      const nextOp = nextItem ? pick(nextItem, method) : undefined;

      if (!nextOp) {
        changes.push({
          kind: 'route-removed',
          location: route,
          detail: 'Route existed in the published artifact and is gone; existing callers break.',
        });
        continue;
      }

      // Requiring a token where none was required breaks anonymous callers.
      const previouslySecured = (previousOp.security ?? []).length > 0;
      const nowSecured = (nextOp.security ?? []).length > 0;
      if (!previouslySecured && nowSecured) {
        changes.push({
          kind: 'security-added',
          location: route,
          detail: 'Route now requires bearer authentication; previously anonymous callers break.',
        });
      }

      for (const status of Object.keys(previousOp.responses ?? {})) {
        if (!status.startsWith('2')) continue;
        const previousSchema = schemaOf(previousOp.responses?.[status]);
        const nextSchema = schemaOf(nextOp.responses?.[status]);
        if (previousSchema && !nextSchema) {
          changes.push({
            kind: 'response-schema-removed',
            location: `${route} ${status}`,
            detail: 'Success response lost its schema; generated client types break.',
          });
        }
      }

      changes.push(...compareRequestBodies(route, previousOp, nextOp, previous, next));
    }
  }

  return changes;
}

function compareRequestBodies(
  route: string,
  previousOp: Operation,
  nextOp: Operation,
  previousDoc: OpenAPIObject,
  nextDoc: OpenAPIObject,
): readonly BreakingChange[] {
  const changes: BreakingChange[] = [];
  const previousSchema = resolve(schemaOf(previousOp.requestBody), previousDoc);
  const nextSchema = resolve(schemaOf(nextOp.requestBody), nextDoc);
  if (!previousSchema || !nextSchema) return changes;

  const previousRequired = new Set(previousSchema.required ?? []);
  for (const field of nextSchema.required ?? []) {
    if (!previousRequired.has(field)) {
      changes.push({
        kind: 'required-request-field-added',
        location: `${route} body.${field}`,
        detail: 'Newly required request field; existing callers omitting it break.',
      });
    }
  }

  for (const [field, previousProperty] of Object.entries(previousSchema.properties ?? {})) {
    const nextProperty = (nextSchema.properties ?? {})[field];
    if (!nextProperty) continue;
    if (previousProperty.type && nextProperty.type && previousProperty.type !== nextProperty.type) {
      changes.push({
        kind: 'request-field-type-changed',
        location: `${route} body.${field}`,
        detail: `Type changed from ${previousProperty.type} to ${nextProperty.type}.`,
      });
    }
    const removedEnumValues = (previousProperty.enum ?? []).filter(
      (value) => !(nextProperty.enum ?? []).includes(value),
    );
    if (removedEnumValues.length > 0) {
      changes.push({
        kind: 'enum-value-removed',
        location: `${route} body.${field}`,
        detail: `Accepted values removed: ${removedEnumValues.join(', ')}.`,
      });
    }
  }

  return changes;
}

interface SchemaLike {
  readonly $ref?: string;
  readonly type?: string;
  readonly enum?: readonly unknown[];
  readonly required?: readonly string[];
  readonly properties?: Record<string, SchemaLike>;
}

interface Operation {
  readonly security?: readonly unknown[];
  readonly responses?: Record<string, unknown>;
  readonly requestBody?: unknown;
}

function pick(pathItem: unknown, method: (typeof METHODS)[number]): Operation | undefined {
  if (typeof pathItem !== 'object' || pathItem === null) return undefined;
  const operation = (pathItem as Record<string, unknown>)[method];
  return typeof operation === 'object' && operation !== null ? (operation as Operation) : undefined;
}

function schemaOf(holder: unknown): SchemaLike | undefined {
  if (typeof holder !== 'object' || holder === null) return undefined;
  const content = (holder as { content?: Record<string, { schema?: SchemaLike }> }).content;
  if (!content) return undefined;
  for (const media of Object.values(content)) {
    if (media?.schema) return media.schema;
  }
  return undefined;
}

/** Follows a single `#/components/schemas/X` reference. */
function resolve(schema: SchemaLike | undefined, document: OpenAPIObject): SchemaLike | undefined {
  if (!schema?.$ref) return schema;
  const name = schema.$ref.replace('#/components/schemas/', '');
  const target = (document.components?.schemas ?? {})[name];
  return target as SchemaLike | undefined;
}
