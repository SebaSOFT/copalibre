import type { Meta, StoryObj } from '@storybook/react-vite';
import { PlatformAdministrationTemplate } from '../screens/PlatformAdministrationTemplate.js';
import type { ControlApiClient } from '../../lib/api-client.js';
import { storyClient } from '../screen-story-fixtures.js';

const client = storyClient<ControlApiClient>({});

const meta = {
  title: 'Admin/Screens/PlatformAdministrationTemplate',
  component: PlatformAdministrationTemplate,
  args: {
    api: client,
    authoringBusy: false,
    authoringFailures: [],
    busy: undefined,
    disciplineOptions: [],
    loadingModules: false,
    loadingSuperAdmins: false,
    modules: [],
    onAuthorModule: async () => true,
    onCheckOutdated: async () => undefined,
    onContributeModule: async () => undefined,
    onCreateOrganization: async () => 'liga-san-juan',
    onCreateSuperAdmin: async () => true,
    onInstallModule: async () => true,
    onInviteAdmin: async () => true,
    onRemoveModule: async () => undefined,
    onRemoveSuperAdmin: async () => undefined,
    onVerifyModule: async () => undefined,
    outdated: [],
    superAdmins: [],
    verification: [],
  },
} satisfies Meta<typeof PlatformAdministrationTemplate>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Empty: Story = {};
export const WithModules: Story = {
  args: {
    modules: [
      {
        moduleId: 'mod-1',
        kind: 'discipline',
        alias: 'futsal',
        version: '1.2.0',
        sourceKind: 'curated',
        attributionAuthor: 'CopaLibre',
      },
    ],
  },
};
