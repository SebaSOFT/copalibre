export function fields(): string[] {
  return [
    '.cl-input, .cl-select, .cl-textarea {',
    '  min-height: var(--cl-touch-target);',
    '  font-family: var(--cl-font-body);',
    // Form controls do not inherit the page's size: without this they fall to
    // the browser default of 13.33px, and iOS zooms the page when focusing a
    // field under 16px.
    '  font-size: var(--cl-font-size-base);',
    '  border: 1px solid;',
    '  padding: var(--cl-space-2) var(--cl-space-3);',
    // A bare <input>/<select>/<textarea> has a UA-stylesheet intrinsic
    // min-content width (Chromium: roughly a `size=20` input) that a narrow
    // grid track cannot override without an explicit width — without this,
    // the control forces its own grid ancestor wider than the viewport at
    // the narrowest reference width (188px, a 200%-zoom equivalent).
    '  width: 100%;',
    '  min-width: 0;',
    '}',
    '',
    /*
     * The same diagonal cut the chamfer utility makes, on the controls
     * themselves rather than on a wrapper.
     *
     * `corner-shape` only, with no `clip-path` fallback: these carry
     * `.cl-focusable`, whose focus ring is a `box-shadow`, and `clip-path`
     * clips box-shadows away. A browser without `corner-shape` therefore keeps
     * square controls and a visible focus ring, which is the right way round —
     * the fallback philosophy is already "a plain rectangle where neither
     * works", and a focus indicator is not decoration to trade for a bevel.
     */
    '@supports (corner-shape: bevel) {',
    '  .cl-input, .cl-select, .cl-textarea {',
    '    corner-shape: bevel;',
    '    border-radius: 0 var(--cl-radius-chamfer-control) 0 var(--cl-radius-chamfer-control);',
    '  }',
    '}',
    '',
    '.cl-input::-webkit-calendar-picker-indicator {',
    '  cursor: pointer;',
    '}',
    '',
    '.cl-input[type="file"] {',
    '  padding: var(--cl-space-1);',
    '}',
    '.cl-input[type="file"]::file-selector-button {',
    '  background: var(--cl-surface-chrome);',
    '  color: var(--cl-text-primary);',
    '  border: 1px solid var(--cl-border-control);',
    '  padding: var(--cl-space-1) var(--cl-space-3);',
    '  margin-right: var(--cl-space-3);',
    '  font-family: var(--cl-font-body);',
    '  font-size: var(--cl-font-size-sm);',
    '  cursor: pointer;',
    '  border-radius: var(--cl-radius-sm);',
    '  transition: background 120ms ease;',
    '}',
    '.cl-input[type="file"]::file-selector-button:hover {',
    '  background: var(--cl-surface-hover);',
    '}',
    '',
    /*
     * The Checkbox and Radio atoms are two boxes. The Radix `<button>` is the
     * 44px target and paints nothing. `__box` inside it is the `1.25rem` square
     * the contract describes, and it carries the state class, so the component
     * tokens paint the box. `flex: none` holds the target at 44px in a row
     * whose label is long enough to push against it.
     */
    '.cl-checkbox, .cl-radio {',
    '  display: inline-grid;',
    '  place-items: center;',
    '  flex: none;',
    '  width: var(--cl-touch-target);',
    '  height: var(--cl-touch-target);',
    '  padding: 0;',
    '  border: 0;',
    '  background: transparent;',
    '  cursor: pointer;',
    '}',
    '.cl-checkbox__box, .cl-radio__box {',
    '  display: inline-grid;',
    '  place-content: center;',
    '  box-sizing: border-box;',
    '  width: 1.25rem;',
    '  height: 1.25rem;',
    '  border: 1px solid;',
    '  border-radius: var(--cl-radius-sm);',
    '}',
    '.cl-checkbox:hover .cl-checkbox__box, .cl-radio:hover .cl-radio__box {',
    '  border-color: var(--cl-border-hover);',
    '}',
    '.cl-checkbox[data-state="checked"] .cl-checkbox__box, .cl-radio[data-state="checked"] .cl-radio__box {',
    '  background: var(--cl-state-live);',
    '  border-color: var(--cl-state-live);',
    '}',
    '.cl-checkbox__indicator {',
    '  display: block;',
    '  width: 0.55rem;',
    '  height: 0.55rem;',
    '  background-color: var(--cl-color-ink-950);',
    '  clip-path: polygon(14% 44%, 0 58%, 40% 98%, 100% 16%, 86% 2%, 40% 68%);',
    '}',
    '.cl-radio__indicator {',
    '  display: block;',
    '  width: 0.5rem;',
    '  height: 0.5rem;',
    '  background-color: var(--cl-color-ink-950);',
    '}',
    '.cl-checkbox[data-disabled], .cl-radio[data-disabled] {',
    '  cursor: not-allowed;',
    '}',
    '.cl-checkbox[data-disabled] .cl-checkbox__box, .cl-radio[data-disabled] .cl-radio__box {',
    '  background: var(--cl-surface-panel);',
    '  border-color: var(--cl-border-control);',
    '}',
    '.cl-checkbox[data-disabled] .cl-checkbox__indicator, .cl-radio[data-disabled] .cl-radio__indicator {',
    '  background-color: var(--cl-text-muted);',
    '}',
    // Forced colours strip a background, and these marks are nothing else.
    '@media (forced-colors: active) {',
    '  .cl-checkbox__indicator, .cl-radio__indicator {',
    '    forced-color-adjust: none;',
    '    background-color: CanvasText;',
    '  }',
    '}',
    'input[type="checkbox"].cl-checkbox, input[type="radio"] {',
    '  appearance: none;',
    '  -webkit-appearance: none;',
    '  width: 1.25rem;',
    '  height: 1.25rem;',
    '  min-height: 1.25rem;',
    '  min-width: 1.25rem;',
    '  margin: 0;',
    '  cursor: pointer;',
    '  border-radius: var(--cl-radius-sm);',
    '  background: var(--cl-surface-base);',
    '  border: 1px solid var(--cl-border-control);',
    '  display: inline-grid;',
    '  place-content: center;',
    '  flex-shrink: 0;',
    '}',
    'input[type="checkbox"].cl-checkbox:hover, input[type="radio"]:hover {',
    '  border-color: var(--cl-border-hover);',
    '}',
    'input[type="checkbox"].cl-checkbox:checked, input[type="radio"]:checked {',
    '  background: var(--cl-state-live);',
    '  border-color: var(--cl-state-live);',
    '}',
    /*
     * A radio's mark is a square, not the checkbox's tick: the shape says
     * "one of these" where the tick says "this one is on", and a chamfered box
     * with a round dot inside would be two geometries arguing.
     */
    'input[type="radio"]:checked::before {',
    '  content: "";',
    '  width: 0.5rem;',
    '  height: 0.5rem;',
    '  background-color: var(--cl-color-ink-950);',
    '}',
    'input[type="checkbox"].cl-checkbox:checked::before {',
    '  content: "";',
    '  width: 0.55rem;',
    '  height: 0.55rem;',
    '  background-color: var(--cl-color-ink-950);',
    '  clip-path: polygon(14% 44%, 0 58%, 40% 98%, 100% 16%, 86% 2%, 40% 68%);',
    '}',
    'input[type="checkbox"].cl-checkbox:focus-visible {',
    '  outline: 2px solid var(--cl-focus-ring);',
    '  outline-offset: 2px;',
    '}',
    '',
    '.cl-toggle {',
    '  display: inline-flex;',
    '  align-items: center;',
    '  gap: var(--cl-space-2);',
    '  cursor: pointer;',
    '  user-select: none;',
    '}',
    // The box lines up with the fields around it and sits one gap from its
    // text, and the target's spare width overhangs both sides instead. The
    // padding pays that overhang back, so in a row of options a text sits
    // closer to its own box than to the next one.
    '.cl-toggle > .cl-checkbox, .cl-toggle > .cl-radio {',
    '  margin-inline: calc((1.25rem - var(--cl-touch-target)) / 2);',
    '}',
    '.cl-toggle:has(> .cl-checkbox, > .cl-radio) {',
    '  padding-inline-end: calc((var(--cl-touch-target) - 1.25rem) / 2);',
    '}',
    '',
    '.cl-link {',
    '  color: var(--cl-state-live);',
    '  text-decoration: underline;',
    '  text-underline-offset: 4px;',
    '  cursor: pointer;',
    '  transition: opacity 120ms ease;',
    '}',
    '.cl-link:hover {',
    '  opacity: 0.85;',
    '}',
    '.cl-link:focus-visible {',
    '  outline: 2px solid var(--cl-focus-ring);',
    '  outline-offset: 2px;',
    '}',
    '.cl-radio-group {',
    '  display: flex;',
    '  flex-direction: column;',
    '  gap: var(--cl-space-2);',
    '}',
    '.cl-file-picker {',
    '  display: flex;',
    '  flex-direction: column;',
    '  gap: var(--cl-space-2);',
    '}',
    '.cl-file-picker__zone {',
    '  display: flex;',
    '  flex-direction: column;',
    '  align-items: center;',
    '  justify-content: center;',
    '  padding: var(--cl-space-4);',
    '  border: 1px dashed var(--cl-border-muted);',
    '  cursor: pointer;',
    '  background: var(--cl-surface-panel);',
    '  min-height: var(--cl-touch-target);',
    '  transition: border-color var(--cl-motion-fast), background var(--cl-motion-fast);',
    '}',
    '.cl-file-picker__zone:hover {',
    '  border-color: var(--cl-border-hover);',
    '}',
    '.cl-file-picker__zone:focus-visible {',
    '  outline: 2px solid var(--cl-focus-ring);',
    '  outline-offset: 2px;',
    '}',
    '.cl-file-picker__input {',
    '  position: absolute;',
    '  width: 1px;',
    '  height: 1px;',
    '  padding: 0;',
    '  margin: -1px;',
    '  overflow: hidden;',
    '  clip: rect(0, 0, 0, 0);',
    '  white-space: nowrap;',
    '  border-width: 0;',
    '}',
    /*
     * Checkboxes and radios cut all four corners, unlike every other surface,
     * which cuts one diagonal pair. A 20px box carrying an asymmetric cut reads
     * as a rendering slip rather than a shape; symmetry is what makes it read
     * as deliberate at that size.
     *
     * `--cl-radius-md` (4px) rather than the 8px control chamfer: eight on a
     * twenty-pixel box leaves a diamond.
     */
    '@supports (corner-shape: bevel) {',
    '  .cl-checkbox__box, .cl-radio__box {',
    '    corner-shape: bevel;',
    '    border-radius: var(--cl-radius-md);',
    '  }',
    '  .cl-file-picker__zone {',
    '    corner-shape: bevel;',
    '    border-radius: var(--cl-radius-chamfer-control);',
    '  }',
    // The 20px native controls: a proportionate cut, because eight pixels off
    // each corner of a twenty-pixel box leaves a diamond.
    '  input[type="checkbox"].cl-checkbox, input[type="radio"] {',
    '    border-radius: var(--cl-radius-md);',
    '  }',
    '}',
    '.cl-select { font-family: var(--cl-font-mono); }',
    // The public filter bars' native select: quiet, panel-coloured, one control height, and no layout
    // of its own beyond the row it sits in.
    '.cl-public-select { min-height: var(--cl-touch-target); max-width: 100%; padding: var(--cl-space-1) var(--cl-space-3); background: var(--cl-surface-panel); color: var(--cl-text-primary); border: 1px solid var(--cl-border-muted); font-family: var(--cl-font-body); font-size: var(--cl-font-size-sm); }',
    // The trigger is a button, which centres its text and wraps a long label
    // onto a second line, growing past the 44px control height. It reads like
    // Input instead: left-aligned, one line, clipped. The atom keeps the full
    // label in `title`.
    'button.cl-select { display: flex; align-items: center; text-align: start; }',
    '.cl-select__value { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
    '.cl-select__value--placeholder { color: var(--cl-text-muted); }',
    '.cl-select__icon { flex: none; margin-inline-start: var(--cl-space-2); transition: transform 0.15s ease; }',
    '.cl-select[data-state="open"] .cl-select__icon { transform: rotate(180deg); }',
    '.cl-select__badge { flex: none; margin-inline-start: var(--cl-space-2); font-size: var(--cl-font-size-xs); font-family: var(--cl-font-mono); text-transform: uppercase; letter-spacing: var(--cl-tracking-wider); color: var(--cl-text-muted); }',
    // `popper` positioning exposes the trigger's width, so the panel lines up
    // with the box it belongs to rather than sizing itself to its longest
    // option. `max-height` is the space Radix measured to the viewport edge.
    // `.cl-chamfer--control` cuts the same top-right/bottom-left corners as
    // the trigger it drops from.
    '.cl-select__content { padding-block: var(--cl-space-1); min-width: max(10rem, var(--radix-select-trigger-width)); max-height: var(--radix-select-content-available-height); overflow-y: auto; font-family: var(--cl-font-mono); }',
    '.cl-select__item { display: flex; align-items: center; justify-content: space-between; gap: var(--cl-space-3); padding: var(--cl-space-2) var(--cl-space-3); border-inline-start: 2px solid transparent; cursor: pointer; }',
    // The keyboard-navigated/hovered option reads as active the same way a
    // live indicator does elsewhere: the signal-cyan leading rail and text.
    '.cl-select__item[data-highlighted] { background: var(--cl-surface-raised); border-inline-start-color: var(--cl-state-live); color: var(--cl-state-live); font-weight: var(--cl-weight-bold); outline: none; }',
    '.cl-select__item[data-highlighted] .cl-select__badge { color: var(--cl-state-live); }',
    // The native `<select>` is still the element a form, autofill, or
    // assistive technology actually addresses (its accessible name and
    // keyboard/native-select semantics are unchanged), but it no longer
    // stacks a full-size invisible copy on top of the Radix trigger to catch
    // pointer clicks — that overlay opened the browser's own native picker
    // instead of the styled `.cl-select__content` popover underneath. It is
    // sized off-screen instead, so a mouse click lands on the visible,
    // styled trigger while Tab/keyboard/AT users still reach it directly
    // (replacing the earlier overlay).
    '.cl-select-wrapper { position: relative; display: inline-block; width: 100%; min-width: 0; }',
    // `Combobox`: a text field whose suggestions narrow as one types. The list
    // reads like an open `Select` panel so the two never look like different
    // controls; the active option carries the same live rail.
    '.cl-combobox { position: relative; display: grid; min-width: 0; }',
    '.cl-combobox__list { position: absolute; inset-inline: 0; top: 100%; z-index: 50; margin: 0; padding: var(--cl-space-1) 0; list-style: none; max-height: 14rem; overflow-y: auto; background: var(--cl-surface-panel); border: 1px solid var(--cl-border-strong); font-family: var(--cl-font-mono); }',
    '.cl-combobox__option { padding: var(--cl-space-2) var(--cl-space-3); border-inline-start: 2px solid transparent; cursor: pointer; overflow-wrap: anywhere; }',
    '.cl-combobox__option[data-active="true"] { background: var(--cl-surface-raised); border-inline-start-color: var(--cl-state-live); color: var(--cl-state-live); font-weight: var(--cl-weight-bold); }',
    '.cl-combobox__group { padding: var(--cl-space-1) var(--cl-space-3); color: var(--cl-text-muted); font-size: var(--cl-font-size-xs); text-transform: uppercase; letter-spacing: var(--cl-tracking-wider); }',
    // `ScheduleReasonPrompt`: one row per changed published match; a focused
    // or selected row shows it without relying on colour alone.
    '.cl-reason-prompt__body { display: grid; gap: var(--cl-space-3); min-width: 0; }',
    '.cl-reason-prompt__rows { display: grid; gap: var(--cl-space-2); margin: 0; padding: 0; list-style: none; }',
    '.cl-reason-prompt__row { display: grid; gap: var(--cl-space-2); padding: var(--cl-space-2) var(--cl-space-3); border: 1px solid var(--cl-border-muted); border-inline-start-width: 3px; min-width: 0; }',
    '.cl-reason-prompt__row[aria-selected="true"] { border-inline-start-color: var(--cl-state-live); background: var(--cl-surface-row); }',
    '.cl-reason-prompt__row-head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--cl-space-2); min-width: 0; }',
    '.cl-reason-prompt__change { color: var(--cl-text-secondary); font-family: var(--cl-font-mono); font-size: var(--cl-font-size-sm); overflow-wrap: anywhere; }',
    '.cl-reason-prompt__summary { margin: 0; font-family: var(--cl-font-mono); font-size: var(--cl-font-size-sm); }',
    '.cl-reason-prompt__hint { margin: 0; color: var(--cl-text-muted); font-size: var(--cl-font-size-xs); }',
    '.cl-select-native { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; pointer-events: none; }',
    '.cl-label { font-family: var(--cl-font-mono); text-transform: uppercase; font-size: var(--cl-font-size-xs); line-height: var(--cl-line-height-label); }',
    '',
    '.cl-form-field { display: grid; align-content: start; gap: var(--cl-space-1); min-width: 0; }',
    '.cl-form-field__label-row { display: flex; align-items: center; gap: var(--cl-space-1); min-width: 0; }',
    // One reserved line in every state, so a message never moves the form.
    // The clip is scoped here: screens reuse the two text classes elsewhere.
    '.cl-form-field__message { display: flex; align-items: center; gap: var(--cl-space-1); min-width: 0; height: calc(var(--cl-font-size-xs) * 1.5); }',
    '.cl-form-field__message > .cl-form-field__error, .cl-form-field__message > .cl-form-field__help { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.5; }',
    '.cl-form-field__error { margin: 0; color: var(--cl-state-destructive); font-size: var(--cl-font-size-xs); }',
    '.cl-form-field__help { margin: 0; color: var(--cl-text-muted); font-size: var(--cl-font-size-xs); }',
    '.cl-form-field__required { color: var(--cl-state-destructive); }',
    '.cl-decision-hint { margin: 0; color: var(--cl-text-muted); font-size: var(--cl-font-size-xs); }',
    '',
    // `Form` and `FieldSet`: the owners `<form>` and
    // `<fieldset>`/`<legend>` compose instead of a screen rendering them raw.
    '.cl-form { display: grid; gap: var(--cl-space-4); }',
    '.cl-fieldset { display: grid; gap: var(--cl-space-3); border: 1px solid var(--cl-border-muted); border-radius: var(--cl-radius-md); padding: var(--cl-space-4); margin: 0; min-width: 0; }',
    '.cl-fieldset__legend { font-family: var(--cl-font-mono); text-transform: uppercase; font-size: var(--cl-font-size-xs); color: var(--cl-text-secondary); padding: 0 var(--cl-space-2); }',
    '',
  ];
}
