/**
 * Copied from shadcn/ui 2.3.0 (MIT), built on Radix Radio Group, and rewritten
 * onto CopaLibre's tokens. See THIRD_PARTY_NOTICES.md.
 */
import * as RadixRadioGroup from '@radix-ui/react-radio-group';
import * as React from 'react';

export interface RadioGroupProps extends RadixRadioGroup.RadioGroupProps {
  readonly className?: string;
  readonly name?: string;
  readonly value?: string;
  readonly defaultValue?: string;
  readonly onValueChange?: (value: string) => void;
  readonly disabled?: boolean;
  readonly orientation?: 'horizontal' | 'vertical';
  readonly children: React.ReactNode;
}

export function RadioGroup({
  className = '',
  disabled = false,
  orientation = 'vertical',
  ...props
}: RadioGroupProps): React.JSX.Element {
  return (
    <RadixRadioGroup.Root
      className={`cl-radio-group cl-radio-group--${orientation} ${className}`}
      disabled={disabled}
      orientation={orientation}
      {...props}
    />
  );
}

export interface RadioGroupItemProps extends RadixRadioGroup.RadioGroupItemProps {
  readonly value: string;
  readonly id?: string;
  readonly disabled?: boolean;
  readonly className?: string;
}

export function RadioGroupItem({
  value,
  id,
  disabled = false,
  className = '',
  ...props
}: RadioGroupItemProps): React.JSX.Element {
  const state = disabled ? 'disabled' : 'default';
  return (
    <RadixRadioGroup.Item
      value={value}
      id={id}
      disabled={disabled}
      className={`cl-radio cl-radio--${state} cl-focusable ${className}`}
      {...props}
    >
      <RadixRadioGroup.Indicator className="cl-radio__indicator">
        <span className="cl-radio__mark" aria-hidden="true">
          ■
        </span>
      </RadixRadioGroup.Indicator>
    </RadixRadioGroup.Item>
  );
}

export const Radio = RadioGroupItem;
