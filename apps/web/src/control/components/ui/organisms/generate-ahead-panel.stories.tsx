import type { Meta, StoryObj } from '@storybook/react-vite';
import { GenerateAheadPanel } from './generate-ahead-panel.js';

const preview = (
  <ol>
    <li>1st Grupo A — 2nd Grupo B</li>
    <li>2nd Grupo A — 1st Grupo B</li>
  </ol>
);

const meta = {
  title: 'Admin/Organisms/GenerateAheadPanel',
  component: GenerateAheadPanel,
  args: {
    title: 'Generate ahead',
    description:
      'A reviewed promotion plan routes qualifiers to this stage. Generate its bracket now with qualifier positions; entrants are confirmed once the prior stage completes.',
    previewHeading: 'Bracket preview',
    generateLabel: 'Generate ahead',
    children: preview,
    generated: false,
    generatedMessage: 'Generated ahead. Confirm the qualification once the prior stage completes.',
    confirmLabel: 'Confirm qualification',
    confirmHref: '/control/liga-san-juan/tournaments/copa-premier/stages/2/qualification',
    onGenerate: async () => undefined,
  },
} satisfies Meta<typeof GenerateAheadPanel>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Before generating: the preview and one explicit action. */
export const Preview: Story = {};

/** Already generated: the panel points at the confirmation screen. */
export const Generated: Story = { args: { generated: true } };

/** Results exist in the stage, so it can no longer be generated again. */
export const Disabled: Story = { args: { disabled: true } };
