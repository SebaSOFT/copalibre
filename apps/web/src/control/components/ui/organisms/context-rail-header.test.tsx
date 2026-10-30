import { render, screen } from '@testing-library/react';
import { withIntl } from '../../../i18n/test-support.js';
import { ContextRailHeader } from './context-rail-header.js';

describe('ContextRailHeader', () => {
  it('shows a resolved display name without adding a page heading', () => {
    render(withIntl(<ContextRailHeader scope="tournament" name="Copa Premier" monogram="CP" />));

    expect(screen.getByText('Copa Premier')).toBeDefined();
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('keeps an unresolved context free of a visible alias and heading', () => {
    const { container } = render(
      withIntl(<ContextRailHeader scope="tournament" name={undefined} />),
    );

    expect(container.textContent).not.toContain('apertura-2026');
    expect(screen.queryByRole('heading')).toBeNull();
  });
});
