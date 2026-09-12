import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within, expect } from 'storybook/test';
import { useMemo } from 'react';
import { useIntl } from 'react-intl';
import { ScheduleBuilderPage } from '../pages/ScheduleBuilderPage.js';
import type { ControlApiClient } from '../../lib/api-client.js';
import { messages } from '../../i18n/messages.en.js';
import {
  ORG,
  TOURNAMENT,
  NOW,
  ids,
  pending,
  storyClient,
  storyIntl,
} from '../screen-story-fixtures.js';

function Screen({ mode }: { readonly mode: 'loaded' | 'empty' | 'loading' | 'failed' }) {
  const intl = useIntl();
  const client = useMemo(() => {
    const empty = mode === 'empty';
    function read<T>(value: T): Promise<T> {
      if (mode === 'loading') return pending<T>();
      if (mode === 'failed')
        return Promise.reject(new Error(intl.formatMessage(messages.scheduleBuilderLoadFailed)));
      return Promise.resolve(value);
    }
    return storyClient<ControlApiClient>({
      getStageFixtures: () =>
        read({
          stageId: ids.stage,
          fixtures: empty
            ? []
            : [
                {
                  fixtureId: ids.match,
                  matchId: ids.match,
                  round: 1,
                  homeEntrantId: ids.first,
                  awayEntrantId: ids.second,
                },
              ],
        }),
      getSchedule: async () => ({ assignments: [] }),
      listVenues: async () => [
        {
          venueId: ids.third,
          organizationId: ids.organization,
          alias: 'cancha-central',
          name: 'Cancha Central',
          concurrentCapacity: 1,
        },
      ],
      listOfficials: async () => [],
      listSchedules: async () => [
        {
          scheduleId: ids.stage,
          organizationId: ids.organization,
          name: 'Copa Premier',
          startsAt: Date.parse(NOW),
          endsAt: Date.parse(NOW) + 7200000,
          slotMinutes: 90,
          turnaroundMinutes: 15,
          venueIds: [ids.third],
          slots: [
            {
              slotId: ids.first,
              scheduleId: ids.stage,
              venueId: ids.third,
              startsAt: Date.parse(NOW),
              matchCount: 0,
            },
          ],
        },
      ],
      previewSchedule: async () => ({
        committable: false,
        affectedPublishedMatches: [ids.second],
        conflicts: [
          {
            kind: 'venue-overlap',
            matchId: ids.match,
            conflictsWithMatchId: ids.second,
            resourceId: ids.third,
            detail: 'Cancha Central / Meridian Seven',
          },
        ],
      }),
    });
  }, [mode, intl]);
  return (
    <ScheduleBuilderPage
      organizationAlias={ORG}
      tournamentAlias={TOURNAMENT}
      stageNumber={1}
      client={client}
    />
  );
}
const meta = {
  title: 'Admin/Screens/ScheduleBuilderPage',
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
export const Conflict: Story = {
  play: async ({ canvasElement, globals }) => {
    const canvas = within(canvasElement);
    const intl = storyIntl(globals.locale);
    await canvas.findByRole('heading', { level: 1 });
    const slots = await canvas.findAllByRole('combobox');
    const slot = slots.find((select) => select.querySelector('option[value="' + ids.first + '"]'));
    if (!slot) throw new Error('Schedule slot selector is missing');
    await userEvent.selectOptions(slot, ids.first);
    await userEvent.click(
      canvas.getByRole('button', { name: intl.formatMessage(messages.scheduleBuilderPreview) }),
    );
    await expect(canvas.findByText('Cancha Central / Meridian Seven')).resolves.toBeTruthy();
  },
};
