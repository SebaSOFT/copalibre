/**
 * Label + control-atom slot + help/error text (the
 * `Field` molecule, renamed and given a `required` indicator; `Label`
 * moves from a component with one consumer to this molecule's internal).
 * The control-web-shell "no state below organism" rule:
 * this molecule receives everything via props, it fetches nothing.
 *
 * A field keeps one height in every state: the message line is always there,
 * and clips to one line. When a message overflows it, the whole text opens from
 * an information icon, beside the label for help and in the line for an error.
 * The clip is CSS only, so `aria-describedby` still reads the whole text. The
 * icon takes the message as its name: a molecule holds no i18n of its own.
 *
 * CSS classes stay `cl-form-field*` across the rename — several screens
 * (`StandingsTemplate.tsx`, `ImageCropModal.tsx`) already compose that class
 * name directly for a paragraph this molecule does not own, and renaming it
 * would turn those into ownership violations for no behavioral reason.
 */
import {
  Children,
  cloneElement,
  Fragment,
  isValidElement,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react';
import { Popover } from '../../../../components/ui/atoms/Popover.js';
import { Label } from '../atoms/label.js';

export interface FieldProps {
  readonly id: string;
  readonly label: string;
  /** The control atom itself — Input/Select/Textarea/Checkbox. It receives `aria-describedby` for the message. */
  readonly children: ReactNode;
  readonly helpText?: string;
  readonly errorText?: string;
  /** Shows a required indicator beside the label. Purely visual — the caller's own control still carries the real `required` attribute. */
  readonly required?: boolean;
}

/** Whether the element's text is wider than its box, at its current width. */
function useOverflows(ref: RefObject<HTMLElement | null>, text: string | undefined): boolean {
  const [overflows, setOverflows] = useState(false);
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) {
      setOverflows(false);
      return undefined;
    }
    const measure = (): void => setOverflows(element.scrollWidth > element.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, text]);
  return overflows;
}

function describedBy(children: ReactNode, messageId: string | undefined): ReactNode {
  if (messageId === undefined) return children;
  const only = Children.count(children) === 1 ? Children.toArray(children)[0] : undefined;
  if (!isValidElement(only) || only.type === Fragment) return children;
  const control = only as ReactElement<{ readonly 'aria-describedby'?: string }>;
  const existing = control.props['aria-describedby']?.split(' ') ?? [];
  const ids = existing.includes(messageId) ? existing : [...existing, messageId];
  return cloneElement(control, { 'aria-describedby': ids.join(' ') });
}

export function Field({
  id,
  label,
  children,
  helpText,
  errorText,
  required = false,
}: FieldProps): React.JSX.Element {
  const lineRef = useRef<HTMLParagraphElement>(null);
  const message = errorText ? errorText : helpText ? helpText : undefined;
  const overflows = useOverflows(lineRef, message);
  const messageId = errorText ? `${id}-error` : helpText ? `${id}-help` : undefined;
  return (
    <div className="cl-form-field">
      <div className="cl-form-field__label-row">
        <Label htmlFor={id}>
          {label}
          {required ? (
            <span aria-hidden="true" className="cl-form-field__required">
              {' '}
              *
            </span>
          ) : null}
        </Label>
        {overflows && !errorText && helpText ? (
          <Popover triggerLabel={helpText}>{helpText}</Popover>
        ) : null}
      </div>
      {describedBy(children, messageId)}
      <div className="cl-form-field__message">
        {errorText ? (
          <p className="cl-form-field__error" id={messageId} ref={lineRef} role="alert">
            {errorText}
          </p>
        ) : helpText ? (
          <p className="cl-form-field__help" id={messageId} ref={lineRef}>
            {helpText}
          </p>
        ) : null}
        {overflows && errorText ? (
          <Popover tone="error" triggerLabel={errorText}>
            {errorText}
          </Popover>
        ) : null}
      </div>
    </div>
  );
}
