/**
 * A text field whose suggestions narrow as one types: pick one or keep the typed text.
 *
 * Built on the ARIA combobox pattern (an `input` owning a `listbox`) rather than on
 * `<datalist>`, whose suggestions cannot be grouped, styled, or announced consistently.
 * ↓/↑ move through the visible suggestions, Enter takes the active one, Escape closes the
 * list without leaving the field (inside a `Modal`, the dialog stays open until the next
 * Escape); with no active suggestion, Enter is left to the caller.
 */
import { useId, useState, type KeyboardEvent } from 'react';
import { Input } from './input.js';

export interface ComboboxOption {
  readonly value: string;
  readonly label: string;
  /** Options sharing a group are listed under its label, in the order given. */
  readonly group?: string;
}

export interface ComboboxProps {
  readonly id: string;
  readonly value: string;
  /** The typed text, and the option it now equals exactly when it equals one. */
  readonly onValueChange: (value: string, option?: ComboboxOption) => void;
  readonly options: readonly ComboboxOption[];
  readonly placeholder?: string;
  readonly 'aria-label'?: string;
  readonly 'aria-describedby'?: string;
  readonly invalid?: boolean;
  readonly autoFocus?: boolean;
}

export function Combobox({
  id,
  value,
  onValueChange,
  options,
  placeholder,
  invalid = false,
  autoFocus = false,
  ...aria
}: ComboboxProps): React.JSX.Element {
  const listId = `${useId()}-list`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const query = value.trim().toLocaleLowerCase();
  const visible = options.filter(
    (option) => query === '' || option.label.toLocaleLowerCase().includes(query),
  );
  const expanded = open && visible.length > 0;

  function choose(option: ComboboxOption): void {
    onValueChange(option.label, option);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      setOpen(true);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current) =>
        visible.length === 0 ? -1 : (current + step + visible.length) % visible.length,
      );
      return;
    }
    if (event.key === 'Enter' && expanded && active >= 0 && visible[active]) {
      event.preventDefault();
      event.stopPropagation();
      choose(visible[active]);
      return;
    }
    if (event.key === 'Escape' && expanded) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      setActive(-1);
    }
  }

  // A group's label heads its first visible option only.
  const headed = visible.map(
    (option, index) => option.group !== undefined && option.group !== visible[index - 1]?.group,
  );
  return (
    <div className="cl-combobox">
      <Input
        aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-describedby={aria['aria-describedby']}
        aria-expanded={expanded}
        aria-label={aria['aria-label']}
        autoComplete="off"
        autoFocus={autoFocus}
        id={id}
        invalid={invalid}
        onBlur={() => setOpen(false)}
        onChange={(event) => {
          const next = event.target.value;
          onValueChange(
            next,
            options.find((option) => option.label === next),
          );
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        role="combobox"
        value={value}
      />
      {/* Hidden rather than unmounted: removing the list as the field blurs would land in the
          instant focus sits on <body>, and a focus trap around the field reads that as the
          focused element vanishing and pulls focus back to itself. */}
      <ul className="cl-combobox__list" hidden={!expanded} id={listId} role="listbox">
        {visible.map((option, index) => {
          const heading = headed[index];
          return [
            heading ? (
              <li key={`group-${option.group}`} aria-hidden="true" className="cl-combobox__group">
                {option.group}
              </li>
            ) : null,
            <li
              key={`${option.group ?? ''}-${option.value}`}
              aria-selected={index === active}
              className="cl-combobox__option"
              data-active={index === active}
              id={`${listId}-${index}`}
              // Pointer down, not click: the field's blur would close the list first.
              onMouseDown={(event) => {
                event.preventDefault();
                choose(option);
              }}
              role="option"
            >
              {option.label}
            </li>,
          ];
        })}
      </ul>
    </div>
  );
}
