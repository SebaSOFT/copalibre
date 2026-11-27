import type { Meta, StoryObj } from '@storybook/react-vite';
import { MatchConsoleLedgerSection } from './MatchConsoleLedgerSection.js';
import { consoleProjection } from '../screen-story-fixtures.js';

const meta = {
  title: 'Admin/Screens/MatchConsoleLedgerSection',
  component: MatchConsoleLedgerSection,
  args: {
    eventCategory: 'all',
    eventEntryIds: new Set<string>(),
    eventSyncStates: {},
    ledgerEvents: consoleProjection.events,
    ledgerExpanded: false,
    logNote: '',
    pendingMutations: [],
    projection: consoleProjection,
    segmentTypeText: (segment) => segment.type,
    setEventCategory: () => undefined,
    setLedgerExpanded: () => undefined,
    setLogNote: () => undefined,
  },
} satisfies Meta<typeof MatchConsoleLedgerSection>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Collapsed: Story = {};
export const Expanded: Story = { args: { ledgerExpanded: true } };
export const Empty: Story = { args: { ledgerEvents: [] } };
