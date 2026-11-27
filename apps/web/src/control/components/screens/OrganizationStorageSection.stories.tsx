import type { Meta, StoryObj } from '@storybook/react-vite';
import { OrganizationStorageSection } from './OrganizationStorageSection.js';
import { ORG } from '../screen-story-fixtures.js';

const meta = {
  title: 'Admin/Screens/Preferences sections/Organization storage',
  component: OrganizationStorageSection,
  args: {
    canManage: true,
    onDeleteUnreferencedObject: async () => undefined,
    organizationAlias: ORG,
    storageError: undefined,
    storageLoading: false,
    storageUsage: { totalBytes: 1024 * 1024 * 45, objectCount: 12 },
    unreferencedObjects: [],
  },
} satisfies Meta<typeof OrganizationStorageSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loaded: Story = {};
export const Loading: Story = { args: { storageLoading: true, storageUsage: undefined } };
export const LoadFailed: Story = {
  args: { storageError: 'Storage usage could not be loaded.', storageUsage: undefined },
};
export const ReadOnly: Story = { args: { canManage: false } };
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
