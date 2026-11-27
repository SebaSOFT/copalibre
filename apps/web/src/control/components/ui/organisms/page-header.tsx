import { createContext, useContext, type ReactNode } from 'react';
import { Skeleton } from '../atoms/skeleton.js';

export interface PageHeaderBreadcrumb {
  readonly label: string;
  readonly href?: string;
  readonly current?: boolean;
  readonly loading?: boolean;
}

export interface PageHeaderContextValue {
  readonly organizationAlias?: string;
  readonly organizationName?: string;
  readonly organizationNameFallback?: string;
  readonly organizationTimeZone?: string;
  readonly organizationNameLoading?: boolean;
  readonly tournamentAlias?: string;
  readonly tournamentName?: string;
  readonly tournamentNameFallback?: string;
  readonly tournamentNameLoading?: boolean;
  readonly breadcrumbLabel: string;
  readonly loadingLabel: string;
}

export const PageHeaderContext = createContext<PageHeaderContextValue | undefined>(undefined);

export interface PageHeaderProps {
  readonly title?: ReactNode | null;
  readonly breadcrumbs?: readonly PageHeaderBreadcrumb[];
  /** Compatibility for screens still building their breadcrumb as React nodes. */
  readonly legacyBreadcrumb?: ReactNode;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
  readonly titleClassName?: string;
  readonly className?: string;
  readonly loadingLabel?: string;
  readonly breadcrumbLabel?: string;
}

function isMissingPageHeaderTitle(title: ReactNode | null | undefined): boolean {
  return (
    title === null || title === undefined || (typeof title === 'string' && title.trim() === '')
  );
}

function resolveBreadcrumbName(
  name: string | undefined,
  fallback: string | undefined,
  loading: boolean | undefined,
): string | undefined {
  return name?.trim() || (loading ? undefined : fallback);
}

function organizationBreadcrumb(
  context: PageHeaderContextValue | undefined,
  label: string | undefined,
): PageHeaderBreadcrumb | undefined {
  if (!context?.organizationAlias || !label) return undefined;
  return {
    label,
    href: `/control/${encodeURIComponent(context.organizationAlias)}`,
  };
}

function tournamentBreadcrumb(
  context: PageHeaderContextValue | undefined,
  label: string | undefined,
): PageHeaderBreadcrumb | undefined {
  if (!context?.organizationAlias || !context.tournamentAlias || !label) return undefined;
  return {
    label,
    href: `/control/${encodeURIComponent(context.organizationAlias)}/tournaments/${encodeURIComponent(context.tournamentAlias)}`,
  };
}

function PageHeaderBreadcrumbs({
  context,
  breadcrumbs,
  legacyBreadcrumb,
  title,
  loadingLabel,
  breadcrumbLabel,
}: {
  readonly context: PageHeaderContextValue | undefined;
  readonly breadcrumbs?: readonly PageHeaderBreadcrumb[];
  readonly legacyBreadcrumb?: ReactNode;
  readonly title?: ReactNode | null;
  readonly loadingLabel: string;
  readonly breadcrumbLabel: string;
}): React.JSX.Element | null {
  const organizationName = resolveBreadcrumbName(
    context?.organizationName,
    context?.organizationNameFallback,
    context?.organizationNameLoading,
  );
  const tournamentName = resolveBreadcrumbName(
    context?.tournamentName,
    context?.tournamentNameFallback,
    context?.tournamentNameLoading,
  );
  const organizationCrumb = organizationBreadcrumb(context, organizationName);
  const tournamentCrumb = tournamentBreadcrumb(context, tournamentName);
  const hasOrganizationBreadcrumb =
    organizationCrumb !== undefined &&
    (breadcrumbs ?? []).some((item) => item.label === organizationCrumb.label);
  const hasTournamentBreadcrumb =
    tournamentCrumb !== undefined &&
    (breadcrumbs ?? []).some((item) => item.label === tournamentCrumb.label);
  const organizationNamePending =
    context?.organizationNameLoading ??
    (context?.organizationAlias !== undefined &&
      context.organizationName === undefined &&
      !hasOrganizationBreadcrumb);
  const tournamentNamePending = context?.tournamentNameLoading === true && !hasTournamentBreadcrumb;
  const contextualBreadcrumbs: readonly PageHeaderBreadcrumb[] = [
    ...(!hasOrganizationBreadcrumb && organizationCrumb ? [organizationCrumb] : []),
    ...(!hasTournamentBreadcrumb && tournamentCrumb ? [tournamentCrumb] : []),
    ...(breadcrumbs ?? []),
  ];

  if (contextualBreadcrumbs.length > 0 || organizationNamePending || tournamentNamePending) {
    return (
      <nav aria-label={breadcrumbLabel} className="cl-page-header__breadcrumb">
        <ol>
          {organizationNamePending && (
            <li>
              <Skeleton
                className="cl-page-header__breadcrumb-skeleton"
                label={loadingLabel}
                variant="line"
              />
            </li>
          )}
          {tournamentNamePending && (
            <li>
              <Skeleton
                className="cl-page-header__breadcrumb-skeleton"
                label={loadingLabel}
                variant="line"
              />
            </li>
          )}
          {contextualBreadcrumbs.map((item, index) => (
            <li key={`${index}:${item.label}`}>
              {item.loading ? (
                <Skeleton
                  className="cl-page-header__breadcrumb-skeleton"
                  label={loadingLabel}
                  variant="line"
                />
              ) : item.href && !item.current ? (
                <a href={item.href}>{item.label}</a>
              ) : (
                <span aria-current={item.current ? 'page' : undefined}>{item.label}</span>
              )}
            </li>
          ))}
          {!contextualBreadcrumbs.some((item) => item.current) && (
            <li>
              <span aria-current="page">{title}</span>
            </li>
          )}
        </ol>
      </nav>
    );
  }

  if (context?.organizationAlias === undefined && legacyBreadcrumb) {
    return <div className="cl-page-header__breadcrumb">{legacyBreadcrumb}</div>;
  }

  return null;
}

export function PageHeader({
  title,
  breadcrumbs,
  legacyBreadcrumb,
  description,
  actions,
  titleClassName,
  className = '',
  loadingLabel,
  breadcrumbLabel,
}: PageHeaderProps): React.JSX.Element {
  const context = useContext(PageHeaderContext);
  const resolvedLoadingLabel = loadingLabel ?? context?.loadingLabel ?? 'Loading page heading';
  const resolvedBreadcrumbLabel = breadcrumbLabel ?? context?.breadcrumbLabel ?? 'Breadcrumb';

  if (isMissingPageHeaderTitle(title)) {
    return (
      <header className={`cl-page-header ${className}`.trim()}>
        <div className="cl-page-header__row">
          <h1 className={`cl-page-header__title ${titleClassName ?? ''}`.trim()}>
            <Skeleton
              className="cl-page-header__title-skeleton"
              label={resolvedLoadingLabel}
              variant="line"
            />
          </h1>
          {actions ? <div className="cl-page-header__actions">{actions}</div> : null}
        </div>
      </header>
    );
  }

  return (
    <header className={`cl-page-header ${className}`.trim()}>
      <PageHeaderBreadcrumbs
        breadcrumbLabel={resolvedBreadcrumbLabel}
        breadcrumbs={breadcrumbs}
        context={context}
        legacyBreadcrumb={legacyBreadcrumb}
        loadingLabel={resolvedLoadingLabel}
        title={title}
      />
      <div className="cl-page-header__row">
        <div className="cl-page-header__content">
          <h1 className={`cl-page-header__title ${titleClassName ?? ''}`.trim()}>{title}</h1>
          {description ? <p className="cl-page-header__description">{description}</p> : null}
        </div>
        {actions ? <div className="cl-page-header__actions">{actions}</div> : null}
      </div>
    </header>
  );
}
