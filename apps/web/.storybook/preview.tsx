import type { Decorator, Preview } from '@storybook/react-vite';
import { IntlProvider } from 'react-intl';
import { CATALOGS } from '../src/control/i18n/ControlIntl.js';
import { LANGUAGE_NAMES } from '../src/control/i18n/LanguageSwitcher.js';
import { ToastProvider } from '../src/control/components/ToastProvider.js';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '../src/lib/language-preference.js';
import '@copalibre/design-tokens/generated/copalibre.css';
import '../src/styles/control.css';

/**
 * Widths the codebase declares, not device presets (0213 design.md Decision 5).
 *
 * `control.css:207` and `control.css:236` are the layout's own breakpoints, and
 * 188px — the width a 375px review viewport exposes at 200% browser zoom — is
 * named at `control.css:235` and three times in the token generator as the
 * narrowest width the responsive rules are written against. No device preset
 * offers it, and it is where the real overflow failures have been.
 */
const VIEWPORTS = {
  desktop: {
    name: 'Desktop — 1440px',
    styles: { width: '1440px', height: '900px' },
    type: 'desktop',
  },
  mobileBreakpoint: {
    name: 'Mobile breakpoint — 767px',
    styles: { width: '767px', height: '900px' },
    type: 'tablet',
  },
  narrowPhone: {
    name: 'Narrow phone — 374px',
    styles: { width: '374px', height: '760px' },
    type: 'mobile',
  },
  zoomFloor: {
    name: 'Zoom floor — 188px',
    styles: { width: '188px', height: '760px' },
    type: 'mobile',
  },
} as const;

/**
 * Renders the story under the language chosen in the toolbar, using the
 * application's own catalogs. English carries no catalog: `defaultMessage` is
 * the source text, which is exactly what `ControlIntl` relies on too.
 */
const withLanguage: Decorator = (Story, context) => {
  const locale = (context.globals.locale ?? 'en') as SupportedLanguage;
  return (
    <IntlProvider defaultLocale="en" key={locale} locale={locale} messages={CATALOGS[locale]}>
      <ToastProvider>
        <Story />
      </ToastProvider>
    </IntlProvider>
  );
};

/**
 * `ControlShell` sets `data-density="control"` on its root, and the denser
 * operator spacing is scoped to that attribute. Outside it an operator
 * component renders at the wrong spacing, so the workbench supplies it — for
 * the operator surface only, which is the one that has it in the application.
 *
 * Derived from the story's own title rather than a per-story parameter, so a
 * new operator story cannot forget to opt in.
 */
const withSurfaceChrome: Decorator = (Story, context) => {
  if (!context.title.startsWith('Admin/')) return <Story />;
  return (
    <div className="cl-control" data-density="control">
      <Story />
    </div>
  );
};

const preview: Preview = {
  parameters: {
    controls: { expanded: true },
    viewport: { options: VIEWPORTS },
    options: {
      // Surface first, then tier: a component's surface decides what "correct"
      // looks like (design.md Decision 2).
      storySort: {
        order: [
          'Admin',
          ['Atoms', 'Molecules', 'Organisms', 'Templates', 'Screens'],
          'Public',
          'TV',
          'Tokens',
        ],
      },
    },
  },
  initialGlobals: {
    locale: 'en',
    viewport: { value: 'desktop', isRotated: false },
  },
  globalTypes: {
    locale: {
      description: 'Interface language — the catalog the story renders under',
      toolbar: {
        title: 'Language',
        icon: 'globe',
        dynamicTitle: true,
        items: SUPPORTED_LANGUAGES.map((language) => ({
          value: language,
          title: LANGUAGE_NAMES[language],
        })),
      },
    },
  },
  decorators: [withSurfaceChrome, withLanguage],
};

export default preview;
