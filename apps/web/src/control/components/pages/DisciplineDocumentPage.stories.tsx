import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { useIntl } from 'react-intl';
import { DisciplineDocumentPage } from '../pages/DisciplineDocumentPage.js';
import type { ControlApiClient } from '../../lib/api-client.js';
import { messages } from '../../i18n/messages.en.js';
import { storyClient, pending, discipline } from '../screen-story-fixtures.js';

const DISCIPLINE_ALIAS = discipline.alias ?? 'football';

const SAMPLE_DOCUMENT = {
  segmentTypes: [
    { name: 'regulation', label: 'Regulation period', timed: true, defaultDurationSeconds: 2700 },
  ],
  eventDefinitions: [
    {
      code: 'scoring-play',
      label: 'Scoring play',
      actorRequirement: 'side',
      effects: [{ kind: 'score', awardTo: 'actor', delta: 1 }],
    },
  ],
  defaults: { scoring: { pointsPerWin: 3 } },
  fieldPolicies: {
    'scoring.pointsPerWin': {
      permission: { kind: 'replaced' },
      mutationClass: 'blocked_after_results',
      label: 'Points per win',
    },
  },
};

function Screen({ mode }: { readonly mode: 'loaded' | 'empty' | 'loading' | 'failed' }) {
  const intl = useIntl();
  const client = useMemo(() => {
    const empty = mode === 'empty';
    function read<T>(value: T): Promise<T> {
      if (mode === 'loading') return pending<T>();
      if (mode === 'failed')
        return Promise.reject(new Error(intl.formatMessage(messages.disciplineDocumentLoadFailed)));
      return Promise.resolve(value);
    }
    return storyClient<ControlApiClient>({
      fetchInstalledDisciplineDocument: () =>
        read({
          descriptorId: discipline.descriptorId,
          alias: DISCIPLINE_ALIAS,
          version: discipline.version,
          document: empty
            ? { segmentTypes: [], eventDefinitions: [], defaults: {}, fieldPolicies: {} }
            : SAMPLE_DOCUMENT,
        }),
    });
  }, [mode, intl]);
  return <DisciplineDocumentPage client={client} disciplineAlias={DISCIPLINE_ALIAS} />;
}
const meta = {
  title: 'Admin/Screens/DisciplineDocumentPage',
  component: Screen,
  args: { mode: 'loaded' },
  argTypes: { mode: { control: 'select', options: ['loaded', 'empty', 'loading', 'failed'] } },
} satisfies Meta<typeof Screen>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Empty: Story = { args: { mode: 'empty' } };
export const Loading: Story = { args: { mode: 'loading' } };
export const Failed: Story = { args: { mode: 'failed' } };
