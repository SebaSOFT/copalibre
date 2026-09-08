import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { FormScreenTemplate } from './form-screen-template.js';
import { FormField } from '../molecules/form-field.js';
import { Input } from '../atoms/input.js';
import { Textarea } from '../atoms/textarea.js';
import { Button } from '../atoms/button.js';
import { storyText } from '../story-text.js';

const meta = {
  title: 'Admin/Templates/FormScreenTemplate',
  component: FormScreenTemplate,
  args: { title: '', sections: [], footer: null },
} satisfies Meta<typeof FormScreenTemplate>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Two grouped sections and a footer action bar — the template's whole shape. */
export const Populated: Story = {
  render: function Render() {
    const intl = useIntl();
    return (
      <FormScreenTemplate
        breadcrumb={intl.formatMessage(storyText.platformTitle)}
        footer={
          <>
            <Button variant="secondary">{intl.formatMessage(storyText.cancel)}</Button>
            <Button type="submit" variant="primary">
              {intl.formatMessage(storyText.save)}
            </Button>
          </>
        }
        onSubmit={(event) => event.preventDefault()}
        sections={[
          {
            key: 'identity',
            heading: intl.formatMessage(storyText.rolesTitle),
            fields: (
              <>
                <FormField id="fs-name" label={intl.formatMessage(storyText.settingsTitle)}>
                  <Input id="fs-name" />
                </FormField>
                <FormField
                  helpText={intl.formatMessage(storyText.saved)}
                  id="fs-alias"
                  label={intl.formatMessage(storyText.tournaments)}
                >
                  <Input id="fs-alias" />
                </FormField>
              </>
            ),
          },
          {
            key: 'detail',
            heading: intl.formatMessage(storyText.venuesAndOfficials),
            fields: (
              <FormField
                errorText={intl.formatMessage(storyText.empty)}
                id="fs-notes"
                label={intl.formatMessage(storyText.reportTitle)}
              >
                <Textarea aria-describedby="fs-notes-error" id="fs-notes" invalid rows={4} />
              </FormField>
            ),
          },
        ]}
        title={intl.formatMessage(storyText.settingsTitle)}
      />
    );
  },
};

/** One unheaded section: the template does not require a heading per group. */
export const SingleSection: Story = {
  render: function Render() {
    const intl = useIntl();
    return (
      <FormScreenTemplate
        footer={<Button variant="primary">{intl.formatMessage(storyText.save)}</Button>}
        sections={[
          {
            key: 'only',
            fields: (
              <FormField id="fs-only" label={intl.formatMessage(storyText.settingsTitle)}>
                <Input id="fs-only" />
              </FormField>
            ),
          },
        ]}
        title={intl.formatMessage(storyText.platformTitle)}
      />
    );
  },
};
