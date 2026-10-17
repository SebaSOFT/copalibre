import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { QualificationPage } from '../pages/QualificationPage.js';
import { ControlApiError, type ControlApiClient } from '../../lib/api-client.js';
import {
  ORG,
  TOURNAMENT,
  pending,
  qualificationPreview,
  storyClient,
} from '../screen-story-fixtures.js';

type Mode = 'loaded' | 'empty' | 'loading' | 'failed' | 'tied';

function Screen({ mode }: { readonly mode: Mode }) {
  const client = useMemo(
    () =>
      storyClient<ControlApiClient>({
        previewQualification: () => {
          if (mode === 'loading') return pending();
          if (mode === 'failed') return Promise.reject(new Error('offline'));
          if (mode === 'empty')
            return Promise.reject(
              new ControlApiError(404, 'No promotion plan', 'qualification-plan-missing'),
            );
          return Promise.resolve(qualificationPreview(mode === 'tied' ? 'tied' : 'ready'));
        },
        confirmQualification: async () => ({
          ...qualificationPreview('confirmed'),
          changedSides: 4,
        }),
      }),
    [mode],
  );
  return (
    <QualificationPage
      client={client}
      organizationAlias={ORG}
      stageNumber={2}
      tournamentAlias={TOURNAMENT}
    />
  );
}

const meta = {
  title: 'Admin/Screens/QualificationPage',
  component: Screen,
  args: { mode: 'loaded' },
  argTypes: {
    mode: { control: 'select', options: ['loaded', 'empty', 'loading', 'failed', 'tied'] },
  },
} satisfies Meta<typeof Screen>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Empty: Story = { args: { mode: 'empty' } };
export const Loading: Story = { args: { mode: 'loading' } };
export const Failed: Story = { args: { mode: 'failed' } };
export const Tied: Story = { args: { mode: 'tied' } };
