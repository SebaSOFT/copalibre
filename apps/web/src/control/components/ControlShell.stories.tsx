import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import { ControlShell } from './ControlShell.js';
import { writeStoredLanguagePreference } from '../../lib/language-preference.js';
import { isSupportedLanguage } from '@copalibre/domain';
import { useIntl } from 'react-intl';
import type { ControlApiClient } from '../lib/api-client.js';
import { ORG, ids, storyClient } from './screen-story-fixtures.js';
const client = storyClient<ControlApiClient>({
  listMyOrganizations: async () => [
    {
      organizationId: ids.organization,
      organizationAlias: ORG,
      organizationName: 'Liga San Juan',
      role: 'admin',
    },
  ],
});
const meta = {
  title: 'Admin/Screens/ControlShell',
  component: ControlShell,
  args: { organizationAlias: ORG, helpPath: 'overview', client, children: null },
  render: function Render(args) {
    const intl = useIntl();
    if (isSupportedLanguage(intl.locale)) writeStoredLanguagePreference(intl.locale);
    return <ControlShell key={intl.locale} {...args} />;
  },
} satisfies Meta<typeof ControlShell>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const DrawerOpen: Story = {
  globals: { viewport: { value: 'narrowPhone', isRotated: false } },
  play: async ({ canvasElement }) => {
    const trigger = canvasElement.querySelector<HTMLButtonElement>('[aria-expanded]');
    if (trigger && getComputedStyle(trigger).display !== 'none') await userEvent.click(trigger);
    // Desktop keeps its permanent navigation; narrow canvases exercise the drawer.
    await within(canvasElement).findByRole('banner');
  },
};
