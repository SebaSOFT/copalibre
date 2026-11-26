import { DIALOG_TOKENS } from '../../components.js';

/** The `Modal`/`Dialog` organism's overlay and content-panel tokens. */
export function dialog(): string {
  return [
    '.cl-dialog-backdrop {',
    `  background: var(--cl-${DIALOG_TOKENS.backdrop});`,
    '}',
    '',
    '.cl-dialog-surface {',
    `  background: var(--cl-${DIALOG_TOKENS.surface});`,
    `  border: 1px solid var(--cl-${DIALOG_TOKENS.border});`,
    `  box-shadow: ${DIALOG_TOKENS.elevation};`,
    '}',
    '',
    // A native <dialog>'s own backdrop pseudo-element — Modal.astro renders `<dialog>` directly rather than a Radix overlay
    // div, so `.cl-dialog-backdrop` (an element's background) has nothing to
    // apply to there. Same token, so the two panels read as one system.
    '.cl-modal__content::backdrop {',
    `  background: var(--cl-${DIALOG_TOKENS.backdrop});`,
    '}',
  ].join('\n');
}
