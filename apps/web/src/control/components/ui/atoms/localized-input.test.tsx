import { fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { LocalizedInput } from './localized-input.js';
import type { LocalizedFieldLanguage } from './localized-field-tabs.js';

const LANGUAGES: readonly LocalizedFieldLanguage[] = [
  { code: 'en', label: 'English', filled: true },
  { code: 'es', label: 'Español', filled: false },
];

describe('LocalizedInput', () => {
  it("renders the field showing the active language's own value", () => {
    render(
      <LocalizedInput
        activeLanguage="es"
        id="name"
        languages={LANGUAGES}
        onActiveLanguageChange={() => undefined}
        onValueChange={() => undefined}
        value="Copa"
      />,
    );
    expect(screen.getByDisplayValue('Copa')).not.toBeNull();
  });

  it("edits the active language's own value, not the others", () => {
    const onValueChange = jest.fn();
    render(
      <LocalizedInput
        activeLanguage="es"
        id="name"
        languages={LANGUAGES}
        onActiveLanguageChange={() => undefined}
        onValueChange={onValueChange}
        value="Copa"
      />,
    );
    const input = screen.getByDisplayValue('Copa');
    fireEvent.change(input, { target: { value: 'Copa de Invierno' } });
    expect(onValueChange).toHaveBeenCalledWith('Copa de Invierno');
  });

  it('switches the active language when a tab is clicked', () => {
    const onActiveLanguageChange = jest.fn();
    render(
      <LocalizedInput
        activeLanguage="en"
        id="name"
        languages={LANGUAGES}
        onActiveLanguageChange={onActiveLanguageChange}
        onValueChange={() => undefined}
        value=""
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Español' }));
    expect(onActiveLanguageChange).toHaveBeenCalledWith('es');
  });

  it('disables the field alongside the language tabs', () => {
    render(
      <LocalizedInput
        activeLanguage="en"
        disabled
        id="name"
        languages={LANGUAGES}
        onActiveLanguageChange={() => undefined}
        onValueChange={() => undefined}
        value=""
      />,
    );
    expect((screen.getByRole('tab', { name: 'English' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByDisplayValue('') as HTMLInputElement).disabled).toBe(true);
  });
});
