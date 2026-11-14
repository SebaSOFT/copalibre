/**
 * An information icon, or a short text, that opens a short explanation, built on Radix Popover.
 *
 * Radix supplies the dismissal, the focus return and the collision handling,
 * the same reasons `modal.tsx` wraps Radix Dialog. An atom holds no i18n, so the
 * caller supplies the icon's accessible name.
 *
 * The content is text, so focus stays on the trigger when it opens: Escape still
 * closes it, and a hover never pulls focus away from what the person is doing.
 */
import * as RadixPopover from '@radix-ui/react-popover';
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { Icon } from './icon.js';

/** Long enough to cross the gap between the trigger and the surface. */
const HOVER_CLOSE_DELAY_MS = 120;

export interface PopoverProps {
  /** The icon's accessible name, which also names the surface. */
  readonly triggerLabel: string;
  readonly children: ReactNode;
  readonly tone?: 'default' | 'error';
  /** Also opens under a mouse pointer. Touch and keyboard are unaffected. */
  readonly openOnHover?: boolean;
  /**
   * Shows this text as the trigger instead of the information icon, such as a venue's name that
   * opens its details. The visible text then names the trigger; `triggerLabel` still names the
   * surface.
   */
  readonly triggerText?: string;
}

export function Popover({
  triggerLabel,
  children,
  tone = 'default',
  openOnHover = false,
  triggerText,
}: PopoverProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const openedByHover = useRef(false);
  const closedByHover = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const cancelClose = (): void => clearTimeout(closeTimer.current);
  useEffect(() => cancelClose, []);

  const hoverIn = (event: PointerEvent): void => {
    if (!openOnHover || event.pointerType !== 'mouse') return;
    cancelClose();
    if (open) return;
    openedByHover.current = true;
    setOpen(true);
  };
  const hoverOut = (event: PointerEvent): void => {
    if (!openOnHover || event.pointerType !== 'mouse' || !openedByHover.current) return;
    closeTimer.current = setTimeout(() => {
      openedByHover.current = false;
      closedByHover.current = true;
      setOpen(false);
    }, HOVER_CLOSE_DELAY_MS);
  };

  return (
    <RadixPopover.Root
      onOpenChange={(next) => {
        openedByHover.current = false;
        setOpen(next);
      }}
      open={open}
    >
      <RadixPopover.Trigger
        {...(triggerText === undefined ? { 'aria-label': triggerLabel } : {})}
        className={`cl-popover__trigger cl-focusable${triggerText === undefined ? '' : ' cl-popover__trigger--text'}`}
        data-tone={tone}
        // A click on a hover-opened popover keeps it open, instead of closing
        // what the person is reading. Radix skips its toggle on `preventDefault`.
        onClick={(event) => {
          if (!openedByHover.current) return;
          event.preventDefault();
          cancelClose();
          openedByHover.current = false;
        }}
        onPointerEnter={hoverIn}
        onPointerLeave={hoverOut}
        type="button"
      >
        {triggerText ?? <Icon name="info" size={16} />}
      </RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content
          aria-label={triggerLabel}
          className="cl-dialog-surface cl-chamfer--control cl-popover__content"
          collisionPadding={8}
          data-tone={tone}
          onCloseAutoFocus={(event) => {
            if (closedByHover.current) event.preventDefault();
            closedByHover.current = false;
          }}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onPointerEnter={hoverIn}
          onPointerLeave={hoverOut}
          sideOffset={6}
        >
          {children}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}
