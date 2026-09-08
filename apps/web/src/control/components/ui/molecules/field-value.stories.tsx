import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { FieldValue } from './field-value.js';
import { StoryMatrix } from '../story-matrix.js';
import { storyText } from '../story-text.js';

const meta = {
  title: 'Admin/Molecules/FieldValue',
  component: FieldValue,
  argTypes: { label: { control: 'text' }, value: { control: 'text' } },
} satisfies Meta<typeof FieldValue>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: { label: 'Nationality', value: 'Argentina' },
};

/**
 * The pair's label comes from a catalogue and its value from data, so a long
 * translation lengthens one half only — which is exactly when the two collide.
 */
export const Matrix: Story = {
  args: { label: '', value: '' },
  render: function Render() {
    const intl = useIntl();
    return (
      <StoryMatrix
        minColumn="240px"
        cells={[
          {
            label: 'short label',
            children: <FieldValue label={intl.formatMessage(storyText.save)} value="Argentina" />,
          },
          {
            label: 'long label',
            children: (
              <FieldValue
                label={intl.formatMessage(storyText.savePromotionPlan)}
                value="Argentina"
              />
            ),
          },
          {
            label: 'long value',
            children: (
              <FieldValue
                label={intl.formatMessage(storyText.settingsTitle)}
                value="Club Atlético Independiente de Avellaneda"
              />
            ),
          },
          {
            label: 'empty value',
            children: <FieldValue label={intl.formatMessage(storyText.rolesTitle)} value="" />,
          },
        ]}
      />
    );
  },
};
