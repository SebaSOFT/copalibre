/* global Scalar */
// Configures the API reference. Copied beside the vendored Scalar bundle at build time
// (scripts/copy-scalar-assets.mjs) and loaded as a same-origin script, because the content
// security policy runs no inline script that Astro did not hash.
//
// Try It is on: it is how an integrator uses the API with a personal access token. What keeps that
// safe is where requests go and what they carry, not that they are switched off:
//  - only this origin: the document declares no server, so Scalar targets the page's own origin, and
//    the policy's `connect-src` refuses any other;
//  - the visitor's own token, sent as `Authorization: Bearer`, never the session cookie, so a
//    signed-in operator is not acting as themselves by accident (`credentials: 'omit'`);
//  - never stored: `persistAuth: false` keeps the token out of `localStorage`.
Scalar.createApiReference('#copalibre-reference', {
  url: '/openapi/v1.json',
  pageTitle: 'API reference | CopaLibre',
  theme: 'default',
  hideTestRequestButton: false,
  persistAuth: false,
  authentication: { preferredSecurityScheme: 'bearer' },
  customFetch: (input, init) => globalThis.fetch(input, { ...init, credentials: 'omit' }),
  showDeveloperTools: 'never',
  // The reviewed document is public at /openapi/v1.json; keeping it downloadable is the point.
  documentDownloadType: 'direct',
  withDefaultFonts: false,
  // CopaLibre's own look: Scalar's variables read the design tokens, which the page loads from the
  // same stylesheet as every other surface, so the reference follows the colour scheme and the fonts
  // the rest of the application uses. Scalar builds its theme after this CSS in the same layer, so
  // every value is `!important`. The fonts are the application's own, served from this origin: the
  // bundled theme's hosted fonts are removed at build time (scripts/copy-scalar-assets.mjs), and an
  // installation with no internet must never depend on a Scalar-hosted asset.
  customCss: `
    :root, .light-mode, .dark-mode {
      --scalar-font: var(--cl-font-body) !important;
      --scalar-font-code: var(--cl-font-mono) !important;
      --scalar-radius: var(--cl-radius-md) !important;
      --scalar-radius-lg: var(--cl-radius-lg) !important;
      --scalar-radius-xl: var(--cl-radius-lg) !important;
      --scalar-background-1: var(--cl-surface-base) !important;
      --scalar-background-2: var(--cl-surface-panel) !important;
      --scalar-background-3: var(--cl-surface-row) !important;
      --scalar-background-card: var(--cl-surface-panel) !important;
      --scalar-background-accent: var(--cl-surface-raised) !important;
      --scalar-color-1: var(--cl-text-primary) !important;
      --scalar-color-2: var(--cl-text-secondary) !important;
      --scalar-color-3: var(--cl-text-muted) !important;
      --scalar-color-accent: var(--cl-text-accent) !important;
      --scalar-border-color: var(--cl-border-muted) !important;
      --scalar-button-1: var(--cl-text-accent) !important;
      --scalar-button-1-hover: var(--cl-border-hover) !important;
      --scalar-button-1-color: var(--cl-surface-base) !important;
      --scalar-sidebar-background-1: var(--cl-surface-chrome) !important;
      --scalar-sidebar-color-1: var(--cl-text-primary) !important;
      --scalar-sidebar-color-2: var(--cl-text-muted) !important;
      --scalar-sidebar-color-active: var(--cl-text-accent) !important;
      --scalar-sidebar-border-color: var(--cl-border-muted) !important;
      --scalar-sidebar-item-hover-background: var(--cl-surface-hover) !important;
      --scalar-sidebar-item-hover-color: var(--cl-text-primary) !important;
      --scalar-sidebar-item-active-background: var(--cl-surface-raised) !important;
      --scalar-sidebar-search-background: var(--cl-surface-panel) !important;
      --scalar-sidebar-search-color: var(--cl-text-secondary) !important;
      --scalar-sidebar-search-border-color: var(--cl-border-control) !important;
    }
    h1, h2, .section-header {
      font-family: var(--cl-font-display) !important;
    }
  `,
  // The colours follow the system colour scheme, as the rest of the application's tokens do, so a
  // switch of Scalar's own would change nothing it can see.
  hideDarkModeToggle: true,
  // The sidebar search otherwise calls Scalar's hosted vector-registry search on load: another
  // outbound call an offline installation must not depend on.
  hideSearch: true,
  telemetry: false,
  agent: { disabled: true },
});
