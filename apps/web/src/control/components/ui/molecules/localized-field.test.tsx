import { fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { LocalizedField } from './localized-field.js';
import type { LocalizedFieldLanguage } from '../atoms/localized-field-tabs.js';

const LANGUAGES: readonly LocalizedFieldLanguage[] = [
  { code: 'en', label: 'English', filled: true },
  { code: 'es', label: 'Español', filled: false },
];

describe('LocalizedField', () => {
  it('renders the label and, by default, an LocalizedInput (single-line) control', () => {
    render(
      <LocalizedField
        activeLanguage="en"
        id="name"
        label="Name"
        languages={LANGUAGES}
        onActiveLanguageChange={() => undefined}
        onValueChange={() => undefined}
        value="Winter Cup"
      />,
    );
    expect(screen.getByText('Name')).not.toBeNull();
    expect(screen.getByDisplayValue('Winter Cup').tagName).toBe('INPUT');
  });

  it('renders a Textarea control when multiline', () => {
    render(
      <LocalizedField
        activeLanguage="en"
        id="description"
        label="Description"
        languages={LANGUAGES}
        multiline
        onActiveLanguageChange={() => undefined}
        onValueChange={() => undefined}
        value="Fair play"
      />,
    );
    expect(screen.getByDisplayValue('Fair play').tagName).toBe('TEXTAREA');
  });

  it('shows the required indicator via Field, not a hand-built label suffix', () => {
    render(
      <LocalizedField
        activeLanguage="en"
        id="name"
        label="Name"
        languages={LANGUAGES}
        onActiveLanguageChange={() => undefined}
        onValueChange={() => undefined}
        required
        value=""
      />,
    );
    expect(screen.getByText('*')).not.toBeNull();
  });

  it('forwards invalid to the underlying control', () => {
    render(
      <LocalizedField
        activeLanguage="en"
        id="name"
        invalid
        label="Name"
        languages={LANGUAGES}
        onActiveLanguageChange={() => undefined}
        onValueChange={() => undefined}
        value=""
      />,
    );
    expect(screen.getByDisplayValue('').getAttribute('aria-invalid')).toBe('true');
  });

  it('switches the active language when a tab is clicked', () => {
    const onActiveLanguageChange = jest.fn();
    render(
      <LocalizedField
        activeLanguage="en"
        id="name"
        label="Name"
        languages={LANGUAGES}
        onActiveLanguageChange={onActiveLanguageChange}
        onValueChange={() => undefined}
        value=""
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Español' }));
    expect(onActiveLanguageChange).toHaveBeenCalledWith('es');
  });
});
