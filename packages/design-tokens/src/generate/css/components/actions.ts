import { BUTTON_VARIANTS } from '../../../components.js';

export function actionButtons(): string[] {
  const buttons = Object.entries(BUTTON_VARIANTS).map(([variant, tokens]) =>
    [
      `.cl-btn--${variant} {`,
      `  background: ${tokens.background === 'transparent' ? 'transparent' : `var(--cl-${tokens.background})`};`,
      `  color: var(--cl-${tokens.text});`,
      `  border-color: ${tokens.border === 'transparent' ? 'transparent' : `var(--cl-${tokens.border})`};`,
      '}',
    ].join('\n'),
  );

  // A variant that states its hovered fill gets it from the contract; the
  // brightness filter below stays for the ones that do not, so a hover is
  // never left to chance.
  const buttonHovers = Object.entries(BUTTON_VARIANTS)
    .filter(([, tokens]) => tokens.hover !== undefined)
    .map(([variant, tokens]) => {
      const hover = tokens.hover as NonNullable<typeof tokens.hover>;
      return [
        `.cl-btn--${variant}:hover:not(:disabled) {`,
        `  background: var(--cl-${hover.background});`,
        ...(hover.border === undefined ? [] : [`  border-color: var(--cl-${hover.border});`]),
        '  filter: none;',
        '}',
      ].join('\n');
    });

  return [
    '.cl-btn {',
    // A link wearing the button treatment is a button, underline included —
    // until now every call site removed it inline, and the one that forgot
    // shipped an underlined button.
    '  display: inline-flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  text-align: center;',
    '  line-height: 1.1;',
    '  text-decoration: none;',
    '  min-height: var(--cl-touch-target);',
    '  min-width: var(--cl-touch-target);',
    '  font-family: var(--cl-font-display);',
    '  font-weight: var(--cl-weight-bold);',
    '  text-transform: uppercase;',
    '  letter-spacing: var(--cl-tracking-wider);',
    '  border: 1px solid transparent;',
    '  padding: var(--cl-space-2) var(--cl-space-4);',
    '  transition: background var(--cl-motion-fast) var(--cl-motion-easing), box-shadow var(--cl-motion-fast) var(--cl-motion-easing), filter var(--cl-motion-fast) var(--cl-motion-easing);',
    // A label of two words wraps on its space and fits; a single compound —
    // `Turniereinstellungen` — has no break the browser will take, so the
    // button grew past the 188px reference width and pushed the page sideways.
    '  max-width: 100%;',
    '  overflow-wrap: anywhere;',
    '  corner-shape: bevel;',
    '  border-radius: 0 var(--cl-radius-chamfer-control) 0 var(--cl-radius-chamfer-control);',
    '}',
    ...buttons,
    '',
    '/* A control reads as pressable through its own states, not only its fill. */',
    '.cl-btn:hover:not(:disabled) { filter: brightness(1.12); }',
    ...buttonHovers,
    '.cl-btn:active:not(:disabled) { filter: brightness(0.92); }',
    '.cl-btn--primary:hover:not(:disabled),',
    '.cl-btn--primary:active:not(:disabled) {',
    '  box-shadow: var(--cl-glow-cyan);',
    '}',
    '.cl-btn:disabled {',
    '  opacity: 0.55;',
    '  cursor: not-allowed;',
    '  filter: none;',
    '}',
    '',
    /*
     * The public (Persuade) treatment: the display face, uppercase, tracked out.
     * Operator screens keep body type — a dense console label like "Exportar
     * configuración JSON" is harder to read in caps, not easier.
     */
    '.cl-btn--persuade {',
    '  font-family: var(--cl-font-display);',
    '  text-transform: uppercase;',
    '  letter-spacing: var(--cl-tracking-widest);',
    '  font-weight: var(--cl-weight-bold);',
    '}',
    '',
  ];
}

export function pills(): string[] {
  return [
    /*
     * Filter and navigation pills. Each option is its own bounded control with
     * real spacing — the alternative is four bare anchors rendering as one
     * run-on string.
     */
    '.cl-pill-group {',
    '  display: flex;',
    '  flex-wrap: wrap;',
    '  gap: var(--cl-space-2);',
    '  list-style: none;',
    '  margin: 0;',
    '  padding: 0;',
    '}',
    '.cl-pill {',
    '  display: inline-flex;',
    '  align-items: center;',
    '  gap: var(--cl-space-1);',
    '  min-height: var(--cl-touch-target);',
    '  padding: var(--cl-space-1) var(--cl-space-3);',
    '  border: 1px solid var(--cl-border-muted);',
    '  background: var(--cl-surface-chrome);',
    '  color: var(--cl-text-primary);',
    '  font-family: var(--cl-font-body);',
    '  font-size: var(--cl-font-size-sm);',
    '  font-weight: var(--cl-weight-semibold);',
    '  text-decoration: none;',
    '  cursor: pointer;',
    '}',
    '.cl-pill:hover { background: var(--cl-surface-hover); }',
    /* A selected filter is context, not another primary action. */
    '.cl-pill--active,',
    '.cl-pill[aria-current] {',
    '  background: var(--cl-surface-raised);',
    '  border-color: var(--cl-state-live);',
    '  color: var(--cl-state-live);',
    '}',
    '',
  ];
}
