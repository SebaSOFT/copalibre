import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nodeOutcomes, toNode, type BracketMatch } from '../../../lib/bracket.js';
import { publicIntl, resultStateLabels, sideSourceLabels } from '../../../lib/i18n/public-intl.js';

const here = dirname(fileURLToPath(import.meta.url));
const matchNodeSource = readFileSync(join(here, 'MatchNode.astro'), 'utf8');
const bracketViewSource = readFileSync(join(here, 'BracketView.astro'), 'utf8');
const bracketGraphSource = readFileSync(join(here, 'BracketGraph.astro'), 'utf8');
const matchHeroSource = readFileSync(join(here, 'MatchHero.astro'), 'utf8');

describe('Bracket context, MatchNode, and MatchHero static composition', () => {
  it('reuses AdvancingBadge across MatchNode, BracketView outline, and MatchHero with no inline client hydration', () => {
    expect(matchNodeSource).toContain(
      "import { AdvancingBadge } from '../atoms/AdvancingBadge.tsx'",
    );
    expect(matchNodeSource).toContain(
      '{slot.advancing && <AdvancingBadge label={advancesLabel} />}',
    );
    expect(matchNodeSource).toContain("slot.eliminated && 'cl-slot--eliminated'");

    expect(bracketViewSource).toContain(
      "import { AdvancingBadge } from '../atoms/AdvancingBadge.tsx'",
    );
    expect(bracketViewSource).toContain('<AdvancingBadge label={advancesLabel} />');

    expect(matchHeroSource).toContain(
      "import { AdvancingBadge } from '../atoms/AdvancingBadge.tsx'",
    );
    expect(matchHeroSource).toContain('{homeAdvances && <AdvancingBadge label={advancesLabel} />}');
    expect(matchHeroSource).toContain('{awayAdvances && <AdvancingBadge label={advancesLabel} />}');
    expect(matchHeroSource).toContain("homeEliminated && 'cl-scoreboard__side--eliminated'");
    expect(matchHeroSource).toContain("awayEliminated && 'cl-scoreboard__side--eliminated'");
  });

  it('shows qualifier origin labels and upcoming schedule/venue on MatchNode without cluttering completed matches', () => {
    expect(matchNodeSource).toContain('cl-slot__origin');
    expect(matchNodeSource).toContain('{slot.originLabel !== undefined && (');
    expect(matchNodeSource).toContain(
      "{node.state === 'upcoming' && (scheduledAt !== undefined || venueName !== undefined) && (",
    );
    expect(matchNodeSource).toContain('<ResponsiveTimestamp');
    expect(matchNodeSource).toContain('timeZone={organizationTimeZone}');
  });

  it('uses explicit zoneName as the main-bracket heading in BracketView and BracketGraph and threads schedule rows', () => {
    for (const source of [bracketViewSource, bracketGraphSource]) {
      expect(source).toContain("(branch === 'winners' || branch === 'winner') && zoneName?.trim()");
      expect(source).toContain('? zoneName.trim()');
      expect(source).toContain(': bracketBranchLabel(intl, branch)');
    }
    expect(bracketGraphSource).toContain(
      'scheduleByMatchNumber.get(node.match.matchNumber)?.scheduledAt',
    );
    expect(bracketGraphSource).toContain(
      'scheduleByMatchNumber.get(node.match.matchNumber)?.venueName',
    );
    expect(bracketGraphSource).toContain('organizationTimeZone={organizationTimeZone}');
  });

  it('renders stakes lines in MatchHero when provided', () => {
    expect(matchHeroSource).toContain('stakeLines = []');
    expect(matchHeroSource).toContain('cl-match-stakes');
    expect(matchHeroSource).toContain('{stakeLines.map((line) => (');
  });
});

describe('MatchNode view-model rules for drawn knockout advancement and qualifier origin', () => {
  const esIntl = publicIntl('es');
  const states = resultStateLabels(esIntl);
  const sources = sideSourceLabels(esIntl);

  it('marks advancing and eliminated slots on a drawn finalized match with winnerEntrantId, never on score wins', () => {
    const drawn: BracketMatch = {
      matchId: 'm-draw',
      matchNumber: 4,
      roundNumber: 2,
      branch: 'winners',
      state: 'final',
      scores: [3, 3],
      winnerEntrantId: 'e2',
      slots: [
        {
          kind: 'entrant',
          entrantId: 'e1',
          name: 'Norte',
          qualifierOrigin: {
            qualifierLabel: { kind: 'group-rank', rank: 1, groupName: 'Grupo A' },
          },
        },
        { kind: 'entrant', entrantId: 'e2', name: 'Sur', qualifierOrigin: { position: 2 } },
      ],
    };

    const drawnNode = toNode(drawn, states, sources);
    expect(drawnNode.slots[0]?.advancing).toBeUndefined();
    expect(drawnNode.slots[0]?.eliminated).toBe(true);
    expect(drawnNode.slots[0]?.originLabel).toBe('1.° Grupo A');
    expect(drawnNode.slots[1]?.advancing).toBe(true);
    expect(drawnNode.slots[1]?.winner).toBe(true);
    expect(drawnNode.slots[1]?.eliminated).toBeUndefined();
    expect(drawnNode.slots[1]?.originLabel).toBe('Clasificado 2');
    expect(nodeOutcomes(drawn)).toEqual(['eliminated', 'advancing']);

    const scoreWin: BracketMatch = {
      ...drawn,
      matchId: 'm-score',
      scores: [4, 2],
      winnerEntrantId: 'e1',
    };
    const scoreNode = toNode(scoreWin, states, sources);
    expect(scoreNode.slots[0]?.advancing).toBeUndefined();
    expect(scoreNode.slots[0]?.eliminated).toBeUndefined();
    expect(scoreNode.slots[0]?.winner).toBe(true);
    expect(scoreNode.slots[1]?.advancing).toBeUndefined();
    expect(scoreNode.slots[1]?.eliminated).toBeUndefined();
  });
});
