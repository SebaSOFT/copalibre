import { PROFILE_FIELD_EXPLANATIONS } from './profile-field-explanations.js';
import { TOURNAMENT_PROFILE_SCHEMA } from './profile-schema.js';

interface SchemaNode {
  readonly properties?: Readonly<Record<string, SchemaNode>>;
  readonly type?: string;
  readonly items?: SchemaNode;
}

/**
 * Every path a schema declares: top-level, nested object children, and
 * array-item children (marked `[]`, matching
 * `PROFILE_FIELD_EXPLANATIONS`'s own dot-path convention).
 */
export function schemaPropertyPaths(schema: SchemaNode, prefix = ''): string[] {
  const paths: string[] = [];
  const properties = schema.properties ?? {};
  for (const [key, propertySchema] of Object.entries(properties)) {
    const path = prefix ? `${prefix}.${key}` : key;
    paths.push(path);
    if (propertySchema.properties) {
      paths.push(...schemaPropertyPaths(propertySchema, path));
    } else if (propertySchema.type === 'array' && propertySchema.items?.properties) {
      paths.push(...schemaPropertyPaths(propertySchema.items, `${path}[]`));
    }
  }
  return paths;
}

describe('PROFILE_FIELD_EXPLANATIONS', () => {
  it('covers every path TOURNAMENT_PROFILE_SCHEMA declares, and declares no path the schema does not have', () => {
    const schemaPaths = schemaPropertyPaths(TOURNAMENT_PROFILE_SCHEMA as unknown as SchemaNode);
    const explainedPaths = Object.keys(PROFILE_FIELD_EXPLANATIONS);
    expect([...explainedPaths].sort()).toEqual([...schemaPaths].sort());
  });

  it('every explanation is non-empty', () => {
    for (const explanation of Object.values(PROFILE_FIELD_EXPLANATIONS)) {
      expect(explanation.trim().length).toBeGreaterThan(0);
    }
  });
});
