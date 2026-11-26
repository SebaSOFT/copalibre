import { FOCUS_RING } from '../../../components.js';

export function base(): string[] {
  return [
    '.cl-visually-hidden {',
    '  position: absolute;',
    '  width: 1px;',
    '  height: 1px;',
    '  margin: -1px;',
    '  padding: 0;',
    '  overflow: hidden;',
    '  clip-path: inset(50%);',
    '  white-space: nowrap;',
    '  border: 0;',
    '}',
    '',
    /*
     * A link's colour, for every surface.
     *
     * This lived as `:global(a)` inside `PublicLayout.astro`, so only the public
     * pages ever loaded it: every link in the operator panel rendered in the
     * browser's default blue, against a dark panel, in production. A base
     * element treatment belongs with the tokens, where every surface that loads
     * the stylesheet gets it.
     */
    'a { color: var(--cl-state-live); }',
    '',
    'html { line-height: var(--cl-line-height-body); }',
    '',
    /*
     * Headings use the display face.
     *
     * Fourteen component classes reach for `--cl-font-display` deliberately,
     * but nothing gave a bare `<h1>`-`<h6>` a family, so a page heading rendered
     * in the body face — the condensed identity the product shows off appeared
     * only where a component happened to ask for it.
     *
     * The semantic scale replaces browser-dependent sizes: each heading level
     * uses one declared token, while whether it is uppercase remains the
     * component's or the page's call.
     */
    'h1, h2, h3, h4, h5, h6 { font-family: var(--cl-font-display); letter-spacing: var(--cl-tracking-wide); }',
    'h1 { font-size: var(--cl-font-size-3xl); line-height: var(--cl-line-height-display); }',
    'h2 { font-size: var(--cl-font-size-2xl); line-height: var(--cl-line-height-headline); }',
    'h3 { font-size: var(--cl-font-size-xl); line-height: var(--cl-line-height-title); }',
    'h4 { font-size: var(--cl-font-size-lg); line-height: var(--cl-line-height-title); }',
    'h5 { font-size: var(--cl-font-size-md); line-height: var(--cl-line-height-body); }',
    'h6 { font-size: var(--cl-font-size-base); line-height: var(--cl-line-height-body); }',
    '',
    /*
     * An alert's paragraphs carry no margin of their own — the alert is already
     * a flex container with its own gap. Also formerly trapped in the public
     * layout, which is why a block-form alert spaced differently depending on
     * which surface rendered it.
     */
    '.cl-inline-alert p { margin: 0; }',
    '',
    '.cl-focusable:focus-visible {',
    '  outline: none;',
    `  box-shadow: 0 0 0 ${FOCUS_RING.innerWidth} var(--cl-surface-base),`,
    `    0 0 0 ${FOCUS_RING.outerWidth} var(--cl-focus-ring);`,
    '}',
    // The ring belongs on what the eye sees, not on the invisible 44px target.
    '.cl-checkbox.cl-focusable:focus-visible, .cl-radio.cl-focusable:focus-visible {',
    '  box-shadow: none;',
    '}',
    '.cl-checkbox:focus-visible .cl-checkbox__box, .cl-radio:focus-visible .cl-radio__box {',
    `  box-shadow: 0 0 0 ${FOCUS_RING.innerWidth} var(--cl-surface-base),`,
    `    0 0 0 ${FOCUS_RING.outerWidth} var(--cl-focus-ring);`,
    '}',
    '',
    // Shared by the public layout and the Control shell: off-screen until it
    // takes keyboard focus, so it costs a sighted mouse user nothing.
    '.cl-skip-link {',
    '  position: absolute;',
    '  top: -9999px;',
    '  left: -9999px;',
    '  z-index: 9999;',
    '  padding: var(--cl-space-2) var(--cl-space-4);',
    '  background: var(--cl-surface-panel);',
    '  color: var(--cl-text-primary);',
    '  border: 1px solid var(--cl-border-muted);',
    '  border-radius: var(--cl-radius-md);',
    '  text-decoration: none;',
    '  font-weight: var(--cl-weight-medium);',
    '}',
    '.cl-skip-link:focus { top: var(--cl-space-2); left: var(--cl-space-2); }',
    '',
  ];
}
