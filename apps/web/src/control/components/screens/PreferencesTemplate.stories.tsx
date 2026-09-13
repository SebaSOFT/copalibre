import type { Meta, StoryObj } from '@storybook/react-vite';
import { PreferencesTemplate } from '../screens/PreferencesTemplate.js';
import type { ControlApiClient } from '../../lib/api-client.js';
import { storyClient, ORG } from '../screen-story-fixtures.js';

const client = storyClient<ControlApiClient>({
  getOrganization: undefined,
  getStorageUsage: undefined,
  listUnreferencedObjects: undefined,
  updateOrganizationSettings: undefined,
  uploadOrganizationEmblem: undefined,
  rebuildStatistics: undefined,
});

const meta = {
  title: 'Admin/Screens/PreferencesTemplate',
  component: PreferencesTemplate,
  args: {
    api: client,
    loading: false,
    newToken: null,
    onChangeOrgName: () => undefined,
    onCreatePat: async () => true,
    onDeleteUnreferencedObject: async () => undefined,
    onRevokePat: async () => undefined,
    onRunStatisticsRebuild: async () => undefined,
    onSaveOrganizationName: async () => undefined,
    onUploadOrganizationEmblem: async () => undefined,
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
    orgName: 'Liga San Juan',
    rebuildResult: undefined,
    storageError: undefined,
    storageLoading: false,
    storageUsage: { totalBytes: 1024 * 1024 * 45, objectCount: 12 },
    tokens: [],
    unreferencedObjects: [],
  },
} satisfies Meta<typeof PreferencesTemplate>;
export default meta;
type Story = StoryObj<typeof meta>;
export const NoOrganization: Story = { args: { organizationAlias: undefined } };
export const WithOrganization: Story = {};
export const WithTokens: Story = {
  args: {
    tokens: [
      {
        tokenId: 'token-1',
        label: 'CI token',
        scopes: [],
        revoked: false,
        expiresAt: '2027-01-01T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ],
  },
};
