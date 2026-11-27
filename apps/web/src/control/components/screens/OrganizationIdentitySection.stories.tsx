import type { Meta, StoryObj } from '@storybook/react-vite';
import { OrganizationIdentitySection } from './OrganizationIdentitySection.js';
import type { ControlApiClient } from '../../lib/api-client.js';
import { storyClient, ORG } from '../screen-story-fixtures.js';

const client = storyClient<ControlApiClient>({
  updateOrganizationSettings: undefined,
  uploadOrganizationEmblem: undefined,
});

const meta = {
  title: 'Admin/Screens/Preferences sections/Organization identity',
  component: OrganizationIdentitySection,
  args: {
    api: client,
    canManage: true,
    onChangeSettings: () => undefined,
    onResetSettings: () => undefined,
    onSaveOrganizationSettings: async () => undefined,
    optimisticEmblemSrc: undefined,
    organization: {
      organizationId: 'org-1',
      alias: ORG,
      name: 'Liga San Juan',
      primaryLanguage: 'es',
      timezone: 'America/Argentina/San_Juan',
    },
    organizationAlias: ORG,
    orgLoadError: undefined,
    orgLoading: false,
    setEmblemCropSrc: () => undefined,
    settingsDraft: {
      name: 'Liga San Juan',
      primaryLanguage: 'es',
      timezone: 'America/Argentina/San_Juan',
    },
  },
} satisfies Meta<typeof OrganizationIdentitySection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loaded: Story = {};
export const Loading: Story = { args: { orgLoading: true, organization: undefined } };
export const LoadFailed: Story = {
  args: { orgLoadError: 'The organization could not be loaded.', organization: undefined },
};
export const ReadOnly: Story = { args: { canManage: false } };
export const IdentityEdited: Story = {
  args: {
    settingsDraft: {
      name: 'Liga San Juan Sur',
      primaryLanguage: 'pt',
      timezone: 'America/Argentina/Buenos_Aires',
    },
  },
};
