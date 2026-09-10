import type { Meta, StoryObj } from '@storybook/react-vite';
import { TerminalBlock } from './TerminalBlock.js';

const meta = {
  title: 'Admin/Atoms/TerminalBlock',
  component: TerminalBlock,
  argTypes: {
    title: { control: 'text' },
    command: { control: 'text' },
    code: { control: 'text' },
    variant: { control: 'inline-radio', options: ['terminal', 'file'] },
  },
} satisfies Meta<typeof TerminalBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: {
    title: 'install.sh',
    command: 'copalibre module install football-11v11',
  },
};

export const MultiLineYaml: Story = {
  args: {
    title: 'discipline.yaml',
    code: `discipline: football-11v11
periods: 2
period_duration: 45m
points_for_win: 3
points_for_draw: 1`,
    language: 'yaml',
  },
};

/**
 * The file variant: a filename, a copy action, an inset body — and neither the
 * window dots nor the prompt, because a compose file shown behind them reads as
 * something to run rather than something to save.
 */
export const FileVariant: Story = {
  args: {
    title: 'compose.yaml',
    variant: 'file',
    language: 'yaml',
    codeRegionLabel: 'compose.yaml contents',
    code: `services:
  api:
    image: ghcr.io/sebasoft/copalibre-api:latest
    environment:
      DATABASE_URL: postgres://copalibre:copalibre@postgres:5432/copalibre
      OUTBOX_POLL_INTERVAL_MS: 500
  web:
    image: ghcr.io/sebasoft/copalibre-web:latest
    depends_on: [api]`,
  },
};

/** Both variants together, which is the only way to see what the file drops. */
export const Matrix: Story = {
  args: { title: '' },
  render: () => (
    <div style={{ display: 'grid', gap: 'var(--cl-space-4)' }}>
      <TerminalBlock command="copalibre module install football-11v11" title="bash" />
      <TerminalBlock
        code={'discipline: football-11v11\nperiods: 2'}
        language="yaml"
        title="discipline.yaml"
        variant="file"
      />
    </div>
  ),
};

/**
 * A line wider than the frame.
 *
 * It scrolls inside the block's own region rather than re-flowing: which column
 * a YAML key sits in is exactly what wrapping destroys.
 */
export const LongLines: Story = {
  args: {
    title: 'values.yaml',
    variant: 'file',
    language: 'yaml',
    codeRegionLabel: 'values.yaml contents',
    code: `api:
  env:
    DATABASE_URL: postgres://copalibre:copalibre@postgres.copalibre.svc.cluster.local:5432/copalibre?sslmode=require&application_name=copalibre-api`,
  },
};
