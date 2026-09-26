import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { LinkButton } from './link-button.js';
import type { ButtonVariant } from './button.js';
import { StoryMatrix } from '../story-matrix.js';
import { storyText } from '../story-text.js';

const VARIANTS: readonly ButtonVariant[] = [
  'primary',
  'secondary',
  'destructive',
  'destructive-outline',
];

const meta = {
  title: 'Admin/Atoms/LinkButton',
  component: LinkButton,
  argTypes: {
    variant: { control: 'select', options: VARIANTS },
  },
} satisfies Meta<typeof LinkButton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** `Button`'s look on a real `<a href>`, for a primary action that navigates. */
export const Playground: Story = {
  args: { variant: 'primary', href: '#' },
  render: function Render(args) {
    const intl = useIntl();
    return <LinkButton {...args}>{intl.formatMessage(storyText.save)}</LinkButton>;
  },
};

/** Every variant, side by side — the same set `Button`'s own Matrix covers. */
export const Matrix: Story = {
  render: function Render() {
    const intl = useIntl();
    return (
      <StoryMatrix
        cells={VARIANTS.map((variant) => ({
          label: variant,
          children: (
            <LinkButton href="#" variant={variant}>
              {intl.formatMessage(storyText.save)}
            </LinkButton>
          ),
        }))}
      />
    );
  },
};
