import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { NavigationDrawer } from './navigation-drawer.js';
import { Button } from '../atoms/button.js';
import { storyText } from '../story-text.js';

const meta = {
  title: 'Admin/Organisms/NavigationDrawer',
  component: NavigationDrawer,
  args: { open: false, onOpenChange: () => undefined, title: '', children: null },
  argTypes: { open: { control: 'boolean' }, title: { control: 'text' } },
} satisfies Meta<typeof NavigationDrawer>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The drawer exists for viewports at or below 767px, so review it at the 767px,
 * 374px and 188px entries in the viewport selector rather than at desktop —
 * the width is what the organism is for.
 *
 * Its close button is labelled `"Cerrar menú"` in Spanish whatever the selected
 * language, which is the hardcoded string recorded against
 * `navigation-drawer.tsx` and owned by `0214`.
 */
export const Open: Story = {
  args: { open: true, title: '' },
  render: function Render(args) {
    const intl = useIntl();
    const [open, setOpen] = useState(args.open);
    return (
      <>
        <Button onClick={() => setOpen(true)} variant="secondary">
          {intl.formatMessage(storyText.tournaments)}
        </Button>
        <NavigationDrawer
          onOpenChange={setOpen}
          open={open}
          title={intl.formatMessage(storyText.rolesTitle)}
        >
          <nav style={{ display: 'grid', gap: 'var(--cl-space-3)' }}>
            <a className="cl-focusable" href="#">
              {intl.formatMessage(storyText.tournaments)}
            </a>
            <a className="cl-focusable" href="#">
              {intl.formatMessage(storyText.venuesAndOfficials)}
            </a>
            <a className="cl-focusable" href="#">
              {intl.formatMessage(storyText.rolesTitle)}
            </a>
            <a className="cl-focusable" href="#">
              {intl.formatMessage(storyText.settingsTitle)}
            </a>
          </nav>
        </NavigationDrawer>
      </>
    );
  },
};

/** Closed: the trigger alone, which is all the shell shows at desktop width. */
export const Closed: Story = {
  args: { open: false, title: '' },
  render: function Render(args) {
    const intl = useIntl();
    const [open, setOpen] = useState(args.open);
    return (
      <>
        <Button onClick={() => setOpen(true)} variant="secondary">
          {intl.formatMessage(storyText.tournaments)}
        </Button>
        <NavigationDrawer
          onOpenChange={setOpen}
          open={open}
          title={intl.formatMessage(storyText.rolesTitle)}
        >
          <span />
        </NavigationDrawer>
      </>
    );
  },
};
