/**
 * Copied from shadcn/ui 2.3.0's `dialog` (MIT), built on Radix Dialog, and
 * rewritten onto CopaLibre's tokens. See THIRD_PARTY_NOTICES.md.
 *
 * Radix Dialog supplies focus trap, `aria-modal`, Escape handling and portal
 * rendering — exactly what a hand-built `role="dialog"` div (the previous
 * `InviteDialog` pattern) lacked (design.md Decision 5).
 */
import type { ReactNode } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';

export interface ModalProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: ModalProps): React.JSX.Element {
  return (
    <RadixDialog.Root onOpenChange={onOpenChange} open={open}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="cl-dialog-backdrop cl-modal__overlay" />
        <RadixDialog.Content className="cl-dialog-surface cl-chamfer cl-modal__content">
          <header className="cl-modal__header">
            <RadixDialog.Title className="cl-modal__title">{title}</RadixDialog.Title>
            {description ? (
              <RadixDialog.Description className="cl-modal__description">
                {description}
              </RadixDialog.Description>
            ) : null}
            <RadixDialog.Close asChild>
              <button aria-label="Close" className="cl-focusable cl-modal__close" type="button">
                ×
              </button>
            </RadixDialog.Close>
          </header>
          <div className="cl-modal__body">{children}</div>
          {footer ? <footer className="cl-modal__footer">{footer}</footer> : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
