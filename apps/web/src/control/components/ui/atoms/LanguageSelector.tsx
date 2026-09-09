import type { ChangeEvent } from 'react';

export interface LanguageSelectorProps {
  /** The current active locale code (e.g. 'en', 'es', 'de') */
  readonly currentLocale?: string;
  /** Available locale options */
  readonly locales?: readonly string[];
  /** Callback when locale changes */
  readonly onSelectLocale?: (locale: string) => void;
  /** Additional CSS classes */
  readonly className?: string;
  /** Accessible label */
  readonly ariaLabel?: string;
}

const DEFAULT_LOCALES = ['en', 'es', 'de', 'fr', 'it', 'pt', 'ru', 'zh'] as const;

export function LanguageSelector({
  currentLocale = 'en',
  locales = DEFAULT_LOCALES,
  onSelectLocale,
  className = '',
  ariaLabel = 'Select language',
}: LanguageSelectorProps): React.JSX.Element {
  const handleChange = (e: ChangeEvent<HTMLSelectElement>): void => {
    onSelectLocale?.(e.target.value);
  };

  return (
    <div
      className={`cl-language-selector cl-chamfer cl-chamfer--control ${className}`.trim()}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        position: 'relative',
        background: 'var(--cl-surface-raised)',
        border: '1px solid var(--cl-border-muted)',
        color: 'var(--cl-text-primary)',
        height: 'var(--cl-touch-target)',
        padding: '0 var(--cl-space-3)',
        gap: 'var(--cl-space-2)',
        cursor: 'pointer',
      }}
    >
      <span
        className="cl-language-selector__icon"
        style={{
          color: 'var(--cl-state-live)',
          fontWeight: 'var(--cl-weight-bold)',
          fontSize: 'var(--cl-font-size-sm)',
          userSelect: 'none',
        }}
        aria-hidden="true"
      >
        文A
      </span>

      <span
        className="cl-language-selector__code"
        style={{
          fontFamily: 'var(--cl-font-mono)',
          fontWeight: 'var(--cl-weight-bold)',
          fontSize: 'var(--cl-font-size-xs)',
          letterSpacing: 'var(--cl-tracking-wide)',
          textTransform: 'uppercase',
        }}
      >
        {currentLocale}
      </span>

      <svg
        className="cl-language-selector__chevron"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={{ color: 'var(--cl-text-muted)' }}
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>

      <select
        value={currentLocale}
        onChange={handleChange}
        aria-label={ariaLabel}
        className="cl-focusable"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          opacity: 0,
          cursor: 'pointer',
          appearance: 'none',
        }}
      >
        {locales.map((loc) => (
          <option
            key={loc}
            value={loc}
            style={{ background: 'var(--cl-surface-panel)', color: 'var(--cl-text-primary)' }}
          >
            {loc.toUpperCase()}
          </option>
        ))}
      </select>
    </div>
  );
}
