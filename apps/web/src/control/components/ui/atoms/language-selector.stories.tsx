import type { Meta, StoryObj } from '@storybook/react-vite';
import { LanguageSelector } from './language-selector.js';

const meta = {
  title: 'Admin/Atoms/LanguageSelector',
  component: LanguageSelector,
  argTypes: {
    currentLocale: {
      control: 'select',
      options: ['en', 'es', 'de', 'fr', 'it', 'pt', 'ru', 'zh'],
    },
  },
} satisfies Meta<typeof LanguageSelector>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: {
    currentLocale: 'es',
  },
};

export const English: Story = {
  args: {
    currentLocale: 'en',
  },
};

export const German: Story = {
  args: {
    currentLocale: 'de',
  },
};

/**
 * Every supported language side by side — 0223's reference scenario for the
 * locale control.
 *
 * Read the row at 188px: the control has to stay usable at the zoom floor in
 * the language whose own name is longest, not only in the one the reviewer
 * happens to be working in.
 */
export const EverySupportedLanguage: Story = {
  args: {},
  render: () => (
    <div style={{ display: 'grid', gap: 'var(--cl-space-3)', justifyItems: 'start' }}>
      {['en', 'es', 'de', 'fr', 'it', 'pt', 'ru', 'zh'].map((locale) => (
        <LanguageSelector currentLocale={locale} key={locale} />
      ))}
    </div>
  ),
};

/**
 * The paired interaction state: a control that cannot currently be changed.
 *
 * A selector with one option is not a choice, and offering it as one is how a
 * reader ends up clicking something that never had an alternative.
 */
export const SingleLanguageInstallation: Story = {
  args: { currentLocale: 'en', locales: ['en'] },
};
