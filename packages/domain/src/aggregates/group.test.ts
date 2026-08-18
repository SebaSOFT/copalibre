import { IMPLICIT_GROUP_NAME, isImplicitGroup, validateGroup, type Group } from './group.js';

function group(overrides: Partial<Group> = {}): Group {
  return {
    groupId: 'g-1',
    zoneId: 'z-1',
    number: 2,
    name: 'Grupo A',
    ...overrides,
  };
}

describe('a group is a pool within a zone', () => {
  it('accepts a group with a name and a position in the sequence', () => {
    expect(validateGroup(group()).ok).toBe(true);
  });

  it('refuses a group with no name', () => {
    const result = validateGroup(group({ name: '   ' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('GROUP_INVALID');
  });

  it.each([[0], [-1], [1.5]])('refuses a number of %p', (number) => {
    expect(validateGroup(group({ number })).ok).toBe(false);
  });
});

describe('the implicit group', () => {
  it('is what a zone with no declared pool carries', () => {
    expect(isImplicitGroup({ name: IMPLICIT_GROUP_NAME, number: 1 })).toBe(true);
  });

  it('is not claimed by a group somebody named', () => {
    expect(isImplicitGroup({ name: 'Grupo A', number: 1 })).toBe(false);
    expect(isImplicitGroup({ name: IMPLICIT_GROUP_NAME, number: 2 })).toBe(false);
  });
});
