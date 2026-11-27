import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { Button } from '../ui/atoms/button.js';
import { Card } from '../ui/atoms/card.js';
import { Form } from '../ui/atoms/form.js';
import { Input } from '../ui/atoms/input.js';
import { Field } from '../ui/molecules/field.js';
import { storyText } from '../ui/story-text.js';
import { PageHeaderTemplate } from './PageHeaderTemplate.js';

const meta = {
  title: 'Admin/Screens/PageHeaderTemplate',
  component: PageHeaderTemplate,
} satisfies Meta<typeof PageHeaderTemplate>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SettingsForm: Story = {
  args: { children: null },
  render: function Render() {
    const intl = useIntl();
    const settingsTitle = intl.formatMessage(storyText.settingsTitle);

    return (
      <PageHeaderTemplate
        actions={<Button>{intl.formatMessage(storyText.save)}</Button>}
        breadcrumbLabel={settingsTitle}
        breadcrumbs={[
          { label: intl.formatMessage(storyText.platformTitle), href: '#' },
          { label: settingsTitle, current: true },
        ]}
        description={settingsTitle}
        title={settingsTitle}
      >
        <Card>
          <Form onSubmit={(event) => event.preventDefault()}>
            <Field id="setting-name" label={settingsTitle}>
              <Input defaultValue={intl.formatMessage(storyText.tournaments)} id="setting-name" />
            </Field>
          </Form>
        </Card>
      </PageHeaderTemplate>
    );
  },
};
