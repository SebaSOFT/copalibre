import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import { ConsequenceDialog } from './consequence-dialog.js';
import { Button } from '../atoms/button.js';
import { messages } from '../../../i18n/messages.en.js';
import { storyText } from '../story-text.js';

const meta = {
  title: 'Admin/Organisms/ConsequenceDialog',
  component: ConsequenceDialog,
  args: {
    open: true,
    onOpenChange: () => undefined,
    title: '',
    description: '',
    counts: [],
    confirmLabel: '',
    cancelLabel: '',
    closeLabel: '',
    typeToConfirm: 'CopaLibre Demo',
    typeToConfirmLabel: '',
    onConfirm: () => undefined,
  },
} satisfies Meta<typeof ConsequenceDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ScheduleWithPlacements: Story = {
  render: function Render(args) {
    const intl = useIntl();
    const [open, setOpen] = useState(args.open);
    return (
      <>
        <Button onClick={() => setOpen(true)} type="button" variant="secondary">
          {intl.formatMessage(storyText.settingsTitle)}
        </Button>
        <ConsequenceDialog
          {...args}
          cancelLabel={intl.formatMessage(storyText.cancel)}
          closeLabel={intl.formatMessage(storyText.cancel)}
          confirmLabel={intl.formatMessage(messages.resourceManagementDeleteSchedule)}
          counts={[
            {
              label: intl.formatMessage(messages.consequenceDialogSlotsDeleted),
              value: 4333,
            },
            {
              label: intl.formatMessage(messages.consequenceDialogMatchesUnassigned),
              value: 36,
            },
          ]}
          description={intl.formatMessage(messages.consequenceDialogSummary)}
          onOpenChange={setOpen}
          open={open}
          title={intl.formatMessage(messages.resourceManagementDeleteSchedule)}
          typeToConfirmLabel={intl.formatMessage(messages.consequenceDialogTypeObjectName)}
        />
      </>
    );
  },
};
