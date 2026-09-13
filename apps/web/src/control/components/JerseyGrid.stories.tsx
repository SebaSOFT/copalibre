import type { Meta, StoryObj } from '@storybook/react-vite';
import { JerseyGrid } from './JerseyGrid.js';
import { useState } from 'react';
import { consoleProjection, ids } from './screen-story-fixtures.js';
const meta = {
  title: 'Admin/Screens/JerseyGrid',
  component: JerseyGrid,
  args: {
    rosters: consoleProjection.rosters,
    rosterRoles: consoleProjection.rosterRoles,
    sentOffPersonIds: new Set<string>(),
    disabled: false,
    primarySide: ids.first,
    primaryPersonId: ids.person,
    secondaryFields: [],
    secondarySelections: {},
    activeField: undefined,
    onChangeActiveField: () => undefined,
    onSelectPrimary: () => undefined,
    onSelectSecondary: () => undefined,
  },
  render: function Render(args) {
    const [selected, setSelected] = useState([args.primarySide, args.primaryPersonId]);
    return (
      <JerseyGrid
        {...args}
        primarySide={selected[0]}
        primaryPersonId={selected[1]}
        onSelectPrimary={(side, person) => setSelected([side, person])}
      />
    );
  },
} satisfies Meta<typeof JerseyGrid>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Empty: Story = { args: { rosters: [] } };
export const SentOff: Story = { args: { sentOffPersonIds: new Set([ids.person]) } };
export const Disabled: Story = { args: { disabled: true } };
