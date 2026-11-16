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
    isOrganizationPage: true,
    loading: false,
    newToken: null,
    onChangeSettings: () => undefined,
    onCreatePat: async () => true,
    onConfirmRevokePat: async () => undefined,
    onDeleteUnreferencedObject: async () => undefined,
    onRevokePat: async () => ({ reversible: true, tokens: 1 }),
    onPreviewStatisticsRebuild: async () => ({
      dryRun: true,
      organizationAlias: ORG,
      matches: 0,
      figures: 0,
    }),
    onResetSettings: () => undefined,
    onRunStatisticsRebuild: async () => true,
    onSaveOrganizationSettings: async () => undefined,
    onUploadOrganizationEmblem: async () => undefined,
    organization: {
      organizationId: 'org-1',
      alias: ORG,
      name: 'Liga San Juan',
      primaryLanguage: 'es',
      timezone: 'America/Argentina/San_Juan',
    },
    organizationAlias: ORG,
    patScopes: [],
    orgLoadError: undefined,
    orgLoading: false,
    rebuildResult: undefined,
    role: 'admin',
    settingsDraft: {
      name: 'Liga San Juan',
      primaryLanguage: 'es',
      timezone: 'America/Argentina/San_Juan',
    },
    storageError: undefined,
    storageLoading: false,
    storageUsage: { totalBytes: 1024 * 1024 * 45, objectCount: 12 },
    tokens: [],
    unreferencedObjects: [],
  },
} satisfies Meta<typeof PreferencesTemplate>;
export default meta;
type Story = StoryObj<typeof meta>;
/** The personal page: the theme control and personal access tokens, and nothing of the organization. */
export const PersonalPreferences: Story = {
  args: { isOrganizationPage: false, organizationAlias: undefined },
};
export const WithOrganization: Story = {};
/** A role without settings authority sees the details read-only and each withheld section names who can. */
export const WithoutSettingsAuthority: Story = { args: { role: 'referee' } };
export const WithUnreferencedFiles: Story = {
  args: {
    unreferencedObjects: [
      {
        objectId: 'object-1',
        contentType: 'image/png',
        sizeBytes: 31_457,
        createdAt: '2026-11-02T14:30:00.000Z',
      },
    ],
  },
};
export const IdentityEdited: Story = {
  args: {
    settingsDraft: {
      name: 'Liga San Juan Sur',
      primaryLanguage: 'pt',
      timezone: 'America/Argentina/Buenos_Aires',
    },
  },
};
export const LightL3: Story = { globals: { theme: 'light' } };
export const OrganizationSectionsInPriorityOrder: Story = {
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
