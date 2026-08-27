import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { ISO_3166_ALPHA_2_CODES, isSupportedLanguage } from '@copalibre/domain';
import { countryFlag, countryName } from '../lib/country.js';
import { Input } from './ui/atoms/input.js';
import { messages } from '../i18n/messages.en.js';

/**
 * A searchable country selector: every ISO 3166-1 alpha-2 country, each
 * option showing its flag and its name localized to the console's active
 * language (control-web/identity-visuals spec, "A country selector shows a
 * flag and a localized name per option").
 */
export function CountrySelect({
  value,
  onChange,
  id,
}: {
  readonly value?: string;
  readonly onChange: (code: string) => void;
  readonly id?: string;
}): React.JSX.Element {
  const intl = useIntl();
  const language = isSupportedLanguage(intl.locale) ? intl.locale : 'en';
  const [query, setQuery] = useState('');

  const options = useMemo(() => {
    const withNames = ISO_3166_ALPHA_2_CODES.map((code) => ({
      code,
      name: countryName(code, language),
    }));
    const needle = query.trim().toLowerCase();
    const filtered =
      needle === ''
        ? withNames
        : withNames.filter((option) => option.name.toLowerCase().includes(needle));
    return filtered.sort((a, b) => a.name.localeCompare(b.name, language));
  }, [query, language]);

  return (
    <div style={containerStyle}>
      <Input
        aria-label={intl.formatMessage(messages.countrySelectLabel)}
        id={id}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={intl.formatMessage(messages.countrySelectSearchPlaceholder)}
        type="text"
        value={query}
      />
      <ul role="listbox" style={listStyle}>
        {options.map((option) => (
          <li key={option.code}>
            <button
              aria-selected={option.code === value}
              onClick={() => {
                onChange(option.code);
                setQuery('');
              }}
              role="option"
              style={optionStyle(option.code === value)}
              type="button"
            >
              <span aria-hidden="true">{countryFlag(option.code)}</span>
              <span>{option.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const containerStyle: React.CSSProperties = { display: 'grid', gap: 'var(--cl-space-1)' };
const listStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  maxHeight: 160,
  overflowY: 'auto',
  border: '1px solid var(--cl-border-muted)',
};
function optionStyle(selected: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--cl-space-2)',
    width: '100%',
    padding: 'var(--cl-space-1) var(--cl-space-2)',
    background: selected ? 'var(--cl-state-live)' : 'transparent',
    color: selected ? 'var(--cl-surface-base)' : 'inherit',
    border: 'none',
    textAlign: 'left',
    cursor: 'pointer',
  };
}
