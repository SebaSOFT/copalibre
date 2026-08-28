import { resolveSeries, validateSeriesDeclaration, type SeriesDeclaration } from './series.js';

describe('validateSeriesDeclaration', () => {
  it('validates a valid best-of declaration', () => {
    const result = validateSeriesDeclaration({
      span: 5,
      resolutionClass: 'best-of',
      neutralGround: true,
      standingsAccounting: 'series',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.span).toBe(5);
      expect(result.value.resolutionClass).toBe('best-of');
      expect(result.value.neutralGround).toBe(true);
      expect(result.value.standingsAccounting).toBe('series');
    }
  });

  it('validates a valid aggregate declaration', () => {
    const result = validateSeriesDeclaration({
      span: 2,
      resolutionClass: 'aggregate',
      standingsAccounting: 'match',
    });
    expect(result.ok).toBe(true);
  });

  it('validates a valid scripted series declaration', () => {
    const result = validateSeriesDeclaration({
      span: 3,
      resolutionScript: { id: 'script-1', rules: [] },
    });
    expect(result.ok).toBe(true);
  });

  it('rejects both class and script provided together', () => {
    const result = validateSeriesDeclaration({
      span: 5,
      resolutionClass: 'best-of',
      resolutionScript: { id: 'script-1', rules: [] },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.details?.field).toBe('series.resolutionScript');
    }
  });

  it('rejects neither class nor script provided', () => {
    const result = validateSeriesDeclaration({
      span: 5,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.details?.field).toBe('series.resolutionClass');
    }
  });

  it('rejects an even span for best-of', () => {
    const result = validateSeriesDeclaration({
      span: 4,
      resolutionClass: 'best-of',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.details?.field).toBe('series.span');
      expect(result.error.message).toContain('odd span');
    }
  });

  it('rejects span < 2', () => {
    const result = validateSeriesDeclaration({
      span: 1,
      resolutionClass: 'best-of',
    });
    expect(result.ok).toBe(false);
  });

  it('rejects non-object declaration', () => {
    expect(validateSeriesDeclaration(null).ok).toBe(false);
    expect(validateSeriesDeclaration('series').ok).toBe(false);
  });

  it('rejects invalid resolution class', () => {
    const result = validateSeriesDeclaration({
      span: 3,
      resolutionClass: 'unsupported-class' as unknown as 'best-of',
    });
    expect(result.ok).toBe(false);
  });

  it('rejects non-boolean neutralGround', () => {
    const result = validateSeriesDeclaration({
      span: 3,
      resolutionClass: 'best-of',
      neutralGround: 'yes' as unknown as boolean,
    });
    expect(result.ok).toBe(false);
  });

  it('rejects invalid standingsAccounting', () => {
    const result = validateSeriesDeclaration({
      span: 3,
      resolutionClass: 'best-of',
      standingsAccounting: 'invalid' as unknown as 'series',
    });
    expect(result.ok).toBe(false);
  });
});

describe('resolveSeries', () => {
  const sideA = 'ent-a';
  const sideB = 'ent-b';

  describe('best-of resolution', () => {
    const declaration: SeriesDeclaration = {
      span: 5,
      resolutionClass: 'best-of',
    };

    it('reports undecided with trace stating needed wins when in progress', () => {
      const matches = [
        {
          number: 1,
          status: 'finalized' as const,
          result: {
            sides: [
              { entrantId: sideA, statistics: { score: 1 } },
              { entrantId: sideB, statistics: { score: 0 } },
            ],
            winnerEntrantId: sideA,
            recordedAt: '2026-08-27T12:00:00.000Z',
          },
        },
        {
          number: 2,
          status: 'finalized' as const,
          result: {
            sides: [
              { entrantId: sideA, statistics: { score: 0 } },
              { entrantId: sideB, statistics: { score: 1 } },
            ],
            winnerEntrantId: sideB,
            recordedAt: '2026-08-27T13:00:00.000Z',
          },
        },
      ];

      const resolution = resolveSeries({
        declaration,
        sides: [sideA, sideB],
        matches,
      });

      expect(resolution.status).toBe('undecided');
      expect(resolution.matchesPlayed).toBe(2);
      expect(resolution.anulledMatchNumbers).toHaveLength(0);
      expect(resolution.explanation).toContain('ent-a needs 2 win(s)');
      expect(resolution.explanation).toContain('ent-b needs 2 win(s)');
      expect(resolution.trace[0]?.outcome).toBe('undecided');
      expect(resolution.trace[0]?.values?.[sideA]).toEqual({ wins: 1, neededWins: 2 });
      expect(resolution.trace[0]?.values?.[sideB]).toEqual({ wins: 1, neededWins: 2 });
    });

    it('decides best-of-5 when one side reaches 3 wins, anulling remaining matches', () => {
      const matches = [
        {
          number: 1,
          status: 'finalized' as const,
          result: {
            sides: [
              { entrantId: sideA, statistics: { score: 1 } },
              { entrantId: sideB, statistics: { score: 0 } },
            ],
            winnerEntrantId: sideA,
            recordedAt: '2026-08-27T12:00:00.000Z',
          },
        },
        {
          number: 2,
          status: 'finalized' as const,
          result: {
            sides: [
              { entrantId: sideA, statistics: { score: 1 } },
              { entrantId: sideB, statistics: { score: 0 } },
            ],
            winnerEntrantId: sideA,
            recordedAt: '2026-08-27T13:00:00.000Z',
          },
        },
        {
          number: 3,
          status: 'finalized' as const,
          result: {
            sides: [
              { entrantId: sideA, statistics: { score: 1 } },
              { entrantId: sideB, statistics: { score: 0 } },
            ],
            winnerEntrantId: sideA,
            recordedAt: '2026-08-27T14:00:00.000Z',
          },
        },
      ];

      const resolution = resolveSeries({
        declaration,
        sides: [sideA, sideB],
        matches,
      });

      expect(resolution.status).toBe('decided');
      expect(resolution.winnerEntrantId).toBe(sideA);
      expect(resolution.loserEntrantId).toBe(sideB);
      expect(resolution.matchesPlayed).toBe(3);
      expect(resolution.anulledMatchNumbers).toEqual([4, 5]);
      expect(resolution.trace[0]?.outcome).toBe('decided');
      expect(resolution.trace[0]?.values?.winnerEntrantId).toBe(sideA);
    });

    it('decides best-of-5 in 5 games with no anulled matches', () => {
      const matches = [
        {
          number: 1,
          status: 'finalized' as const,
          result: { sides: [], winnerEntrantId: sideA, recordedAt: '' },
        },
        {
          number: 2,
          status: 'finalized' as const,
          result: { sides: [], winnerEntrantId: sideB, recordedAt: '' },
        },
        {
          number: 3,
          status: 'finalized' as const,
          result: { sides: [], winnerEntrantId: sideA, recordedAt: '' },
        },
        {
          number: 4,
          status: 'finalized' as const,
          result: { sides: [], winnerEntrantId: sideB, recordedAt: '' },
        },
        {
          number: 5,
          status: 'finalized' as const,
          result: { sides: [], winnerEntrantId: sideB, recordedAt: '' },
        },
      ];

      const resolution = resolveSeries({
        declaration,
        sides: [sideA, sideB],
        matches,
      });

      expect(resolution.status).toBe('decided');
      expect(resolution.winnerEntrantId).toBe(sideB);
      expect(resolution.loserEntrantId).toBe(sideA);
      expect(resolution.anulledMatchNumbers).toHaveLength(0);
    });

    it('reports finished-unresolved when draws make reaching target wins impossible', () => {
      const matches = [
        { number: 1, status: 'finalized' as const, result: { sides: [], recordedAt: '' } },
        { number: 2, status: 'finalized' as const, result: { sides: [], recordedAt: '' } },
        { number: 3, status: 'finalized' as const, result: { sides: [], recordedAt: '' } },
      ];

      const resolution = resolveSeries({
        declaration: { span: 3, resolutionClass: 'best-of' },
        sides: [sideA, sideB],
        matches,
      });

      expect(resolution.status).toBe('finished-unresolved');
      expect(resolution.winnerEntrantId).toBeUndefined();
    });
  });

  describe('aggregate resolution', () => {
    const declaration: SeriesDeclaration = {
      span: 2,
      resolutionClass: 'aggregate',
    };

    it('reports undecided after 1 leg', () => {
      const matches = [
        {
          number: 1,
          status: 'finalized' as const,
          result: {
            sides: [
              { entrantId: sideA, statistics: { score: 3 } },
              { entrantId: sideB, statistics: { score: 1 } },
            ],
            recordedAt: '2026-08-27T12:00:00.000Z',
          },
        },
      ];

      const resolution = resolveSeries({
        declaration,
        sides: [sideA, sideB],
        matches,
      });

      expect(resolution.status).toBe('undecided');
      expect(resolution.matchesPlayed).toBe(1);
    });

    it('decides on higher aggregate sum across 2 legs for side A', () => {
      const matches = [
        {
          number: 1,
          status: 'finalized' as const,
          result: {
            sides: [
              { entrantId: sideA, statistics: { goals: 2 } },
              { entrantId: sideB, statistics: { goals: 1 } },
            ],
            recordedAt: '2026-08-27T12:00:00.000Z',
          },
        },
        {
          number: 2,
          status: 'finalized' as const,
          result: {
            sides: [
              { entrantId: sideA, statistics: { goals: 1 } },
              { entrantId: sideB, statistics: { goals: 1 } },
            ],
            recordedAt: '2026-08-27T13:00:00.000Z',
          },
        },
      ];

      const resolution = resolveSeries({
        declaration,
        sides: [sideA, sideB],
        matches,
      });

      expect(resolution.status).toBe('decided');
      expect(resolution.winnerEntrantId).toBe(sideA);
      expect(resolution.loserEntrantId).toBe(sideB);
      expect(resolution.explanation).toContain('3-2 on aggregate');
    });

    it('decides on higher aggregate sum across 2 legs for side B', () => {
      const matches = [
        {
          number: 1,
          status: 'finalized' as const,
          result: {
            sides: [
              { entrantId: sideA, statistics: { points: 1 } },
              { entrantId: sideB, statistics: { points: 2 } },
            ],
            recordedAt: '2026-08-27T12:00:00.000Z',
          },
        },
        {
          number: 2,
          status: 'finalized' as const,
          result: {
            sides: [
              { entrantId: sideA, statistics: { points: 1 } },
              { entrantId: sideB, statistics: { points: 3 } },
            ],
            recordedAt: '2026-08-27T13:00:00.000Z',
          },
        },
      ];

      const resolution = resolveSeries({
        declaration,
        sides: [sideA, sideB],
        matches,
      });

      expect(resolution.status).toBe('decided');
      expect(resolution.winnerEntrantId).toBe(sideB);
      expect(resolution.loserEntrantId).toBe(sideA);
      expect(resolution.explanation).toContain('5-2 on aggregate');
    });

    it('reports finished-unresolved when aggregate ends level', () => {
      const matches = [
        {
          number: 1,
          status: 'finalized' as const,
          result: {
            sides: [
              { entrantId: sideA, statistics: { goals: 2 } },
              { entrantId: sideB, statistics: { goals: 1 } },
            ],
            recordedAt: '2026-08-27T12:00:00.000Z',
          },
        },
        {
          number: 2,
          status: 'finalized' as const,
          result: {
            sides: [
              { entrantId: sideA, statistics: { goals: 0 } },
              { entrantId: sideB, statistics: { goals: 1 } },
            ],
            recordedAt: '2026-08-27T13:00:00.000Z',
          },
        },
      ];

      const resolution = resolveSeries({
        declaration,
        sides: [sideA, sideB],
        matches,
      });

      expect(resolution.status).toBe('finished-unresolved');
      expect(resolution.winnerEntrantId).toBeUndefined();
      expect(resolution.explanation).toContain('finished level (2-2)');
      expect(resolution.trace[0]?.outcome).toBe('finished-unresolved');
      expect(resolution.trace[0]?.values?.reason).toBe('level-aggregate');
    });
  });

  describe('points-per-leg resolution', () => {
    const declaration: SeriesDeclaration = {
      span: 3,
      resolutionClass: 'points-per-leg',
    };

    it('decides early when Side A clinches mathematically unreachable points lead', () => {
      const matches = [
        {
          number: 1,
          status: 'finalized' as const,
          result: { sides: [], winnerEntrantId: sideA, recordedAt: '' },
        },
        {
          number: 2,
          status: 'finalized' as const,
          result: { sides: [], winnerEntrantId: sideA, recordedAt: '' },
        },
      ];

      const resolution = resolveSeries({
        declaration,
        sides: [sideA, sideB],
        matches,
        pointsRules: { win: 3, draw: 1, loss: 0 },
      });

      expect(resolution.status).toBe('decided');
      expect(resolution.winnerEntrantId).toBe(sideA);
      expect(resolution.anulledMatchNumbers).toEqual([3]);
    });

    it('decides early when Side B clinches mathematically unreachable points lead', () => {
      const matches = [
        {
          number: 1,
          status: 'finalized' as const,
          result: { sides: [], winnerEntrantId: sideB, recordedAt: '' },
        },
        {
          number: 2,
          status: 'finalized' as const,
          result: { sides: [], winnerEntrantId: sideB, recordedAt: '' },
        },
      ];

      const resolution = resolveSeries({
        declaration,
        sides: [sideA, sideB],
        matches,
        pointsRules: { win: 3, draw: 1, loss: 0 },
      });

      expect(resolution.status).toBe('decided');
      expect(resolution.winnerEntrantId).toBe(sideB);
      expect(resolution.anulledMatchNumbers).toEqual([3]);
    });

    it('decides after full span when Side A has more points', () => {
      const declaration2: SeriesDeclaration = { span: 2, resolutionClass: 'points-per-leg' };
      const matches = [
        {
          number: 1,
          status: 'finalized' as const,
          result: { sides: [], winnerEntrantId: sideA, recordedAt: '' },
        },
        { number: 2, status: 'finalized' as const, result: { sides: [], recordedAt: '' } }, // draw
      ];

      const resolution = resolveSeries({
        declaration: declaration2,
        sides: [sideA, sideB],
        matches,
        pointsRules: { win: 3, draw: 1, loss: 0 },
      });

      expect(resolution.status).toBe('decided');
      expect(resolution.winnerEntrantId).toBe(sideA);
    });

    it('decides after full span when Side B has more points', () => {
      const declaration2: SeriesDeclaration = { span: 2, resolutionClass: 'points-per-leg' };
      const matches = [
        {
          number: 1,
          status: 'finalized' as const,
          result: { sides: [], winnerEntrantId: sideB, recordedAt: '' },
        },
        { number: 2, status: 'finalized' as const, result: { sides: [], recordedAt: '' } }, // draw
      ];

      const resolution = resolveSeries({
        declaration: declaration2,
        sides: [sideA, sideB],
        matches,
        pointsRules: { win: 3, draw: 1, loss: 0 },
      });

      expect(resolution.status).toBe('decided');
      expect(resolution.winnerEntrantId).toBe(sideB);
    });

    it('reports finished-unresolved when points end level', () => {
      const declaration2: SeriesDeclaration = { span: 2, resolutionClass: 'points-per-leg' };
      const matches = [
        {
          number: 1,
          status: 'finalized' as const,
          result: { sides: [], winnerEntrantId: sideA, recordedAt: '' },
        },
        {
          number: 2,
          status: 'finalized' as const,
          result: { sides: [], winnerEntrantId: sideB, recordedAt: '' },
        },
      ];

      const resolution = resolveSeries({
        declaration: declaration2,
        sides: [sideA, sideB],
        matches,
        pointsRules: { win: 3, draw: 1, loss: 0 },
      });

      expect(resolution.status).toBe('finished-unresolved');
      expect(resolution.winnerEntrantId).toBeUndefined();
    });

    it('reports undecided when points-per-leg is in progress without clinch', () => {
      const declaration4: SeriesDeclaration = { span: 4, resolutionClass: 'points-per-leg' };
      const matches = [
        {
          number: 1,
          status: 'finalized' as const,
          result: { sides: [], winnerEntrantId: sideA, recordedAt: '' },
        },
      ];

      const resolution = resolveSeries({
        declaration: declaration4,
        sides: [sideA, sideB],
        matches,
        pointsRules: { win: 3, draw: 1, loss: 0 },
      });

      expect(resolution.status).toBe('undecided');
    });
  });

  describe('scripted series resolution', () => {
    const declaration: SeriesDeclaration = {
      span: 3,
      resolutionScript: { id: 'custom-script', rules: [] },
    };

    it('reports undecided while matches are in progress', () => {
      const matches = [
        {
          number: 1,
          status: 'finalized' as const,
          result: { sides: [], winnerEntrantId: sideA, recordedAt: '' },
        },
      ];

      const resolution = resolveSeries({
        declaration,
        sides: [sideA, sideB],
        matches,
      });

      expect(resolution.status).toBe('undecided');
      expect(resolution.explanation).toContain('waiting for 2 further match(es)');
    });

    it('reports pending hook evaluation when all matches are finalized', () => {
      const matches = [
        {
          number: 1,
          status: 'finalized' as const,
          result: { sides: [], winnerEntrantId: sideA, recordedAt: '' },
        },
        {
          number: 2,
          status: 'finalized' as const,
          result: { sides: [], winnerEntrantId: sideB, recordedAt: '' },
        },
        {
          number: 3,
          status: 'finalized' as const,
          result: { sides: [], winnerEntrantId: sideA, recordedAt: '' },
        },
      ];

      const resolution = resolveSeries({
        declaration,
        sides: [sideA, sideB],
        matches,
      });

      expect(resolution.status).toBe('undecided');
      expect(resolution.explanation).toContain('requires rules engine hook evaluation');
    });
  });
});
