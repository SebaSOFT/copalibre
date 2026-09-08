import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { TableToolbar } from './table-toolbar.js';
import { Button } from '../atoms/button.js';
import { Input } from '../atoms/input.js';
import { storyText } from '../story-text.js';

const meta = {
  title: 'Admin/Molecules/TableToolbar',
  component: TableToolbar,
  argTypes: { title: { control: 'text' } },
} satisfies Meta<typeof TableToolbar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every slot filled — the shape a listing screen's header actually has. */
export const Full: Story = {
  render: function Render() {
    const intl = useIntl();
    return (
      <TableToolbar
        actions={<Button variant="primary">{intl.formatMessage(storyText.save)}</Button>}
        title={intl.formatMessage(storyText.rolesTitle)}
      >
        <Input
          aria-label={intl.formatMessage(storyText.tournaments)}
          placeholder={intl.formatMessage(storyText.tournaments)}
        />
      </TableToolbar>
    );
  },
};

/** Title alone — every slot is optional, and a bare toolbar must still sit right. */
export const TitleOnly: Story = {
  render: function Render() {
    const intl = useIntl();
    return <TableToolbar title={intl.formatMessage(storyText.settingsTitle)} />;
  },
};

/**
 * The toolbar wraps rather than overflows. At the 188px viewport its three
 * slots stack, which is the behaviour worth confirming after any change to it.
 */
export const Crowded: Story = {
  render: function Render() {
    const intl = useIntl();
    return (
      <TableToolbar
        actions={
          <>
            <Button variant="secondary">{intl.formatMessage(storyText.cancel)}</Button>
            <Button variant="primary">{intl.formatMessage(storyText.savePromotionPlan)}</Button>
          </>
        }
        title={intl.formatMessage(storyText.platformTitle)}
      >
        <Input aria-label="filter" placeholder={intl.formatMessage(storyText.venuesAndOfficials)} />
      </TableToolbar>
    );
  },
};
