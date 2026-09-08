import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { Modal } from './modal.js';
import { Button } from '../atoms/button.js';
import { FormField } from '../molecules/form-field.js';
import { Input } from '../atoms/input.js';
import { storyText } from '../story-text.js';

const meta = {
  title: 'Admin/Organisms/Modal',
  component: Modal,
  args: { open: false, onOpenChange: () => undefined, title: '', children: null },
  argTypes: { open: { control: 'boolean' } },
} satisfies Meta<typeof Modal>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Open by default: an overlay is the archetypal state that costs a seeded
 * tournament and three clicks to reach in the running application.
 */
export const Open: Story = {
  args: { open: true, title: '' },
  render: function Render(args) {
    const intl = useIntl();
    const [open, setOpen] = useState(args.open);
    return (
      <>
        <Button onClick={() => setOpen(true)} variant="secondary">
          {intl.formatMessage(storyText.settingsTitle)}
        </Button>
        <Modal
          onOpenChange={setOpen}
          open={open}
          title={intl.formatMessage(storyText.settingsTitle)}
        >
          {intl.formatMessage(storyText.saved)}
        </Modal>
      </>
    );
  },
};

/** Description and footer filled — every optional slot the organism has. */
export const WithDescriptionAndFooter: Story = {
  args: { open: true, title: '' },
  render: function Render(args) {
    const intl = useIntl();
    const [open, setOpen] = useState(args.open);
    return (
      <Modal
        description={intl.formatMessage(storyText.saved)}
        footer={
          <>
            <Button onClick={() => setOpen(false)} variant="secondary">
              {intl.formatMessage(storyText.cancel)}
            </Button>
            <Button variant="primary">{intl.formatMessage(storyText.save)}</Button>
          </>
        }
        onOpenChange={setOpen}
        open={open}
        title={intl.formatMessage(storyText.settingsTitle)}
      >
        <FormField id="modal-field" label={intl.formatMessage(storyText.rolesTitle)}>
          <Input id="modal-field" />
        </FormField>
      </Modal>
    );
  },
};

/**
 * The modal's own close control is labelled `"Close"` in English regardless of
 * the selected language — the one hardcoded string
 * `check-ui-text-catalogue-coverage.mjs` records against `modal.tsx`, and
 * `0214`'s work. Visible here rather than hidden.
 */
export const LongContentAtNarrowWidth: Story = {
  args: { open: true, title: '' },
  render: function Render(args) {
    const intl = useIntl();
    const [open, setOpen] = useState(args.open);
    return (
      <Modal
        footer={
          <Button variant="primary">{intl.formatMessage(storyText.savePromotionPlan)}</Button>
        }
        onOpenChange={setOpen}
        open={open}
        title={intl.formatMessage(storyText.platformTitle)}
      >
        {Array.from({ length: 6 }, (_, index) => (
          <p key={index}>{intl.formatMessage(storyText.saved)}</p>
        ))}
      </Modal>
    );
  },
};
