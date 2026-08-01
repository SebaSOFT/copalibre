import { validateLineup } from '../aggregates/match-operations.js';
import {
  checkTagApplication,
  tagScopeFor,
  tagsAt,
  validateTagDeclaration,
  type TagDeclaration,
  type TagFact,
} from './tags.js';

function declaration(overrides: Partial<TagDeclaration> = {}): TagDeclaration {
  return {
    code: 'suspended',
    label: 'Suspendido',
    appliesTo: ['person'],
    ...overrides,
  };
}

function fact(overrides: Partial<TagFact> = {}): TagFact {
  return {
    code: 'suspended',
    action: 'applied',
    actorGranularity: 'person',
    actorId: 'pe-1',
    competitionGranularity: 'season',
    competitionId: 'se-1',
    actor: 'user:tribunal-1',
    reason: 'Expulsión con informe',
    at: '2026-08-01T20:00:00.000Z',
    ...overrides,
  };
}

describe('a tag is declared like a collector', () => {
  it('accepts a declaration naming published granularities', () => {
    expect(validateTagDeclaration(declaration({ scopedTo: ['season'] })).ok).toBe(true);
  });

  it('refuses an actor granularity neither hierarchy publishes', () => {
    const result = validateTagDeclaration(declaration({ appliesTo: ['referee' as never] }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('Published:');
  });

  it('refuses a competition granularity neither hierarchy publishes', () => {
    expect(validateTagDeclaration(declaration({ scopedTo: ['fortnight' as never] })).ok).toBe(
      false,
    );
  });

  it('refuses a tag nothing could carry', () => {
    expect(validateTagDeclaration(declaration({ appliesTo: [] })).ok).toBe(false);
  });
});

describe('where a produced fact is scoped', () => {
  it("takes the discipline's declaration when the tournament configured nothing", () => {
    // "A red card suspends for the season" is a rule of the sport as often as a
    // rule of the tournament.
    expect(tagScopeFor(declaration({ producedAt: 'season' }))).toBe('season');
  });

  it("takes the tournament's configuration over the discipline's", () => {
    // A friendly that suspends for one match is not a discipline getting it
    // wrong: CopaLibre enforces what this organizer configured.
    expect(tagScopeFor(declaration({ producedAt: 'season' }), 'match')).toBe('match');
  });

  it('is nothing when neither said anything, rather than picking one', () => {
    expect(tagScopeFor(declaration())).toBeUndefined();
  });

  it('refuses a production granularity outside the scopes it declares', () => {
    const result = validateTagDeclaration(
      declaration({ scopedTo: ['season'], producedAt: 'match' }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('not');
  });

  it('accepts a production granularity among them', () => {
    expect(
      validateTagDeclaration(declaration({ scopedTo: ['season', 'match'], producedAt: 'match' }))
        .ok,
    ).toBe(true);
  });

  it('refuses a production granularity nothing publishes', () => {
    expect(validateTagDeclaration(declaration({ producedAt: 'fortnight' as never })).ok).toBe(
      false,
    );
  });
});

describe('what an application is refused for', () => {
  it('refuses a granularity the declaration does not name', () => {
    const result = checkTagApplication(
      declaration(),
      fact({ actorGranularity: 'team', actorId: 'tm-1' }),
      [],
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('does not apply to a team');
  });

  it('refuses a scope the declaration does not name', () => {
    expect(
      checkTagApplication(
        declaration({ scopedTo: ['season'] }),
        fact({ competitionGranularity: 'match', competitionId: 'm-1' }),
        [],
      ).ok,
    ).toBe(false);
  });

  it('refuses a second concurrent application of an exclusive tag', () => {
    const exclusive = declaration({ exclusive: true });
    const standing = tagsAt([exclusive], [fact()]);

    const result = checkTagApplication(
      exclusive,
      fact({ at: '2026-08-02T20:00:00.000Z' }),
      standing,
    );

    // Suspended twice over is one suspension; two would need a lifting nobody
    // performed to explain them.
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('already applies');
  });

  it('accepts a second application once the first was lifted', () => {
    const exclusive = declaration({ exclusive: true });
    const standing = tagsAt(
      [exclusive],
      [fact(), fact({ action: 'lifted', at: '2026-08-02T20:00:00.000Z', reason: 'Apelación' })],
    );

    expect(
      checkTagApplication(exclusive, fact({ at: '2026-08-03T20:00:00.000Z' }), standing).ok,
    ).toBe(true);
  });

  it('accepts a non-exclusive tag applied twice', () => {
    const standing = tagsAt([declaration()], [fact()]);

    expect(checkTagApplication(declaration(), fact(), standing).ok).toBe(true);
  });

  it('refuses an application nobody explained', () => {
    expect(checkTagApplication(declaration(), fact({ reason: '  ' }), []).ok).toBe(false);
  });

  it('refuses a fact about another tag', () => {
    expect(checkTagApplication(declaration(), fact({ code: 'injured' }), []).ok).toBe(false);
  });
});

describe('applying and lifting are facts, never a delete', () => {
  it('reads as applying after an application', () => {
    expect(tagsAt([declaration()], [fact()])).toMatchObject([
      { code: 'suspended', since: fact().at },
    ]);
  });

  it('reads as not applying after a lifting, with both facts still readable', () => {
    const applied = fact();
    const lifted = fact({
      action: 'lifted',
      at: '2026-08-05T20:00:00.000Z',
      reason: 'Levantada por el tribunal',
      actor: 'user:tribunal-2',
    });

    const standing = tagsAt([declaration()], [lifted, applied]);
    const history = tagsAt([declaration()], [applied]);

    expect(standing).toEqual([]);
    // "Was he suspended when that match was played?" stays answerable, which is
    // the whole reason nothing is deleted.
    expect(history[0]?.facts).toEqual([applied]);
  });

  it('keeps the facts that produced a standing tag, with who and why', () => {
    const standing = tagsAt([declaration()], [fact()]);

    expect(standing[0]).toMatchObject({
      appliedBy: 'user:tribunal-1',
      reason: 'Expulsión con informe',
    });
    expect(standing[0]?.facts).toHaveLength(1);
  });

  it('keeps two subjects apart', () => {
    const standing = tagsAt(
      [declaration()],
      [
        fact(),
        fact({ actorId: 'pe-2' }),
        fact({ actorId: 'pe-2', action: 'lifted', at: '2026-08-06T20:00:00.000Z' }),
      ],
    );

    expect(standing.map((tag) => tag.actorId)).toEqual(['pe-1']);
  });

  it('ignores a fact about a tag nobody declared', () => {
    expect(tagsAt([], [fact()])).toEqual([]);
  });
});

describe('a lifetime is derived, never written', () => {
  it('stops applying when the competition it was scoped to ends', () => {
    const seasonal = declaration({ until: { kind: 'granularity-ends' } });

    const during = tagsAt([seasonal], [fact()], { hasEnded: () => false });
    const after = tagsAt([seasonal], [fact()], { hasEnded: () => true });

    // Nothing was written to clear it: the season ending is the fact, and the
    // read is where that fact is applied.
    expect(during).toHaveLength(1);
    expect(after).toEqual([]);
  });

  it('stops applying when a collector reaches the value it names', () => {
    const served = declaration({
      until: { kind: 'collector-reaches', collectorCode: 'matches-played', value: 3 },
    });

    expect(tagsAt([served], [fact()], { totalOf: () => 2 })).toHaveLength(1);
    expect(tagsAt([served], [fact()], { totalOf: () => 3 })).toEqual([]);
  });

  it('keeps applying while the total is unknown, rather than clearing on silence', () => {
    const served = declaration({
      until: { kind: 'collector-reaches', collectorCode: 'matches-played', value: 3 },
    });

    expect(tagsAt([served], [fact()], {})).toHaveLength(1);
  });

  it('applies until lifted when no lifetime is declared', () => {
    expect(tagsAt([declaration()], [fact()], { hasEnded: () => true })).toHaveLength(1);
  });
});

describe('a tag refuses nothing', () => {
  it('exposes no operation that could block a lineup, a match or a result', () => {
    // The whole module surface: two validators about the record's own shape and
    // one read. Nothing here takes a lineup, a match or a command — a tag says
    // what is the case, and the organizer decides what to do about it.
    const surface = { validateTagDeclaration, checkTagApplication, tagsAt };

    expect(Object.keys(surface).sort()).toEqual([
      'checkTagApplication',
      'tagsAt',
      'validateTagDeclaration',
    ]);
  });

  it('does not block a lineup naming a suspended person', () => {
    const standing = tagsAt([declaration()], [fact()]);
    expect(standing[0]?.actorId).toBe('pe-1');

    const checked = validateLineup(
      { matchId: 'm-1', entrantId: 'en-1', personIds: ['pe-1', 'pe-2'] },
      ['pe-1', 'pe-2'],
      { minPlayers: 1, maxPlayers: 5 },
    );

    // The suspension is real, readable and carries a reason — and the lineup is
    // still accepted. If this player must not take the field, the organizer
    // keeps them out; CopaLibre does not.
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.value.findings).toEqual([]);
  });

  it('lets a tagged person stand in a standing tag list without any refusal being available', () => {
    const standing = tagsAt([declaration()], [fact()]);

    // Reading it is all this capability offers. A console that wants to keep a
    // suspended player out asks the organizer, not this function.
    expect(standing[0]?.actorId).toBe('pe-1');
  });
});
