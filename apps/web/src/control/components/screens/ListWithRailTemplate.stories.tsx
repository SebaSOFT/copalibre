import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { Button } from '../ui/atoms/button.js';
import { Card } from '../ui/atoms/card.js';
import { Form } from '../ui/atoms/form.js';
import { Input } from '../ui/atoms/input.js';
import { Field } from '../ui/molecules/field.js';
import { storyText } from '../ui/story-text.js';
import { ListWithRailTemplate } from './ListWithRailTemplate.js';

const meta = {
  title: 'Admin/Screens/ListWithRailTemplate',
  component: ListWithRailTemplate,
} satisfies Meta<typeof ListWithRailTemplate>;

export default meta;
type Story = StoryObj<typeof meta>;

export const VenueListWithForm: Story = {
  args: { listLabel: '', listing: null, rail: null, railLabel: '' },
  render: function Render() {
    const intl = useIntl();
    const listLabel = intl.formatMessage(storyText.tournaments);
    const railLabel = intl.formatMessage(storyText.settingsTitle);

    return (
      <ListWithRailTemplate
        breadcrumbs={[
          { label: intl.formatMessage(storyText.platformTitle), href: '#' },
          { label: listLabel, current: true },
        ]}
        description={listLabel}
        listLabel={listLabel}
        listing={
          <Card aria-label={listLabel}>
            <ul>
              <li>{intl.formatMessage(storyText.tournaments)}</li>
              <li>{intl.formatMessage(storyText.settingsTitle)}</li>
              <li>{intl.formatMessage(storyText.platformTitle)}</li>
            </ul>
          </Card>
        }
        rail={
          <Card aria-label={railLabel}>
            <Form onSubmit={(event) => event.preventDefault()}>
              <Field id="venue-name" label={railLabel}>
                <Input defaultValue={listLabel} id="venue-name" />
              </Field>
              <Button>{intl.formatMessage(storyText.save)}</Button>
            </Form>
          </Card>
        }
        railLabel={railLabel}
        title={listLabel}
      />
    );
  },
};
