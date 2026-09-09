import { render, screen, fireEvent } from '@testing-library/react';
import { jest } from '@jest/globals';
import { CalloutBanner } from './CalloutBanner.js';

describe('the CalloutBanner molecule', () => {
  it('renders title, description and cyan vertical rail container', () => {
    const { container } = render(
      <CalloutBanner
        title="Operation Alert"
        description="Verify tournament seeds before bracket publish."
      />,
    );

    expect(screen.getByText('Operation Alert')).not.toBeNull();
    expect(screen.getByText('Verify tournament seeds before bracket publish.')).not.toBeNull();
    expect(container.firstChild).not.toBeNull();
  });

  it('triggers onAction callback when button is clicked', () => {
    const onActionMock = jest.fn();
    render(
      <CalloutBanner
        title="Seeding Open"
        description="Ready for generation."
        actionLabel="Generate Bracket"
        onAction={onActionMock}
      />,
    );

    const button = screen.getByRole('button', { name: /generate bracket/i });
    fireEvent.click(button);
    expect(onActionMock).toHaveBeenCalledTimes(1);
  });

  it('renders anchor element when actionHref is passed', () => {
    render(
      <CalloutBanner
        title="Ruleset Link"
        description="View official rules."
        actionLabel="Documentation"
        actionHref="https://copalibre.app/docs"
      />,
    );

    const link = screen.getByRole('link', { name: /documentation/i });
    expect(link.getAttribute('href')).toBe('https://copalibre.app/docs');
  });
});
