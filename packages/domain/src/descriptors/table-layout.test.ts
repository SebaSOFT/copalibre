import { fixtureDescriptor } from '../test-support/fixture-descriptor.js';
import { validateDisciplineDescriptorDocument } from './descriptor-schema.js';
import { findTableLayout, resolveEffectiveTableLayouts } from './table-layout-resolution.js';
import type { DisciplineDescriptor } from './discipline-descriptor.js';
import type { TableLayoutDefinition } from './table-layout.js';

function asDocument(overrides: Record<string, unknown> = {}): unknown {
  const document = JSON.parse(JSON.stringify(fixtureDescriptor())) as Record<string, unknown>;
  delete document.descriptorId;
  return JSON.parse(JSON.stringify({ ...document, ...overrides })) as unknown;
}

const VALID_LAYOUT = {
  code: 'group-standings-default',
  target: 'group-phase',
  label: { en: 'Group Standings' },
  entityGranularity: 'team',
  defaultSort: [{ columnCode: 'points', direction: 'desc' }],
  columns: [
    { code: 'name', header: { en: 'Team' }, source: { kind: 'entrant-name' }, format: 'text' },
    {
      code: 'points',
      header: { en: 'Points' },
      source: { kind: 'collector', code: 'points' },
      format: 'number',
    },
  ],
};

describe('tableLayouts schema validation', () => {
  it('accepts a well-formed table layout', () => {
    const result = validateDisciplineDescriptorDocument(
      asDocument({ tableLayouts: [VALID_LAYOUT] }),
    );
    expect(result.ok).toBe(true);
  });

  it('rejects a column missing its required header', () => {
    const result = validateDisciplineDescriptorDocument(
      asDocument({
        tableLayouts: [
          {
            ...VALID_LAYOUT,
            columns: [{ code: 'name', source: { kind: 'entrant-name' }, format: 'text' }],
          },
        ],
      }),
    );
    expect(result.ok).toBe(false);
  });

  it('rejects a column format outside the declared enum', () => {
    const result = validateDisciplineDescriptorDocument(
      asDocument({
        tableLayouts: [
          {
            ...VALID_LAYOUT,
            columns: [
              {
                code: 'name',
                header: { en: 'Team' },
                source: { kind: 'entrant-name' },
                format: 'currency',
              },
            ],
          },
        ],
      }),
    );
    expect(result.ok).toBe(false);
  });

  it('rejects a column source of an undeclared kind', () => {
    const result = validateDisciplineDescriptorDocument(
      asDocument({
        tableLayouts: [
          {
            ...VALID_LAYOUT,
            columns: [
              {
                code: 'name',
                header: { en: 'Team' },
                source: { kind: 'lookup', table: 'entrants' },
                format: 'text',
              },
            ],
          },
        ],
      }),
    );
    expect(result.ok).toBe(false);
  });

  it('rejects a layout missing entityGranularity', () => {
    const withoutGranularity: Record<string, unknown> = { ...VALID_LAYOUT };
    delete withoutGranularity.entityGranularity;
    const result = validateDisciplineDescriptorDocument(
      asDocument({ tableLayouts: [withoutGranularity] }),
    );
    expect(result.ok).toBe(false);
  });
});

describe('resolveEffectiveTableLayouts / findTableLayout', () => {
  const layout = VALID_LAYOUT as unknown as TableLayoutDefinition;
  const baseDescriptor = fixtureDescriptor();

  function descriptorWith(overrides: Partial<DisciplineDescriptor>): DisciplineDescriptor {
    return { ...baseDescriptor, tableLayouts: [layout], ...overrides };
  }

  it('returns the discipline’s own layouts when no override is present', () => {
    const descriptor = descriptorWith({});
    expect(resolveEffectiveTableLayouts(descriptor)).toEqual([layout]);
  });

  it('returns the discipline’s own layouts when a policy exists but no override is supplied', () => {
    const descriptor = descriptorWith({
      fieldPolicies: {
        ...baseDescriptor.fieldPolicies,
        tableLayouts: { permission: { kind: 'replaced' }, mutationClass: 'safe' },
      },
    });
    expect(resolveEffectiveTableLayouts(descriptor, {})).toEqual([layout]);
  });

  it('replaces the discipline’s layouts when the field policy permits it', () => {
    const override: readonly TableLayoutDefinition[] = [{ ...layout, code: 'custom-standings' }];
    const descriptor = descriptorWith({
      fieldPolicies: {
        ...baseDescriptor.fieldPolicies,
        tableLayouts: { permission: { kind: 'replaced' }, mutationClass: 'safe' },
      },
    });

    const resolved = resolveEffectiveTableLayouts(descriptor, { tableLayouts: override });

    expect(resolved).toEqual(override);
  });

  it('ignores an override the field policy does not permit', () => {
    const override: readonly TableLayoutDefinition[] = [{ ...layout, code: 'custom-standings' }];
    const descriptor = descriptorWith({}); // no 'tableLayouts' field policy declared

    const resolved = resolveEffectiveTableLayouts(descriptor, { tableLayouts: override });

    expect(resolved).toEqual([layout]);
  });

  it('finds a layout by code across the effective set', () => {
    const descriptor = descriptorWith({});
    expect(findTableLayout(descriptor, 'group-standings-default')).toEqual(layout);
    expect(findTableLayout(descriptor, 'nonexistent')).toBeUndefined();
  });
});
