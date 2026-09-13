/**
 * Copied from shadcn/ui 2.3.0's `dropdown-menu` (MIT), built on Radix
 * DropdownMenu, and rewritten onto CopaLibre's tokens. See
 * THIRD_PARTY_NOTICES.md.
 *
 * Radix DropdownMenu supplies the menu semantics, roving arrow-key focus,
 * Escape handling, dismiss-on-outside-click, focus return to the trigger, and
 * portal rendering — the same reasons `modal.tsx` wraps Radix Dialog rather
 * than a hand-built `role="dialog"` div.
 */
import type { ReactNode } from 'react';
import * as RadixDropdownMenu from '@radix-ui/react-dropdown-menu';

export interface DropdownMenuItem {
  readonly id: string;
  readonly label: string;
  readonly onSelect: () => void;
  /** `destructive` carries the same tone the destructive button variants do. */
  readonly variant?: 'default' | 'destructive';
  readonly disabled?: boolean;
}

export interface DropdownMenuProps {
  /**
   * The control that opens the menu. Rendered through Radix's `asChild`, so it
   * keeps its own element and the menu's ARIA wiring is applied to it — which
   * includes naming the menu: Radix points the surface's `aria-labelledby` at
   * this trigger, so the trigger's own words are what a screen reader announces
   * and the menu needs no separate label.
   */
  readonly trigger: ReactNode;
  /**
   * A closed list rather than arbitrary children: a caller that can put any
   * markup inside a menu item is a caller that drifts off the token treatment,
   * which is the drift this library exists to prevent.
   */
  readonly items: readonly DropdownMenuItem[];
  readonly align?: 'start' | 'end';
  /**
   * Optional controlled state, the same option `Modal` offers. A caller that
   * needs to drive the menu — or a test that needs it open without simulating a
   * pointer through Radix — passes both; omitting them leaves Radix in charge.
   */
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
}

export function DropdownMenu({
  trigger,
  items,
  align = 'start',
  open,
  onOpenChange,
}: DropdownMenuProps): React.JSX.Element {
  return (
    <RadixDropdownMenu.Root
      {...(open === undefined ? {} : { open })}
      {...(onOpenChange === undefined ? {} : { onOpenChange })}
    >
      <RadixDropdownMenu.Trigger asChild>{trigger}</RadixDropdownMenu.Trigger>
      <RadixDropdownMenu.Portal>
        <RadixDropdownMenu.Content
          align={align}
          className="cl-dialog-surface cl-chamfer cl-dropdown-menu__content"
          sideOffset={4}
        >
          {items.map((item) => (
            <RadixDropdownMenu.Item
              className="cl-focusable cl-dropdown-menu__item"
              data-variant={item.variant ?? 'default'}
              disabled={item.disabled ?? false}
              key={item.id}
              onSelect={item.onSelect}
            >
              {item.label}
            </RadixDropdownMenu.Item>
          ))}
        </RadixDropdownMenu.Content>
      </RadixDropdownMenu.Portal>
    </RadixDropdownMenu.Root>
  );
}
