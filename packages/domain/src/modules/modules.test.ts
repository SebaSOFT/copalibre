import { bindCapabilities } from '../capabilities/binder.js';
import { validateDisciplineDescriptorDocument } from '../descriptors/descriptor-schema.js';
import { SEGMENT_THRESHOLD_EVENT_CODES } from '../descriptors/segment-threshold-events.js';
import { battleRoyaleDescriptor } from './battle-royale-descriptor.js';
import { footballDescriptor } from './football-descriptor.js';
import { swimmingDescriptor } from './swimming-descriptor.js';
import { tennisDescriptor } from './tennis-descriptor.js';
import { winConditionScript } from './win-condition-scripts.js';

/** A module is JSON on the wire; validate it the way an installation would. */
function asDocument(value: unknown): unknown {
  const document = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  delete document.descriptorId;
  return JSON.parse(JSON.stringify(document)) as unknown;
}

describe('discipline test builders', () => {
  const descriptors = [
    footballDescriptor(),
    tennisDescriptor(),
    battleRoyaleDescriptor(),
    swimmingDescriptor(),
  ];

  it.each(descriptors.map((descriptor) => [descriptor.name, descriptor] as const))(
    '%s satisfies the descriptor schema with no privileges',
    (_name, descriptor) => {
      expect(validateDisciplineDescriptorDocument(asDocument(descriptor)).ok).toBe(true);
    },
  );

  it.each(descriptors.map((descriptor) => [descriptor.name, descriptor] as const))(
    '%s can raise segment thresholds as events',
    (_name, descriptor) => {
      const codes = descriptor.eventDefinitions.map((definition) => definition.code);
      for (const code of SEGMENT_THRESHOLD_EVENT_CODES) expect(codes).toContain(code);
    },
  );

  describe('football', () => {
    const football = footballDescriptor();

    it('declares every statistic the engine used to assume', () => {
      expect(football.statistics.map((statistic) => statistic.code)).toEqual([
        'goals-for',
        'goals-against',
        'player-own-goals',
        'assists',
        'yellow-cards',
        'red-cards',
        'wins',
        'draws',
        'losses',
        'points',
        'played',
      ]);
    });

    it('declares player-ranking table layouts for top scorers, assists, and cards', () => {
      expect(football.tableLayouts?.map((layout) => layout.code)).toEqual([
        'top-scorers',
        'assists',
        'cards',
      ]);
      const topScorers = football.tableLayouts?.find((layout) => layout.code === 'top-scorers');
      expect(topScorers?.target).toBe('player-ranking');
      expect(topScorers?.entityGranularity).toBe('person');
      const cards = football.tableLayouts?.find((layout) => layout.code === 'cards');
      expect(cards?.defaultSort).toEqual([
        { columnCode: 'red-cards', direction: 'desc' },
        { columnCode: 'yellow-cards', direction: 'desc' },
      ]);
    });

    it('declares organization-granularity collector for career goals', () => {
      const careerGoals = football.collectors?.find(
        (collector) => collector.code === 'career-goals',
      );
      expect(careerGoals).toBeDefined();
      expect(careerGoals?.granularity).toEqual({ actor: 'person', competition: 'organization' });
    });

    it('counts matches played rather than summing them', () => {
      const played = football.statistics.find((statistic) => statistic.code === 'played');
      expect(played?.aggregation).toBe('count');
    });

    it('leaves score-difference to the comparator pipeline', () => {
      expect(football.statistics.map((statistic) => statistic.code)).not.toContain(
        'score-difference',
      );
      expect(football.defaults.tiebreakers).toContain('score-difference');
    });
  });

  describe('tennis', () => {
    const tennis = tennisDescriptor();

    it('declares a statistic at every level it scores at', () => {
      const codes = tennis.statistics.map((statistic) => statistic.code);
      expect(codes).toEqual(
        expect.arrayContaining(['matches-won', 'sets-won', 'sets-lost', 'games-won', 'games-lost']),
      );
    });

    it('satisfies a three-level tiebreak binding that requires declarative accounting', () => {
      const binding = bindCapabilities(tennis, {
        profileId: '01890000-0000-7000-8000-00000000p001',
        alias: 'club-ladder',
        version: '1.0.0',
        name: 'Club Ladder',
        attribution: { author: 'CopaLibre', licence: 'CC-BY-4.0' },
        requires: [
          { capability: 'primary-scoring', satisfiedBy: ['matches-won'], necessity: 'required' },
          { capability: 'secondary-scoring', satisfiedBy: ['sets-won'], necessity: 'required' },
          { capability: 'tertiary-scoring', satisfiedBy: ['games-won'], necessity: 'required' },
        ],
        stages: [{ number: 1, name: 'Group', format: 'round-robin' }],
        points: { win: 2, draw: 0, loss: 0 },
        tiebreak: [],
      });

      expect(binding.ok).toBe(true);
      if (!binding.ok) return;
      expect(binding.value.resolved.map((entry) => entry.resolvedTo)).toEqual([
        'matches-won',
        'sets-won',
        'games-won',
      ]);
    });

    it('states the set rule, the tiebreak and the match rule in one script', () => {
      const script = tennis.winCondition as { rules: { actions: { type: string }[] }[] };
      const actionTypes = script.rules.flatMap((rule) => rule.actions.map((action) => action.type));
      expect(actionTypes).toEqual(['requireMargin', 'winSegment', 'winMatch']);
    });
  });

  describe('winConditionScript', () => {
    it('omits requireMargin where no margin is asked for', () => {
      const script = winConditionScript('plain', { unit: 'goals' }) as {
        rules: { actions: { type: string }[] }[];
      };
      expect(script.rules.flatMap((rule) => rule.actions.map((a) => a.type))).toEqual(['winMatch']);
    });

    it('omits tiebreak parameters a discipline does not use', () => {
      const script = winConditionScript('frames', { unit: 'frame', target: 5 }, [
        { segment: 'frame', target: 1 },
      ]) as { rules: { actions: { params: { name: string }[] }[] }[] };
      const segmentParams = script.rules[0]?.actions[0]?.params.map((param) => param.name);
      expect(segmentParams).toEqual(['segment', 'target']);
    });
  });
});
