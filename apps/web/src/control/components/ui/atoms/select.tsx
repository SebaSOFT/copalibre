/**
 * Copied from shadcn/ui 2.3.0 (MIT), built on Radix Select, and rewritten onto
 * CopaLibre's tokens. See THIRD_PARTY_NOTICES.md.
 */
import * as RadixSelect from '@radix-ui/react-select';

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

export interface SelectProps {
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly options: readonly SelectOption[];
  readonly disabled?: boolean;
  readonly invalid?: boolean;
  readonly 'aria-label'?: string;
  readonly title?: string;
  readonly className?: string;
}

export function Select({
  value,
  onValueChange,
  options,
  disabled = false,
  invalid = false,
  className = '',
  ...rest
}: SelectProps): React.JSX.Element {
  const state = disabled ? 'disabled' : invalid ? 'error' : 'default';
  return (
    <RadixSelect.Root disabled={disabled} onValueChange={onValueChange} value={value}>
      <RadixSelect.Trigger
        aria-invalid={invalid || undefined}
        className={`cl-select cl-select--${state} cl-focusable ${className}`}
        {...rest}
      >
        <RadixSelect.Value />
        <RadixSelect.Icon className="cl-select__icon">▾</RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content className="cl-select__content cl-dialog-surface">
          <RadixSelect.Viewport>
            {options.map((option) => (
              <RadixSelect.Item
                className="cl-select__item cl-focusable"
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
  );
}
