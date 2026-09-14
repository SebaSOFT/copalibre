import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { LocalizedInput } from './localized-input.js';
import type { LocalizedFieldLanguage } from './localized-field-tabs.js';

/** The platform's eight interface languages (packages/domain/src/i18n.ts SUPPORTED_LANGUAGES). */
const LANGUAGES: readonly LocalizedFieldLanguage[] = [
  { code: 'en', label: 'English', filled: true },
  { code: 'es', label: 'Español', filled: true },
  { code: 'fr', label: 'Français', filled: false },
  { code: 'pt', label: 'Português', filled: false },
  { code: 'it', label: 'Italiano', filled: false },
  { code: 'de', label: 'Deutsch', filled: false },
  { code: 'ru', label: 'Русский', filled: false },
  { code: 'zh', label: '中文', filled: false },
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
      <div style={{ maxWidth: '320px' }}>
        <LocalizedInput
          {...args}
          activeLanguage={active}
          languageTabsLabel="Choose language"
          languages={languages}
          onActiveLanguageChange={setActive}
          onValueChange={(value) => setValues((prev) => ({ ...prev, [active]: value }))}
          value={values[active] ?? ''}
        />
      </div>
    );
  },
};

export const Matrix: Story = {
  render: function Render() {
    const noop = () => undefined;
    return (
      <div style={{ display: 'grid', gap: 'var(--cl-space-5)', maxWidth: '320px' }}>
        {(
          [
            {
              label: 'two languages filled, all eight tabs',
              props: { activeLanguage: 'en', value: 'Winter Cup' },
            },
            {
              label: 'non-English tab active',
              props: { activeLanguage: 'fr', value: '' },
            },
            {
              label: 'invalid',
              props: { activeLanguage: 'en', value: '', invalid: true },
            },
            {
              label: 'disabled',
              props: { activeLanguage: 'en', value: 'Winter Cup', disabled: true },
            },
          ] as const
        ).map((cell) => (
          <div key={cell.label} style={{ display: 'grid', gap: 'var(--cl-space-1)' }}>
            <span
              style={{
                color: 'var(--cl-text-secondary)',
                fontFamily: 'var(--cl-font-mono)',
                fontSize: 'var(--cl-font-size-xs)',
                textTransform: 'uppercase',
              }}
            >
              {cell.label}
            </span>
            <LocalizedInput
              id={`matrix-${cell.label}`}
              languages={LANGUAGES}
              onActiveLanguageChange={noop}
              onValueChange={noop}
              {...cell.props}
            />
          </div>
        ))}
      </div>
    );
  },
};
