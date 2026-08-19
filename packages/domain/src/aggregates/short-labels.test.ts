import {
  abbreviationOf,
  deriveEntrantAbbreviation,
  labelCollisions,
  type LabelledSide,
} from './short-labels.js';

const casaDeItalia = {
  clubId: 'cl-1',
  organizationId: 'org-1',
  name: 'Casa de Italia',
  abbreviation: 'C I',
};

const talleres = {
  clubId: 'cl-2',
  organizationId: 'org-1',
  name: 'Talleres de Mendoza',
  abbreviation: 'TLL',
};

describe('which label a side shows', () => {
  it("takes the club's when the team has none", () => {
    expect(abbreviationOf({ abbreviation: undefined }, casaDeItalia)).toBe('C I');
  });

  it("lets a team override its club's", () => {
    // One club, two sides in one tournament: the override is the only thing
    // telling a spectator which one is on the court.
    expect(abbreviationOf({ abbreviation: 'TLL A' }, talleres)).toBe('TLL A');
    expect(abbreviationOf({ abbreviation: 'TLL B' }, talleres)).toBe('TLL B');
  });

  it('reports none when neither carries one', () => {
    // A truncation produced here would look exactly like a chosen label, and
    // the first to notice would be the club seeing "Casa d…" on a broadcast.
    expect(
      abbreviationOf({ abbreviation: undefined }, { abbreviation: undefined }),
    ).toBeUndefined();
    expect(abbreviationOf(undefined)).toBeUndefined();
  });

  it('works for a team with no club at all', () => {
    expect(abbreviationOf({ abbreviation: 'IND' })).toBe('IND');
  });
});

describe('entrant abbreviation derivation', () => {
  it('prefers the team abbreviation, then the club abbreviation', () => {
    expect(deriveEntrantAbbreviation('Casa de Italia', 'CDI', 'C I')).toBe('CDI');
    expect(deriveEntrantAbbreviation('Casa de Italia', undefined, 'C I')).toBe('C I');
  });

  it('derives initials of significant words and preserves meaningful single-letter suffixes', () => {
    expect(deriveEntrantAbbreviation('San Francisco A')).toBe('SFA');
    expect(deriveEntrantAbbreviation('San Francisco B')).toBe('SFB');
  });

  it.each([
    ['Casa de Italia', 'CI'],
    ['Real do Porto', 'RP'],
    ['Les Bleus', 'B'],
    ['Città di Torino', 'CT'],
    ['Bayern von München', 'BM'],
  ])('filters covered-language stop words in %s', (displayName, expected) => {
    expect(deriveEntrantAbbreviation(displayName)).toBe(expected);
  });

  it('limits derived initials to ten characters', () => {
    expect(
      deriveEntrantAbbreviation(
        'Alpha Bravo Charlie Delta Echo Foxtrot Golf Hotel India Juliet Kilo',
      ),
    ).toBe('ABCDEFGHIJ');
  });

  it('leaves a name with no foldable characters unresolved', () => {
    expect(deriveEntrantAbbreviation('東京')).toBeUndefined();
  });
});

describe('two labels that look alike', () => {
  const sides: readonly LabelledSide[] = [
    { teamId: 'tm-1', name: 'Talleres A', abbreviation: 'TLL' },
    { teamId: 'tm-2', name: 'Talleres B', abbreviation: 'TLL' },
    { teamId: 'tm-3', name: 'Casa de Italia', abbreviation: 'C I' },
  ];

  it('reports the collision, naming every side that shares it', () => {
    expect(labelCollisions(sides)).toEqual([{ abbreviation: 'TLL', teamIds: ['tm-1', 'tm-2'] }]);
  });

  it('refuses nothing: the function returns findings and no verdict', () => {
    // A tournament that genuinely wants two identical labels — a friendly, a
    // placeholder, an import mid-cleanup — is not one to stop at the door.
    const findings = labelCollisions(sides);

    expect(Array.isArray(findings)).toBe(true);
    expect(sides).toHaveLength(3);
  });

  it('reports nothing when every label is distinct', () => {
    expect(labelCollisions(sides.slice(1))).toEqual([]);
  });

  it('does not treat two sides without labels as a collision', () => {
    expect(
      labelCollisions([
        { teamId: 'tm-1', name: 'Uno' },
        { teamId: 'tm-2', name: 'Dos' },
      ]),
    ).toEqual([]);
  });

  it('is case-exact, because the labels are: nothing is normalised to compare', () => {
    expect(
      labelCollisions([
        { teamId: 'tm-1', name: 'Uno', abbreviation: 'TLL' },
        { teamId: 'tm-2', name: 'Dos', abbreviation: 'TLL A' },
      ]),
    ).toEqual([]);
  });
});
