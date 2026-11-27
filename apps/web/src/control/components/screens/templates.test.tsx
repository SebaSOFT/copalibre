import { render, screen } from '@testing-library/react';
import { withIntl } from '../../i18n/test-support.js';
import { ListWithRailTemplate } from './ListWithRailTemplate.js';
import { PageHeaderTemplate } from './PageHeaderTemplate.js';
import { WizardTemplate } from './WizardTemplate.js';
import { WorkspaceTemplate } from './WorkspaceTemplate.js';

describe('shared control layout templates', () => {
  it('renders page header and content slots', () => {
    const { container } = render(
      withIntl(
        <PageHeaderTemplate description="Page description" title="Page title">
          <p>Page content</p>
        </PageHeaderTemplate>,
      ),
    );

    expect(screen.getByRole('heading', { name: 'Page title' })).toBeDefined();
    expect(screen.getByText('Page description')).toBeDefined();
    expect(container.querySelector('.cl-page-header-template__content')?.textContent).toBe(
      'Page content',
    );
  });

  it('renders list, rail, and full-width footer slots', () => {
    const { container } = render(
      withIntl(
        <ListWithRailTemplate
          listLabel="Tournament list"
          listing={<p>List content</p>}
          rail={<p>Rail content</p>}
          railLabel="TV devices"
          footer={<p>Recent activity</p>}
          title="Dashboard"
        />,
      ),
    );

    expect(screen.getByRole('region', { name: 'Tournament list' }).textContent).toContain(
      'List content',
    );
    expect(screen.getByRole('complementary', { name: 'TV devices' }).textContent).toContain(
      'Rail content',
    );
    expect(container.querySelector('.cl-list-with-rail-template__footer')?.textContent).toBe(
      'Recent activity',
    );
  });

  it('renders both workspace panes with the selected split', () => {
    const { container } = render(
      withIntl(
        <WorkspaceTemplate
          primaryLabel="Schedule"
          primaryPane={<p>Schedule list</p>}
          secondaryLabel="Match details"
          secondaryPane={<p>Details form</p>}
          split="media-form"
          title="Workspace"
        />,
      ),
    );

    expect(screen.getByRole('region', { name: 'Schedule' }).textContent).toContain('Schedule list');
    expect(screen.getByRole('region', { name: 'Match details' }).textContent).toContain(
      'Details form',
    );
    expect(container.querySelector('[data-split="media-form"]')).not.toBeNull();
  });

  it('renders wizard step, content, and action slots', () => {
    render(
      withIntl(
        <WizardTemplate
          ariaLabel="Tournament setup"
          backLabel="Back"
          breadcrumb="Tournaments"
          currentStepId="details"
          onBack={() => undefined}
          primaryAction={{ label: 'Continue', disabled: false, onClick: () => undefined }}
          problems={[]}
          progress={50}
          progressTestId="wizard-progress"
          stepIndicatorVariant="plain"
          steps={[
            { id: 'format', label: 'Format' },
            { id: 'details', label: 'Details' },
          ]}
          stepsAriaLabel="Setup steps"
          title="Set up tournament"
        >
          <p>Step content</p>
        </WizardTemplate>,
      ),
    );

    expect(screen.getByRole('heading', { name: 'Set up tournament' })).toBeDefined();
    expect(screen.getByText('Step content')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDefined();
    expect(screen.getByText('Details')).toBeDefined();
  });
});
