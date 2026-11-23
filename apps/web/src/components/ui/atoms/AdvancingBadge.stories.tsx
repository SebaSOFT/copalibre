import type { Meta, StoryObj } from '@storybook/react-vite';
import { publicIntl } from '../../../lib/i18n/public-intl.js';
import { messages } from '../../../lib/i18n/public-messages.en.js';
import type { SupportedLanguage } from '../../../lib/language-preference.js';
import { AdvancingBadge } from './AdvancingBadge.js';

const meta = {
  title: 'Public/AdvancingBadge',
  component: AdvancingBadge,
  args: {
    label: publicIntl('en').formatMessage(messages.bracketAdvances),
  },
  argTypes: {
    label: { control: 'text' },
  },
} satisfies Meta<typeof AdvancingBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args, context) => {
    const locale = (context.globals.locale ?? 'en') as SupportedLanguage;
    const label = publicIntl(locale).formatMessage(messages.bracketAdvances);
    return <AdvancingBadge {...args} label={label} />;
  },
};

export const Matrix: Story = {
  render: () => {
    const locales: readonly SupportedLanguage[] = ['es', 'en', 'fr', 'pt', 'it', 'de', 'ru', 'zh'];
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--cl-space-2)' }}>
        {locales.map((locale) => (
          <AdvancingBadge
            key={locale}
            label={publicIntl(locale).formatMessage(messages.bracketAdvances)}
          />
        ))}
      </div>
    );
  },
};
