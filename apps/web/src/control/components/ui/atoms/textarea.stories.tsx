import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { Textarea } from './textarea.js';
import { StoryMatrix } from '../story-matrix.js';
import { storyText } from '../story-text.js';

const meta = {
  title: 'Admin/Atoms/Textarea',
  component: Textarea,
  argTypes: {
    invalid: { control: 'boolean' },
    disabled: { control: 'boolean' },
    rows: { control: { type: 'number', min: 1, max: 12 } },
  },
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: { invalid: false, disabled: false, rows: 4 },
  render: function Render(args) {
    const intl = useIntl();
    return <Textarea {...args} aria-label={intl.formatMessage(storyText.rolesTitle)} />;
  },
};

export const Matrix: Story = {
  render: function Render() {
    const intl = useIntl();
    const value = intl.formatMessage(storyText.saved);
    return (
      <StoryMatrix
        minColumn="240px"
        cells={[
          { label: 'default', children: <Textarea aria-label="default" defaultValue={value} /> },
          {
            label: 'invalid',
            children: <Textarea aria-label="invalid" defaultValue={value} invalid />,
          },
          {
            label: 'disabled',
            children: <Textarea aria-label="disabled" defaultValue={value} disabled />,
          },
        ]}
      />
    );
  },
};
