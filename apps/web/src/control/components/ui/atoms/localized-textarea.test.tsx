import { fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { LocalizedTextarea } from './localized-textarea.js';
import type { LocalizedFieldLanguage } from './localized-field-tabs.js';

const LANGUAGES: readonly LocalizedFieldLanguage[] = [
  { code: 'en', label: 'English', filled: true },
  { code: 'es', label: 'Español', filled: false },
];

describe('LocalizedTextarea', () => {
  it("renders the field showing the active language's own value", () => {
    render(
      <LocalizedTextarea
        activeLanguage="es"
        id="notes"
        languages={LANGUAGES}
        onActiveLanguageChange={() => undefined}
        onValueChange={() => undefined}
        value="Reprogramado"
      />,
    );
    expect(screen.getByDisplayValue('Reprogramado')).not.toBeNull();
  });

  it("edits the active language's own value, not the others", () => {
    const onValueChange = jest.fn();
    render(
      <LocalizedTextarea
        activeLanguage="es"
        id="notes"
        languages={LANGUAGES}
        onActiveLanguageChange={() => undefined}
        onValueChange={onValueChange}
        value="Reprogramado"
      />,
    );
    const textarea = screen.getByDisplayValue('Reprogramado');
    fireEvent.change(textarea, { target: { value: 'Reprogramado por lluvia' } });
    expect(onValueChange).toHaveBeenCalledWith('Reprogramado por lluvia');
  });

  it('switches the active language when a tab is clicked', () => {
    const onActiveLanguageChange = jest.fn();
    render(
      <LocalizedTextarea
        activeLanguage="en"
        id="notes"
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
      <LocalizedTextarea
        activeLanguage="en"
        disabled
        id="notes"
        languages={LANGUAGES}
        onActiveLanguageChange={() => undefined}
        onValueChange={() => undefined}
        value=""
      />,
    );
    expect((screen.getByRole('tab', { name: 'English' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByDisplayValue('') as HTMLTextAreaElement).disabled).toBe(true);
  });
});
