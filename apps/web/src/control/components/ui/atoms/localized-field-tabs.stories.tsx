import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { LocalizedFieldTabs, type LocalizedFieldLanguage } from './localized-field-tabs.js';

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
  title: 'Admin/Atoms/LocalizedFieldTabs',
  component: LocalizedFieldTabs,
  args: {
    controls: 'localized-field-tabs-story',
    languages: LANGUAGES,
    activeLanguage: 'en',
    onActiveLanguageChange: () => undefined,
  },
  argTypes: { disabled: { control: 'boolean' } },
} satisfies Meta<typeof LocalizedFieldTabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: function Render(args) {
    const [active, setActive] = useState('en');
    return <LocalizedFieldTabs {...args} activeLanguage={active} onActiveLanguageChange={setActive} />;
  },
};

export const Matrix: Story = {
  render: function Render() {
    const noop = () => undefined;
    return (
      <div style={{ display: 'grid', gap: 'var(--cl-space-4)' }}>
        <LocalizedFieldTabs
          activeLanguage="en"
          controls="matrix-default"
          languages={LANGUAGES}
          onActiveLanguageChange={noop}
        />
        <LocalizedFieldTabs
          activeLanguage="zh"
          controls="matrix-last-active"
          languages={LANGUAGES}
          onActiveLanguageChange={noop}
        />
        <LocalizedFieldTabs
          activeLanguage="en"
          controls="matrix-disabled"
          disabled
          languages={LANGUAGES}
          onActiveLanguageChange={noop}
        />
      </div>
    );
  },
};
