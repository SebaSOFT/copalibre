import { IntlProvider } from 'react-intl';

/**
 * Test-only: every control-panel leaf component now calls `useIntl()`/
 * `FormattedMessage`, which throw without an ancestor `IntlProvider`.
 * Production code gets this from `ControlShell`/`Dashboard.tsx`'s
 * `ControlIntl`; a unit test that mounts a leaf component directly needs its
 * own. English needs no `messages` prop — `defaultMessage` already covers it.
 */
export function withIntl(children: React.ReactNode): React.JSX.Element {
  return (
    <IntlProvider defaultLocale="en" locale="en">
      {children}
    </IntlProvider>
  );
}
