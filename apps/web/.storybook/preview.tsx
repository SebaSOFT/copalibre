import type { Decorator, Preview } from '@storybook/react-vite';
import { IntlProvider } from 'react-intl';
import { CATALOGS } from '../src/control/i18n/ControlIntl.js';
import { LANGUAGE_NAMES } from '../src/control/i18n/LanguageSwitcher.js';
import { ToastProvider } from '../src/control/components/ToastProvider.js';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '../src/lib/language-preference.js';
import '@copalibre/design-tokens/generated/copalibre.css';
import '../src/styles/control.css';
// The broadcast surface's own stylesheet. Without it the TV stories rendered
// as unstyled text: `TvDashboard`'s rules used to live inside `TvLayout.astro`,
// where nothing but that page could load them.
import '../src/styles/tv-broadcast.css';
import './tv-preview.css';
import footballField from './assets/football-field.webp';
import basketballCourt from './assets/basketball-court.webp';

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
 * The operator surface's spacing scope and page chrome — deliberately *not* its
 * shell.
 *
 * `ControlShell` puts `data-density="control"` on a root that also carries
 * `.cl-control`, and it is tempting to reproduce both. `.cl-control` is the
 * whole application layout: a two-column grid, `minmax(180px, 240px)` of
 * sidebar beside the main column, at `min-height: 100vh`. Applying it to a
 * single component makes that component the *sidebar* — capped at 240px wide
 * and stretched to the full viewport height. A table then refuses to widen, and
 * a card or a button stretches vertically to fill a column it was never in.
 *
 * Only the density attribute carries spacing (it redefines `--cl-density-*` and
 * nothing else), so that is what the workbench applies. The background, colour
 * and font are page chrome the shell happened to supply on the same element;
 * they are supplied here directly rather than by borrowing a layout with them.
 *
 * Derived from the story's own title rather than a per-story parameter, so a
 * new operator story cannot forget to opt in.
 */
const withSurfaceChrome: Decorator = (Story, context) => {
  if (context.title.startsWith('TV/')) {
    const choice = context.globals.tvBackdrop ?? 'story';
    const backdrop = choice === 'story' ? (context.parameters.tvBackdrop ?? 'neutral') : choice;
    const scene =
      backdrop === 'football'
        ? footballField
        : backdrop === 'basketball'
          ? basketballCourt
          : undefined;
    return (
      <div
        className="cl-story-tv-stage"
        data-surface="broadcast"
        data-backdrop={backdrop}
        style={{ backgroundImage: scene ? `url(${scene})` : undefined }}
      >
        <Story />
      </div>
    );
  }
  if (!context.title.startsWith('Admin/')) return <Story />;
  return (
    <div
      // Screens normally inherit these containment/wrapping rules from the
      // control main column. Use its standalone scope, never the sidebar grid.
      className={context.title.startsWith('Admin/Screens/') ? 'cl-control-screen' : undefined}
      data-density="control"
      style={{
        background: 'var(--cl-surface-base)',
        color: 'var(--cl-text-primary)',
        fontFamily: 'var(--cl-font-body)',
        padding: 'var(--cl-space-4)',
      }}
    >
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
    tvBackdrop: 'story',
    viewport: { value: 'desktop', isRotated: false },
  },
  globalTypes: {
    tvBackdrop: {
      description: 'TV preview backdrop — independent of discipline and match data',
      toolbar: {
        title: 'TV background',
        icon: 'photo',
        dynamicTitle: true,
        items: [
          { value: 'story', title: 'Story default' },
          { value: 'neutral', title: 'Neutral' },
          { value: 'chroma', title: 'Green chroma' },
          { value: 'football', title: 'Football · bright field' },
          { value: 'basketball', title: 'Basketball · dark court' },
        ],
      },
    },
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
