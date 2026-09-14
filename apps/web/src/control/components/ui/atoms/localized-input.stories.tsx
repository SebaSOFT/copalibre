import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { LocalizedInput, type LocalizedInputLanguage } from './localized-input.js';

const LANGUAGES: readonly LocalizedInputLanguage[] = [
  { code: 'en', label: 'English', filled: true },
  { code: 'es', label: 'Español', filled: true },
  { code: 'fr', label: 'Français', filled: false },
  { code: 'pt', label: 'Português', filled: false },
];

const meta = {
  title: 'Admin/Atoms/LocalizedInput',
  component: LocalizedInput,
  args: {
    id: 'localized-input-story',
    languages: LANGUAGES,
    activeLanguage: 'en',
    onActiveLanguageChange: () => undefined,
    value: '',
    onValueChange: () => undefined,
  },
  argTypes: { disabled: { control: 'boolean' }, invalid: { control: 'boolean' } },
} satisfies Meta<typeof LocalizedInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: { disabled: false, invalid: false },
  render: function Render(args) {
    const [values, setValues] = useState<Record<string, string>>({
      en: 'Winter Cup',
      es: 'Copa de Invierno',
    });
    const [active, setActive] = useState('en');
    const languages = LANGUAGES.map((language) => ({
      ...language,
      filled: Boolean(values[language.code]),
    }));
    return (
      <LocalizedInput
        {...args}
        activeLanguage={active}
        languageTabsLabel="Choose language"
        languages={languages}
        onActiveLanguageChange={setActive}
        onValueChange={(value) => setValues((prev) => ({ ...prev, [active]: value }))}
        value={values[active] ?? ''}
      />
    );
  },
};

export const Matrix: Story = {
  render: function Render() {
    const noop = () => undefined;
    return (
      <div style={{ display: 'grid', gap: 'var(--cl-space-4)', maxWidth: '320px' }}>
        <div style={{ display: 'grid', gap: 'var(--cl-space-1)' }}>
          <span
            style={{
              color: 'var(--cl-text-secondary)',
              fontFamily: 'var(--cl-font-mono)',
              fontSize: 'var(--cl-font-size-xs)',
              textTransform: 'uppercase',
            }}
          >
            some languages filled
          </span>
          <LocalizedInput
            activeLanguage="en"
            id="matrix-mixed"
            languages={LANGUAGES}
            onActiveLanguageChange={noop}
            onValueChange={noop}
            value="Winter Cup"
          />
        </div>
        <div style={{ display: 'grid', gap: 'var(--cl-space-1)' }}>
          <span
            style={{
              color: 'var(--cl-text-secondary)',
              fontFamily: 'var(--cl-font-mono)',
              fontSize: 'var(--cl-font-size-xs)',
              textTransform: 'uppercase',
            }}
          >
            non-English tab active
          </span>
          <LocalizedInput
            activeLanguage="fr"
            id="matrix-active-fr"
            languages={LANGUAGES}
            onActiveLanguageChange={noop}
            onValueChange={noop}
            value=""
          />
        </div>
        <div style={{ display: 'grid', gap: 'var(--cl-space-1)' }}>
          <span
            style={{
              color: 'var(--cl-text-secondary)',
              fontFamily: 'var(--cl-font-mono)',
              fontSize: 'var(--cl-font-size-xs)',
              textTransform: 'uppercase',
            }}
          >
            invalid
          </span>
          <LocalizedInput
            activeLanguage="en"
            id="matrix-invalid"
            invalid
            languages={LANGUAGES}
            onActiveLanguageChange={noop}
            onValueChange={noop}
            value=""
          />
        </div>
        <div style={{ display: 'grid', gap: 'var(--cl-space-1)' }}>
          <span
            style={{
              color: 'var(--cl-text-secondary)',
              fontFamily: 'var(--cl-font-mono)',
              fontSize: 'var(--cl-font-size-xs)',
              textTransform: 'uppercase',
            }}
          >
            disabled
          </span>
          <LocalizedInput
            activeLanguage="en"
            disabled
            id="matrix-disabled"
            languages={LANGUAGES}
            onActiveLanguageChange={noop}
            onValueChange={noop}
            value="Winter Cup"
          />
        </div>
      </div>
    );
  },
};
