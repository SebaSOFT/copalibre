import { BREAKPOINTS } from '../../../primitives.js';

export function overlays(): string[] {
  return [
    '.cl-modal__overlay { position: fixed; inset: 0; }',
    '.cl-modal__content { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: min(480px, calc(100vw - var(--cl-space-8))); max-height: 85vh; overflow-y: auto; padding: var(--cl-space-4); }',
    // Keep the title and close control together while giving translated
    // descriptions their own row, so neither steals width from the heading.
    '.cl-modal__header { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--cl-space-3); min-width: 0; }',
    '.cl-modal__title { grid-column: 1; grid-row: 1; margin: 0; font-family: var(--cl-font-display); text-transform: uppercase; min-width: 0; overflow-wrap: anywhere; word-break: break-word; }',
    '.cl-modal__description { grid-column: 1 / -1; grid-row: 2; margin: 0; color: var(--cl-text-muted); }',
    '.cl-modal__close { grid-column: 2; grid-row: 1; background: transparent; border: 0; color: var(--cl-text-primary); }',
    '.cl-modal__body { margin-block: var(--cl-space-4); display: grid; gap: var(--cl-space-3); }',
    '.cl-modal__footer { display: flex; justify-content: flex-end; gap: var(--cl-space-2); }',
    `@media (width < ${BREAKPOINTS.sm}) { .cl-modal__footer { flex-direction: column; } .cl-modal__footer > * { width: 100%; } }`,
    '',
    // The menu surface reuses the dialog surface, since both are the same thing —
    // a layer floating over the screen — and a second definition of that would
    // be a second thing to keep in step.
    '.cl-dropdown-menu__content { min-width: 12rem; padding: var(--cl-space-1); display: grid; gap: 2px; z-index: 40; }',
    '.cl-dropdown-menu__item { padding: var(--cl-space-2) var(--cl-space-3); font-size: var(--cl-font-size-sm); color: var(--cl-text-primary); cursor: pointer; user-select: none; }',
    '.cl-dropdown-menu__item[data-highlighted] { background: var(--cl-surface-raised); outline: none; }',
    ".cl-dropdown-menu__item[data-variant='destructive'] { color: var(--cl-state-destructive); }",
    '.cl-dropdown-menu__item[data-disabled] { color: var(--cl-text-muted); pointer-events: none; }',
    '',
  ];
}
