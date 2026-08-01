import {
  isDuplicateMembership,
  squadOfDiscipline,
  normaliseNaturalKey,
  sameNaturalKey,
  validatePerson,
  type Person,
  type Player,
} from './person.js';

function person(overrides: Partial<Person> = {}): Person {
  return {
    personId: 'pe-1',
    organizationId: 'org-1',
    displayName: 'Adolfo Iván Isoler',
    ...overrides,
  };
}

function player(overrides: Partial<Player> = {}): Player {
  return {
    playerId: 'pl-1',
    personId: 'pe-1',
    teamId: 'tm-1',
    role: 'player',
    ...overrides,
  };
}

describe('a natural key identifies the human, not the typing', () => {
  it.each([
    ['12.345.678', '12345678'],
    ['12 345 678', '12345678'],
    ['ab-1234', 'AB1234'],
    ['  12345678  ', '12345678'],
  ])('reads %p as %p', (typed, expected) => {
    expect(normaliseNaturalKey(typed)).toBe(expected);
  });

  it('recognises one document however it was entered', () => {
    expect(
      sameNaturalKey({ kind: 'dni', value: '12.345.678' }, { kind: 'dni', value: '12345678' }),
    ).toBe(true);
  });

  it('does not confuse two kinds of document carrying the same digits', () => {
    // A licence number and an identity number that coincide are two claims.
    expect(
      sameNaturalKey({ kind: 'dni', value: '12345678' }, { kind: 'licence', value: '12345678' }),
    ).toBe(false);
  });
});

describe('validatePerson', () => {
  it('accepts a person with no key, because one may not have a document yet', () => {
    expect(validatePerson(person()).ok).toBe(true);
  });

  it('accepts a person carrying a key', () => {
    expect(validatePerson(person({ naturalKey: { kind: 'dni', value: '12.345.678' } })).ok).toBe(
      true,
    );
  });

  it('refuses a person with no name', () => {
    expect(validatePerson(person({ displayName: '  ' })).ok).toBe(false);
  });

  it('refuses a key that states no kind of document', () => {
    expect(validatePerson(person({ naturalKey: { kind: '', value: '12345678' } })).ok).toBe(false);
  });

  it('refuses a key with no identifying characters', () => {
    const result = validatePerson(person({ naturalKey: { kind: 'dni', value: '- . -' } }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('PERSON_INVALID');
  });
});

describe('one person, several memberships', () => {
  it('holds a player in each team, which is the point of the split', () => {
    const football = player({ playerId: 'pl-1', teamId: 'tm-football' });
    const futsal = player({ playerId: 'pl-2', teamId: 'tm-futsal' });

    expect(isDuplicateMembership(football, futsal)).toBe(false);
  });

  it('refuses two memberships in one team, which is the only duplicate', () => {
    expect(isDuplicateMembership(player({ playerId: 'pl-1' }), player({ playerId: 'pl-2' }))).toBe(
      true,
    );
  });

  it('does not confuse two people in one team', () => {
    expect(isDuplicateMembership(player(), player({ playerId: 'pl-2', personId: 'pe-2' }))).toBe(
      false,
    );
  });

  it('lets one person hold different roles in different teams', () => {
    const playing = player({ teamId: 'tm-1', role: 'player' });
    const coaching = player({ playerId: 'pl-2', teamId: 'tm-2', role: 'coach' });

    expect(isDuplicateMembership(playing, coaching)).toBe(false);
  });
});

describe('a squad belongs to a discipline', () => {
  const teams = [
    { teamId: 'tm-football', disciplineId: 'd-football' },
    { teamId: 'tm-futsal', disciplineId: 'd-futsal' },
    { teamId: 'tm-legacy' },
  ];
  const players = [
    player({ playerId: 'pl-1', teamId: 'tm-football' }),
    player({ playerId: 'pl-2', teamId: 'tm-futsal' }),
    player({ playerId: 'pl-3', teamId: 'tm-legacy' }),
  ];

  it('selects the side that plays the discipline in question', () => {
    expect(squadOfDiscipline(players, teams, 'd-football').map((p) => p.playerId)).toEqual([
      'pl-1',
    ]);
    expect(squadOfDiscipline(players, teams, 'd-futsal').map((p) => p.playerId)).toEqual(['pl-2']);
  });

  it('leaves out a team that names no discipline, rather than guessing which it plays', () => {
    expect(squadOfDiscipline(players, teams, 'd-football')).not.toContainEqual(
      expect.objectContaining({ teamId: 'tm-legacy' }),
    );
  });

  it('is empty for a discipline this club fields nobody in', () => {
    expect(squadOfDiscipline(players, teams, 'd-handball')).toEqual([]);
  });
});
