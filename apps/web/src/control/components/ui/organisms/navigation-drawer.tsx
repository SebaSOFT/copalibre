import type { ReactNode } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';

export interface NavigationDrawerProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly children: ReactNode;
  /**
   * Required: the close control was the literal Spanish `"Cerrar menú"` for
   * every viewer, in every one of the eight interface languages.
   */
  readonly closeLabel: string;
}

/**
 * Mobile navigation drawer organism built on Radix Dialog.
 * Provides accessible focus trap, Escape key handling, and slide-in panel
 * for mobile viewports (<= 767px).
 */
export function NavigationDrawer({
  open,
  onOpenChange,
  title,
  children,
  closeLabel,
}: NavigationDrawerProps): React.JSX.Element {
  return (
    <RadixDialog.Root onOpenChange={onOpenChange} open={open}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="cl-dialog-backdrop cl-drawer__overlay" />
        <RadixDialog.Content
          aria-describedby={undefined}
          className="cl-dialog-surface cl-drawer__content"
        >
          <header className="cl-drawer__header">
            <RadixDialog.Title className="cl-drawer__title">{title}</RadixDialog.Title>
            <RadixDialog.Close asChild>
              <button
                aria-label={closeLabel}
                className="cl-focusable cl-drawer__close"
                type="button"
              >
                ×
              </button>
            </RadixDialog.Close>
          </header>
          <div className="cl-drawer__body">{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
