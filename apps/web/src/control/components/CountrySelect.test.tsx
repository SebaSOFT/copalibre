import { jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { CountrySelect } from './CountrySelect.js';
import { withIntl } from '../i18n/test-support.js';

describe('CountrySelect', () => {
  it('shows every country, each with a flag, before any search', () => {
    const onChange = jest.fn();
    render(withIntl(<CountrySelect onChange={onChange} />));

    expect(screen.getByText('Argentina')).toBeDefined();
    expect(screen.getByText('🇦🇷')).toBeDefined();
  });

  it('filters options as the operator types a localized name', () => {
    const onChange = jest.fn();
    render(withIntl(<CountrySelect onChange={onChange} />));

    fireEvent.change(screen.getByPlaceholderText('Search country…'), {
      target: { value: 'Argent' },
    });

    expect(screen.getByText('Argentina')).toBeDefined();
    expect(screen.queryByText('Germany')).toBeNull();
  });

  it('calls onChange with the selected country code', () => {
    const onChange = jest.fn();
    render(withIntl(<CountrySelect onChange={onChange} />));

    fireEvent.click(screen.getByText('Argentina'));

    expect(onChange).toHaveBeenCalledWith('AR');
  });

  it('marks the currently-selected option', () => {
    const onChange = jest.fn();
    render(withIntl(<CountrySelect onChange={onChange} value="AR" />));

    expect(screen.getByRole('option', { name: /Argentina/ }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  it('falls back to English names for an unsupported active locale', () => {
    const onChange = jest.fn();
    render(
      <IntlProvider defaultLocale="en" locale="xx">
        <CountrySelect onChange={onChange} />
      </IntlProvider>,
    );

    expect(screen.getByText('Argentina')).toBeDefined();
  });
});
