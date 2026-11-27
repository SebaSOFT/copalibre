import type { Meta, StoryObj } from '@storybook/react-vite';
import { TvMatchCounters } from './TvMatchCounters.js';
import type { LiveMatch } from '../../../../lib/live-state.js';

const TEXTS = {
  accessibleValue: '{label}: {value}',
  accessibleAllowance: '{label}: {value} de {allowance}',
  warning: 'en advertencia',
};

const MATCH: LiveMatch = {
  matchId: 'm-1',
  stageNumber: 1,
  matchNumber: 7,
  state: 'live',
  projectionVersion: 1,
  sides: [
    {
      entrantId: 'e-1',
      name: 'Club Atlético Independiente',
      abbreviation: 'CAI',
      score: 2,
      state: 'live',
    },
    { entrantId: 'e-2', name: 'Deportivo San Juan', abbreviation: 'DSJ', score: 1, state: 'live' },
  ],
  counters: [
    {
      code: 'team-fouls',
      label: { en: 'Team fouls', es: 'Faltas de equipo' },
      shortLabel: { en: 'F', es: 'F' },
      scope: 'match',
      events: ['team-foul'],
      warnAt: 9,
      values: [
        { entrantId: 'e-1', value: 4 },
        { entrantId: 'e-2', value: 9 },
      ],
    },
    {
      code: 'timeouts',
      label: { en: 'Timeouts', es: 'Tiempos muertos' },
      shortLabel: { en: 'TM', es: 'TM' },
      scope: 'segment',
      events: ['timeout'],
      allowance: 1,
      values: [
        { entrantId: 'e-1', value: 1 },
        { entrantId: 'e-2', value: 0 },
      ],
    },
  ],
};

/**
 * Counters in the venue kiosk's scorebug (compact) and in the spotlight (full). A counter at its
 * warning value carries the warning tone and a "!" cue.
 */
const meta: Meta<typeof TvMatchCounters> = {
  title: 'TV/Organisms/TvMatchCounters',
  component: TvMatchCounters,
  args: { match: MATCH, language: 'es', texts: TEXTS, density: 'compact' },
};

export default meta;
type Story = StoryObj<typeof TvMatchCounters>;

export const Compact: Story = {};

export const Full: Story = { args: { density: 'full' } };

export const NoCounters: Story = { args: { match: { ...MATCH, counters: undefined } } };
