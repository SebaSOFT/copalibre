import { Button } from '../atoms/button.js';
import { LinkButton } from '../atoms/link-button.js';

export interface SectionTab {
  readonly id: string;
  readonly label: string;
  readonly href: string;
}

export interface SectionTabsProps {
  readonly ariaLabel: string;
  readonly tabs: readonly SectionTab[];
  readonly currentTabId: string;
}

/** Segmented route navigation for sections within one operator workspace. */
export function SectionTabs({
  ariaLabel,
  tabs,
  currentTabId,
}: SectionTabsProps): React.JSX.Element {
  return (
    <nav aria-label={ariaLabel} className="cl-section-tabs">
      <ul className="cl-section-tabs__list">
        {tabs.map((tab) => {
          const current = tab.id === currentTabId;
          return (
            <li key={tab.id}>
              <LinkButton
                aria-current={current ? 'page' : undefined}
                className="cl-section-tabs__link"
                href={tab.href}
                variant={current ? 'primary' : 'secondary'}
              >
                {tab.label}
              </LinkButton>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export interface SectionTabListTab {
  readonly id: string;
  readonly label: string;
}

export interface SectionTabListProps {
  readonly ariaLabel: string;
  /** Prefix for the generated `<prefix>-<id>-tab` and `<prefix>-<id>-panel` ids. */
  readonly idPrefix: string;
  readonly tabs: readonly SectionTabListTab[];
  readonly currentTabId: string;
  readonly onSelect: (id: string) => void;
}

function nextTabIndex(key: string, current: number, count: number): number {
  if (key === 'ArrowRight' || key === 'ArrowDown') return (current + 1) % count;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (current + count - 1) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return current;
}

/**
 * Segmented tabs for sections that switch in place, without a route change. The caller renders
 * the matching `role="tabpanel"` with the `<idPrefix>-<id>-panel` id and `aria-labelledby` the tab.
 */
export function SectionTabList({
  ariaLabel,
  idPrefix,
  tabs,
  currentTabId,
  onSelect,
}: SectionTabListProps): React.JSX.Element {
  return (
    <div
      aria-label={ariaLabel}
      className="cl-section-tabs cl-section-tabs__list"
      onKeyDown={(event) => {
        const current = tabs.findIndex((tab) => tab.id === currentTabId);
        const next = nextTabIndex(event.key, current, tabs.length);
        const nextTab = tabs[next];
        if (next === current || nextTab === undefined) return;
        event.preventDefault();
        onSelect(nextTab.id);
        document.getElementById(`${idPrefix}-${nextTab.id}-tab`)?.focus();
      }}
      role="tablist"
    >
      {tabs.map((tab) => {
        const selected = tab.id === currentTabId;
        return (
          <Button
            aria-controls={`${idPrefix}-${tab.id}-panel`}
            aria-selected={selected}
            id={`${idPrefix}-${tab.id}-tab`}
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            role="tab"
            tabIndex={selected ? 0 : -1}
            type="button"
            variant={selected ? 'primary' : 'secondary'}
          >
            {tab.label}
          </Button>
        );
      })}
    </div>
  );
}
