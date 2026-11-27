import type { Meta, StoryObj } from '@storybook/react-vite';
import type { MatchConsoleApiClient } from '../../lib/api-client.js';
import { sentOffPersonIds } from '../../lib/match-console.js';
import { ORG, TOURNAMENT, consoleProjection, ids, storyClient } from '../screen-story-fixtures.js';
import { secondaryActorFieldsOf } from './match-console-model.js';
import { MatchConsoleRecordSection } from './MatchConsoleRecordSection.js';
import type { MatchConsoleSelection } from './use-match-console-selection.js';

const client = storyClient<MatchConsoleApiClient>({
  fetchRosterCandidates: async () => [{ personId: ids.person, name: 'V. Kael' }],
});

const selection: MatchConsoleSelection = {
  activeSecondaryField: undefined,
  secondaryActorSelections: {},
  selectedPersonId: '',
  selectedSide: ids.first,
  selectedStaffId: '',
  setActiveSecondaryField: () => undefined,
  setSecondaryActorSelections: () => undefined,
  setSelectedPersonId: () => undefined,
  setSelectedSide: () => undefined,
  setSelectedStaffId: () => undefined,
};

const meta = {
  title: 'Admin/Screens/MatchConsoleRecordSection',
  component: MatchConsoleRecordSection,
  args: {
    api: client,
    canRecord: true,
    canSelectRoster: true,
    conditionalEvent: undefined,
    dismissedRosterNotice: false,
    description: '',
    language: 'en',
    matchId: ids.match,
    onRecord: () => undefined,
    onRecordFinal: () => undefined,
    onRosterSaved: () => undefined,
    organizationAlias: ORG,
    pendingOccurredAt: undefined,
    permittedEvents: consoleProjection.eventDefinitions,
    projection: consoleProjection,
    rosterStepOpen: false,
    secondaryActorFields: secondaryActorFieldsOf(consoleProjection.eventDefinitions),
    selection,
    sentOff: sentOffPersonIds(consoleProjection.events),
    setDescription: () => undefined,
    setDismissedRosterNotice: () => undefined,
    setRosterStepOpen: () => undefined,
    tournamentAlias: TOURNAMENT,
  },
} satisfies Meta<typeof MatchConsoleRecordSection>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Recording: Story = {};
/** The roster step open, with no roster named yet. */
export const SelectingRoster: Story = {
  args: { rosterStepOpen: true, dismissedRosterNotice: true },
};
