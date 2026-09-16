import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { LocalizedField } from './localized-field.js';
import { StoryMatrix } from '../story-matrix.js';
import { storyText } from '../story-text.js';
import type { LocalizedFieldLanguage } from '../atoms/localized-field-tabs.js';

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
  title: 'Admin/Molecules/LocalizedField',
  component: LocalizedField,
  args: {
    id: 'localized-field-story',
    label: 'Name',
    languages: LANGUAGES,
    activeLanguage: 'en',
    onActiveLanguageChange: () => undefined,
    value: '',
    onValueChange: () => undefined,
  },
  argTypes: {
    required: { control: 'boolean' },
    invalid: { control: 'boolean' },
    multiline: { control: 'boolean' },
  },
} satisfies Meta<typeof LocalizedField>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Two of these fields on the same wizard step share one `activeLanguage`
 * state, so switching the tab on either one moves both together — the
 * layout every localized wizard step now uses (see `ProfileBuilderWizard.tsx`
 * / `DescriptorBuilderWizard.tsx`, step "name").
 */
export const Playground: Story = {
  args: { required: true, invalid: false, multiline: false },
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
      <div style={{ maxWidth: '360px' }}>
        <LocalizedField
          {...args}
          activeLanguage={active}
          languageTabsLabel="Language"
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
  args: { id: '', label: '' },
  render: function Render() {
    const intl = useIntl();
    const label = intl.formatMessage(storyText.settingsTitle);
    return (
      <StoryMatrix
        minColumn="320px"
        cells={[
          {
            label: 'single-line, required',
            children: (
              <LocalizedField
                activeLanguage="en"
                id="lf-required"
                label={label}
                languageTabsLabel="Language"
                languages={LANGUAGES}
                onActiveLanguageChange={() => undefined}
                onValueChange={() => undefined}
                required
                value="Winter Cup"
              />
            ),
          },
          {
            label: 'single-line, invalid (English blank)',
            children: (
              <LocalizedField
                activeLanguage="en"
                id="lf-invalid"
                invalid
                label={label}
                languageTabsLabel="Language"
                languages={LANGUAGES.map((language) => ({ ...language, filled: false }))}
                onActiveLanguageChange={() => undefined}
                onValueChange={() => undefined}
                required
                value=""
              />
            ),
          },
          {
            label: 'multiline, optional, with help text',
            children: (
              <LocalizedField
                activeLanguage="en"
                helpText={intl.formatMessage(storyText.saved)}
                id="lf-multiline"
                label={label}
                languageTabsLabel="Language"
                languages={LANGUAGES}
                multiline
                onActiveLanguageChange={() => undefined}
                onValueChange={() => undefined}
                value="Fair play across every division."
              />
            ),
          },
          {
            label: 'non-English tab active',
            children: (
              <LocalizedField
                activeLanguage="fr"
                id="lf-french"
                label={label}
                languageTabsLabel="Language"
                languages={LANGUAGES}
                onActiveLanguageChange={() => undefined}
                onValueChange={() => undefined}
                value=""
              />
            ),
          },
        ]}
      />
    );
  },
};
