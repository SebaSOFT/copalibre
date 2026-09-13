import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within, expect } from 'storybook/test';
import { useMemo } from 'react';
import { useIntl } from 'react-intl';
import { RegistrationReviewPage } from '../pages/RegistrationReviewPage.js';
import type { ControlApiClient } from '../../lib/api-client.js';
import { messages } from '../../i18n/messages.en.js';
import {
  ORG,
  TOURNAMENT,
  NOW,
  ids,
  storyIntl,
  registrations,
  pending,
  storyClient,
} from '../screen-story-fixtures.js';

function Screen({ mode }: { readonly mode: 'loaded' | 'empty' | 'loading' | 'failed' }) {
  const intl = useIntl();
  const client = useMemo(() => {
    const empty = mode === 'empty';
    function read<T>(value: T): Promise<T> {
      if (mode === 'loading') return pending<T>();
      if (mode === 'failed')
        return Promise.reject(new Error(intl.formatMessage(messages.registrationLoadFailed)));
      return Promise.resolve(value);
    }
    return storyClient<ControlApiClient>({
      createCsvImport: async () => ({
        importId: ids.match,
        target: 'team',
        status: 'queued',
        sourceHash: 'fixture-hash',
      }),
      fetchCsvImport: async () => ({
        importId: ids.match,
        target: 'team',
        status: 'review-ready',
        sourceHash: 'fixture-hash',
        preview: {
          valid: true,
          rows: [
            { rowNumber: 1, errors: [] },
            { rowNumber: 2, errors: [] },
          ],
          errors: [],
        },
      }),
      commitCsvImport: async () => ({
        importId: ids.match,
        target: 'team',
        status: 'committing',
        sourceHash: 'fixture-hash',
      }),
      listRegistrations: () => read(empty ? [] : registrations),
      listEntrantsNeedingAbbreviation: undefined,
      setEntrantAbbreviation: undefined,
      setPersonNationality: undefined,
      uploadPersonPhoto: undefined,
      createPerson: undefined,
      createTeam: undefined,
      updatePersonIdentity: undefined,
      updateTeamIdentity: undefined,
      linkParticipantIdentity: undefined,
      unlinkParticipantIdentity: undefined,
      editTeamMemberships: undefined,
    });
  }, [mode, intl]);
  return (
    <RegistrationReviewPage
      organizationAlias={ORG}
      tournamentAlias={TOURNAMENT}
      now={NOW}
      client={client}
    />
  );
}
const meta = {
  title: 'Admin/Screens/RegistrationReviewPage',
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
export const ImportCommitting: Story = {
  play: async ({ canvasElement, globals }) => {
    const canvas = within(canvasElement);
    const intl = storyIntl(globals.locale);
    const input = await canvas.findByLabelText(intl.formatMessage(messages.registrationCsvLabel));
    await userEvent.upload(
      input,
      new File(['teamName\nMeridian Seven\nIronclad Five\n'], 'entrants.csv', { type: 'text/csv' }),
    );
    const confirm = await canvas.findByRole('button', {
      name: intl.formatMessage(messages.registrationConfirmImport),
    });
    await userEvent.click(confirm);
    await expect(
      canvas.findByText(intl.formatMessage(messages.registrationImportConfirmed)),
    ).resolves.toBeTruthy();
  },
};
