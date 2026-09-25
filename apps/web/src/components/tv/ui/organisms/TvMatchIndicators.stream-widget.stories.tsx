import type { Meta, StoryObj } from '@storybook/react-vite';
import { TvMatchIndicators } from './TvMatchIndicators.js';
import type { LiveMatch } from '../../../../lib/live-state.js';

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
};

/**
 * Rendered inside the lower-third overlay bug (`.tv-lower-third__bug`,
 * `TvDashboard.tsx`) — an OBS/vMix browser-source composited over a live
 * camera feed, never shown on its own. See
 * "TV/Kiosk Monitor/TvMatchIndicators" for the same component inside the
 * venue kiosk's scorebug header instead; the component's own markup never
 * changes between the two, only its host does.
 *
 * Wrapped in the same `tv-root-container tv-lower-third` outer markup
 * production renders (`TvDashboard.tsx`'s `presentation === 'lower'` branch):
 * `tv-preview.css` bottom-anchors that exact class inside the story stage, so
 * the bug sits low in frame with clear space above it, the way it actually
 * sits over a full 16:9 camera feed — not flush against the story's own top.
 */
function StreamWidgetLowerThird({
  children,
}: {
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="tv-root-container tv-lower-third">
      <div className="tv-lower-third__bug cl-chamfer">{children}</div>
    </div>
  );
}

const meta = {
  title: 'TV/Stream Widgets/TvMatchIndicators',
  component: TvMatchIndicators,
  args: {
    possessionLabel: 'Posesión',
    penaltyLabel: 'Sanción',
  },
  decorators: [
    (Story) => (
      <StreamWidgetLowerThird>
        <Story />
      </StreamWidgetLowerThird>
    ),
  ],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof TvMatchIndicators>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Possession: Story = {
  args: { match: { ...MATCH, possessionEntrantId: 'e-1' } },
};

/** Composited over a chroma-keyed camera feed — the widget's actual ground. */
export const PossessionGreenChroma: Story = {
  args: { match: { ...MATCH, possessionEntrantId: 'e-1' } },
  parameters: { tvBackdrop: 'chroma' },
};

export const TimedPenalty: Story = {
  args: {
    match: {
      ...MATCH,
      activePenalties: [{ timerId: 't-1', entrantId: 'e-2', remainingSeconds: 125 }],
    },
  },
};

/** No explicit projection fact: the surface renders nothing, not a guess. */
export const NoFacts: Story = { args: { match: MATCH } };
