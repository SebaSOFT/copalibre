import type { Meta, StoryObj } from '@storybook/react-vite';
import { LanguageSwitcher } from './LanguageSwitcher.js';
import { SUPPORTED_LANGUAGES } from '../../lib/language-preference.js';

const meta = {
  title: 'Admin/i18n/LanguageSwitcher',
  component: LanguageSwitcher,
  args: {
    value: 'en',
    onChange: () => undefined,
  },
} satisfies Meta<typeof LanguageSwitcher>;
export default meta;
type Story = StoryObj<typeof meta>;
export const English: Story = {};
export const Spanish: Story = { args: { value: 'es' } };
export const French: Story = { args: { value: 'fr' } };

/**
 * Every supported language side by side — the reference scenario the
 * deleted LanguageSelector atom's `EverySupportedLanguage` story covered
 * (openspec 0225 task 4.3a/4.4).
 *
 * Read the row at 188px: the control has to stay usable at the zoom floor in
 * the language whose own name is longest, not only in the one the reviewer
 * happens to be working in.
 */
export const EverySupportedLanguage: Story = {
  args: {},
  render: () => (
    <div style={{ display: 'grid', gap: 'var(--cl-space-3)', justifyItems: 'start' }}>
      {SUPPORTED_LANGUAGES.map((language) => (
        <LanguageSwitcher key={language} onChange={() => undefined} value={language} />
      ))}
    </div>
  ),
};
