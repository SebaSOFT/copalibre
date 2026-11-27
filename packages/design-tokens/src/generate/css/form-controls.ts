import {
  CHECKBOX_TOKENS,
  RADIO_TOKENS,
  FILE_PICKER_TOKENS,
  INPUT_TOKENS,
  SELECT_TOKENS,
  TEXTAREA_TOKENS,
  type FormControlTokenSet,
} from '../../components.js';

/** One state-keyed rule block per form-control atom. */
export function formControls(): string {
  const groups: readonly [string, Record<string, FormControlTokenSet>][] = [
    ['input', INPUT_TOKENS],
    ['select', SELECT_TOKENS],
    ['textarea', TEXTAREA_TOKENS],
    ['checkbox', CHECKBOX_TOKENS],
    ['radio', RADIO_TOKENS],
    ['file-picker', FILE_PICKER_TOKENS],
  ];

  return groups
    .map(([atom, states]) =>
      (Object.entries(states) as [string, FormControlTokenSet][])
        .map(([state, tokens]) =>
          [
            `.cl-${atom}--${state} {`,
            `  background: var(--cl-${tokens.background});`,
            `  color: var(--cl-${tokens.text});`,
            `  border-color: var(--cl-${tokens.border});`,
            ...(tokens.focusRing
              ? [`  --cl-control-focus-ring: var(--cl-${tokens.focusRing});`]
              : []),
            '}',
          ].join('\n'),
        )
        .join('\n'),
    )
    .join('\n\n');
}
