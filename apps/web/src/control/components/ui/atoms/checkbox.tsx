/**
 * Copied from shadcn/ui 2.3.0 (MIT), built on Radix Checkbox, and rewritten
 * onto CopaLibre's tokens. See THIRD_PARTY_NOTICES.md.
 */
import * as RadixCheckbox from '@radix-ui/react-checkbox';

export interface CheckboxProps extends Omit<
  RadixCheckbox.CheckboxProps,
  'checked' | 'onCheckedChange'
> {
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
  readonly disabled?: boolean;
}

export function Checkbox({
  checked,
  onCheckedChange,
  disabled = false,
  className = '',
  ...rest
}: CheckboxProps): React.JSX.Element {
  const state = disabled ? 'disabled' : 'default';
  return (
    <RadixCheckbox.Root
      checked={checked}
      className={`cl-checkbox cl-checkbox--${state} cl-focusable ${className}`}
      disabled={disabled}
      onCheckedChange={(value) => onCheckedChange(value === true)}
      {...rest}
    >
      <RadixCheckbox.Indicator className="cl-checkbox__indicator">✓</RadixCheckbox.Indicator>
    </RadixCheckbox.Root>
  );
}
