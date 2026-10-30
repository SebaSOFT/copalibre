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
