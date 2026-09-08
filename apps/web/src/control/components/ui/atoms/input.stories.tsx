import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { Input } from './input.js';
import { StoryMatrix } from '../story-matrix.js';
import { storyText } from '../story-text.js';

const meta = {
  title: 'Admin/Atoms/Input',
  component: Input,
  argTypes: {
    invalid: { control: 'boolean' },
    disabled: { control: 'boolean' },
    type: { control: 'select', options: ['text', 'email', 'number', 'date', 'password'] },
  },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: { invalid: false, disabled: false, type: 'text' },
  render: function Render(args) {
    const intl = useIntl();
    return <Input {...args} aria-label={intl.formatMessage(storyText.rolesTitle)} />;
  },
};

/** The three states the atom encodes, which are one modifier class apart. */
export const Matrix: Story = {
  render: function Render() {
    const intl = useIntl();
    const value = intl.formatMessage(storyText.tournaments);
    return (
      <StoryMatrix
        cells={[
          {
            label: 'default',
            children: <Input aria-label="default" defaultValue={value} />,
          },
          {
            label: 'invalid',
            children: <Input aria-label="invalid" defaultValue={value} invalid />,
          },
          {
            label: 'disabled',
            children: <Input aria-label="disabled" defaultValue={value} disabled />,
          },
          {
            label: 'empty with placeholder',
            children: <Input aria-label="empty" placeholder={value} />,
          },
        ]}
      />
    );
  },
};
