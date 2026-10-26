import { render, screen } from '@testing-library/react';
import { PageHeader, PageHeaderContext } from './page-header.js';

describe('PageHeader', () => {
  it('renders display breadcrumbs, one page heading, and actions', () => {
    render(
      <PageHeader
        actions={<button type="button">Create stage</button>}
        breadcrumbLabel="Breadcrumb"
        breadcrumbs={[
          { label: 'Panamericano', href: '/control/panamericano-demo' },
          { label: 'Stages', current: true },
        ]}
        loadingLabel="Loading page heading"
        title="Stage 1"
      />,
    );

    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Panamericano' }).getAttribute('href')).toBe(
      '/control/panamericano-demo',
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Stage 1' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Create stage' })).toBeDefined();
  });

  it('shows a skeleton instead of an unresolved alias or empty heading', () => {
    render(
      <PageHeader
        breadcrumbLabel="Breadcrumb"
        breadcrumbs={[{ label: 'panamericano-demo' }]}
        loadingLabel="Loading page heading"
        title={null}
      />,
    );

    expect(screen.getByRole('heading', { level: 1 })).toBeDefined();
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByText('panamericano-demo')).toBeNull();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('keeps organization aliases hidden until the display name resolves', () => {
    render(
      <PageHeaderContext.Provider
        value={{
          organizationAlias: 'panamericano-demo',
          breadcrumbLabel: 'Breadcrumb',
          loadingLabel: 'Loading page heading',
        }}
      >
        <PageHeader title="Dashboard" />
      </PageHeaderContext.Provider>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeDefined();
    expect(
      screen.getByRole('navigation', { name: 'Breadcrumb' }).querySelector('[role="status"]'),
    ).not.toBeNull();
    expect(screen.queryByText('panamericano-demo')).toBeNull();
  });

  it('ends the organization breadcrumb loading state when lookup settles without a display name', () => {
    render(
      <PageHeaderContext.Provider
        value={{
          organizationAlias: 'panamericano-demo',
          organizationNameLoading: false,
          breadcrumbLabel: 'Breadcrumb',
          loadingLabel: 'Loading page heading',
        }}
      >
        <PageHeader title="Dashboard" />
      </PageHeaderContext.Provider>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeDefined();
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText('panamericano-demo')).toBeNull();
  });

  it('shows a loading breadcrumb until its display name resolves', () => {
    render(
      <PageHeaderContext.Provider
        value={{
          organizationAlias: 'panamericano-demo',
          organizationName: 'Panamericano Demo',
          breadcrumbLabel: 'Breadcrumb',
          loadingLabel: 'Loading page heading',
        }}
      >
        <PageHeader
          breadcrumbs={[{ label: 'panamericano-clubes-2025', loading: true }]}
          title="Match operations"
        />
      </PageHeaderContext.Provider>,
    );

    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByText('panamericano-clubes-2025')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Match operations' })).toBeDefined();
  });
});
