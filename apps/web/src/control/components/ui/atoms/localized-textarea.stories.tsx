import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { LocalizedTextarea } from './localized-textarea.js';
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
  title: 'Admin/Atoms/LocalizedTextarea',
  component: LocalizedTextarea,
  args: {
    id: 'localized-textarea-story',
    languages: LANGUAGES,
    activeLanguage: 'en',
    onActiveLanguageChange: () => undefined,
    value: '',
    onValueChange: () => undefined,
    rows: 4,
  },
  argTypes: { disabled: { control: 'boolean' }, invalid: { control: 'boolean' } },
} satisfies Meta<typeof LocalizedTextarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: { disabled: false, invalid: false },
  render: function Render(args) {
    const [values, setValues] = useState<Record<string, string>>({
      en: 'Rescheduled after the venue reported a pitch conflict.',
      es: 'Reprogramado tras un conflicto de cancha en la sede.',
    });
    const [active, setActive] = useState('en');
    const languages = LANGUAGES.map((language) => ({
      ...language,
      filled: Boolean(values[language.code]),
    }));
    return (
      <div style={{ maxWidth: '320px' }}>
        <LocalizedTextarea
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
              props: { activeLanguage: 'en', value: 'Rescheduled after a pitch conflict.' },
            },
            { label: 'non-English tab active', props: { activeLanguage: 'fr', value: '' } },
            { label: 'invalid', props: { activeLanguage: 'en', value: '', invalid: true } },
            {
              label: 'disabled',
              props: {
                activeLanguage: 'en',
                value: 'Rescheduled after a pitch conflict.',
                disabled: true,
              },
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
            <LocalizedTextarea
              id={`matrix-${cell.label}`}
              languages={LANGUAGES}
              onActiveLanguageChange={noop}
              onValueChange={noop}
              rows={3}
              {...cell.props}
            />
          </div>
        ))}
      </div>
    );
  },
};
