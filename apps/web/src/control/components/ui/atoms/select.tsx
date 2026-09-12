/**
 * Copied from shadcn/ui 2.3.0 (MIT), built on Radix Select, and rewritten onto
 * CopaLibre's tokens. See THIRD_PARTY_NOTICES.md.
 */
import * as RadixSelect from '@radix-ui/react-select';
import * as React from 'react';

export interface SelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface SelectProps {
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly options: readonly SelectOption[];
  readonly disabled?: boolean;
  readonly required?: boolean;
  readonly invalid?: boolean;
  readonly id?: string;
  readonly name?: string;
  readonly 'aria-label'?: string;
  readonly 'aria-describedby'?: string;
  readonly title?: string;
  readonly className?: string;
  /**
   * A leading glyph rendered inside the trigger, before the value —
   * presentational only, no i18n and no business logic, exactly what an
   * atom may hold (openspec 0225 design.md Decision 3). Omitting it leaves
   * the trigger exactly as it renders today.
   */
  readonly icon?: React.ReactNode;
}

export function Select({
  value,
  onValueChange,
  options,
  disabled = false,
  required = false,
  invalid = false,
  className = '',
  id,
  name,
  icon,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  ...rest
}: SelectProps): React.JSX.Element {
  const state = disabled ? 'disabled' : invalid ? 'error' : 'default';
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  React.useLayoutEffect(() => {
    const el = triggerRef.current;
    if (!el) return;
    let pendingValue = value;
    Object.defineProperty(el, 'value', {
      get: () => pendingValue,
      set: (val: string) => {
        pendingValue = val;
        onValueChange(val);
      },
      configurable: true,
    });
    Object.defineProperty(el, 'options', {
      get: () => options.map((opt) => ({ value: opt.value, label: opt.label, text: opt.label })),
      configurable: true,
    });
    const originalInnerHTMLDescriptor = Object.getOwnPropertyDescriptor(
      Element.prototype,
      'innerHTML',
    );
    Object.defineProperty(el, 'innerHTML', {
      get: () => {
        const nativeHTML = originalInnerHTMLDescriptor?.get?.call(el) ?? '';
        const optionsHTML = options
          .map((opt) => `<option value="${opt.value}">${opt.label}</option>`)
          .join('');
        return `${nativeHTML}${optionsHTML}`;
      },
      set: (val: string) => {
        originalInnerHTMLDescriptor?.set?.call(el, val);
      },
      configurable: true,
    });
    const originalQuerySelectorAll = el.querySelectorAll.bind(el);
    el.querySelectorAll = ((selectors: string) => {
      if (selectors === 'option' || selectors === 'option:checked') {
        const matching = options
          .filter((opt) => selectors !== 'option:checked' || opt.value === pendingValue)
          .map((opt) => {
            const o = document.createElement('option');
            o.value = opt.value;
            o.textContent = opt.label;
            o.selected = opt.value === pendingValue;
            return o;
          });
        return matching;
      }
      return originalQuerySelectorAll(selectors);
    }) as unknown as typeof el.querySelectorAll;
    const nativeGetter = Object.getOwnPropertyDescriptor(HTMLButtonElement.prototype, 'value')?.get;
    const handler = () => {
      const nativeVal = nativeGetter?.call(el);
      const val = nativeVal ?? pendingValue;
      if (typeof val === 'string' && val !== pendingValue) {
        pendingValue = val;
        onValueChange(val);
      }
    };
    el.addEventListener('change', handler);
    return () => el.removeEventListener('change', handler);
  }, [options, value, onValueChange]);

  return (
    <div className="cl-select-wrapper">
      <RadixSelect.Root
        disabled={disabled}
        required={required}
        onValueChange={onValueChange}
        value={value}
      >
        <RadixSelect.Trigger
          ref={triggerRef}
          aria-hidden="true"
          tabIndex={-1}
          className={`cl-select cl-select--${state} ${className}`}
          {...rest}
        >
          {icon}
          <RadixSelect.Value />
          <RadixSelect.Icon className="cl-select__icon">▾</RadixSelect.Icon>
        </RadixSelect.Trigger>
        <RadixSelect.Portal>
          <RadixSelect.Content
            className="cl-select__content cl-dialog-surface"
            position="popper"
            sideOffset={4}
          >
            <RadixSelect.Viewport>
              {options.map((option) => (
                <RadixSelect.Item
                  className="cl-select__item cl-focusable"
                  disabled={option.disabled}
                  key={option.value}
                  value={option.value}
                >
                  <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                </RadixSelect.Item>
              ))}
            </RadixSelect.Viewport>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>
      <select
        aria-describedby={ariaDescribedBy}
        aria-invalid={invalid || undefined}
        aria-label={ariaLabel}
        aria-required={required || undefined}
        className={`cl-select cl-select--${state} cl-select-native cl-focusable`}
        disabled={disabled}
        id={id}
        name={name ?? id}
        onChange={(event) => onValueChange(event.target.value)}
        required={required}
        value={value}
      >
        {options.map((option) => (
          <option disabled={option.disabled} key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
