import {
  authorizeMatchCommand,
  CAPABILITY_TEMPLATES,
  MATCH_CAPABILITIES,
  validateAssignment,
  type MatchAssignment,
  type MatchContext,
} from './match-authority.js';

const match: MatchContext = {
  organizationId: 'org-1',
  matchId: 'm-1',
  stageId: 'st-1',
};

function assignment(overrides: Partial<MatchAssignment> = {}): MatchAssignment {
  return {
    assignmentId: 'a-1',
    organizationId: 'org-1',
    subjectId: 'user:referee-1',
    scope: { kind: 'match', matchId: 'm-1' },
    capabilities: ['match.record-event'],
    ...overrides,
  };
}

function authorize(
  assignments: readonly MatchAssignment[],
  capability: (typeof MATCH_CAPABILITIES)[number],
  subjectId = 'user:referee-1',
  context: MatchContext = match,
) {
  return authorizeMatchCommand(assignments, { subjectId, capability, match: context });
}

describe('the four capabilities are separate', () => {
  it.each(MATCH_CAPABILITIES)('grants %s only when the assignment names it', (capability) => {
    const granted = authorize([assignment({ capabilities: [capability] })], capability);
    expect(granted.ok).toBe(true);

    const others = MATCH_CAPABILITIES.filter((candidate) => candidate !== capability);
    for (const other of others) {
      expect(authorize([assignment({ capabilities: [capability] })], other).ok).toBe(false);
    }
  });

  it('does not let recording events imply declaring the match over', () => {
    const scorekeeper = [assignment({ capabilities: CAPABILITY_TEMPLATES['table-official'] })];

    expect(authorize(scorekeeper, 'match.record-event').ok).toBe(true);
    expect(authorize(scorekeeper, 'match.control-clock').ok).toBe(true);
    expect(authorize(scorekeeper, 'match.finalize').ok).toBe(false);
  });

  it('names what was missing, so an operator knows which appointment to ask for', () => {
    const result = authorize([assignment()], 'match.finalize');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('MATCH_AUTHORITY_DENIED');
    expect(result.error.message).toContain('match.finalize');
    expect(result.error.details).toMatchObject({ matchId: 'm-1' });
  });

  it('reports which assignment granted it, for the audit record', () => {
    const result = authorize([assignment({ assignmentId: 'a-7' })], 'match.record-event');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.grantedBy).toBe('a-7');
  });
});

describe('a grant covers what it names, and nothing more', () => {
  it('refuses another match in the same stage', () => {
    const elsewhere: MatchContext = { ...match, matchId: 'm-2' };

    expect(authorize([assignment()], 'match.record-event', 'user:referee-1', elsewhere).ok).toBe(
      false,
    );
  });

  it('resolves a stage grant down to every match in it, so a matchday is one appointment', () => {
    const forTheDay = [assignment({ scope: { kind: 'stage', stageId: 'st-1' } })];

    for (const matchId of ['m-1', 'm-2', 'm-3']) {
      expect(
        authorize(forTheDay, 'match.record-event', 'user:referee-1', { ...match, matchId }).ok,
      ).toBe(true);
    }
  });

  it('never resolves upward: a match grant says nothing about its stage', () => {
    const otherStage: MatchContext = { matchId: 'm-9', stageId: 'st-2', organizationId: 'org-1' };

    expect(authorize([assignment()], 'match.record-event', 'user:referee-1', otherStage).ok).toBe(
      false,
    );
  });

  it('refuses a subject scoped to another organization', () => {
    const foreign = [assignment({ organizationId: 'org-2' })];

    expect(authorize(foreign, 'match.record-event').ok).toBe(false);
  });

  it('refuses someone else’s assignment', () => {
    expect(authorize([assignment()], 'match.record-event', 'user:impostor').ok).toBe(false);
  });

  it('denies when nobody was appointed at all', () => {
    expect(authorize([], 'match.record-event').ok).toBe(false);
  });
});

describe('validateAssignment', () => {
  it('accepts each role template', () => {
    for (const capabilities of Object.values(CAPABILITY_TEMPLATES)) {
      expect(validateAssignment(assignment({ capabilities })).ok).toBe(true);
    }
  });

  it('refuses an assignment granting nothing', () => {
    expect(validateAssignment(assignment({ capabilities: [] })).ok).toBe(false);
  });

  it('refuses a capability the core does not define', () => {
    const invented = assignment({
      capabilities: ['match.overwrite-result'] as never,
    });

    const result = validateAssignment(invented);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('match.overwrite-result');
  });

  it('keeps finalization out of the table-official template', () => {
    expect(CAPABILITY_TEMPLATES['table-official']).not.toContain('match.finalize');
  });
});
