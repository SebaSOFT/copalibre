import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { Button, type ButtonVariant } from './button.js';
import { StoryMatrix } from '../story-matrix.js';
import { storyText } from '../story-text.js';

const VARIANTS: readonly ButtonVariant[] = [
  'primary',
  'secondary',
  'destructive',
  'destructive-outline',
];

const meta = {
  title: 'Admin/Atoms/Button',
  component: Button,
  argTypes: {
    variant: { control: 'select', options: VARIANTS },
    disabled: { control: 'boolean' },
    type: { control: 'select', options: ['button', 'submit', 'reset'] },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Label comes from the catalogue, not a literal, so the toolbar's language
 * selector changes the button's width the way a real translation does:
 * "Save" is four characters, "Speichern" nine, "保存" two.
 */
export const Playground: Story = {
  args: { variant: 'primary', disabled: false, type: 'button' },
  render: function Render(args) {
    const intl = useIntl();
    return <Button {...args}>{intl.formatMessage(storyText.save)}</Button>;
  },
};

/** Every variant against enabled and disabled, which is the whole of its API. */
export const Matrix: Story = {
  render: function Render() {
    const intl = useIntl();
    return (
      <StoryMatrix
        cells={VARIANTS.flatMap((variant) => [
          {
            label: variant,
            children: <Button variant={variant}>{intl.formatMessage(storyText.save)}</Button>,
          },
          {
            label: `${variant} · disabled`,
            children: (
              <Button disabled variant={variant}>
                {intl.formatMessage(storyText.save)}
              </Button>
            ),
          },
        ])}
      />
    );
  },
};

/**
 * The worst case a button has: a long action label at the narrowest declared
 * width. Select the 188px viewport to see whether it wraps or overflows.
 *
 * Two labels, because they fail differently. A multi-word label wraps on its
 * space and fits; a single compound has no break opportunity, and that is the
 * one that overflowed — this story only had the first kind, which is why the
 * defect survived until a modal's trigger happened to carry the second.
 */
export const LongLabel: Story = {
  render: function Render() {
    const intl = useIntl();
    return (
      <StoryMatrix
        minColumn="150px"
        cells={[
          {
            label: 'multi-word',
            children: (
              <Button variant="primary">{intl.formatMessage(storyText.savePromotionPlan)}</Button>
            ),
          },
          {
            label: 'single compound',
            children: (
              <Button variant="primary">{intl.formatMessage(storyText.settingsTitle)}</Button>
            ),
          },
        ]}
      />
    );
  },
};
