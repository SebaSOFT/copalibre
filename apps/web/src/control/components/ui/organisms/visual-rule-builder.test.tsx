import { render, screen } from '@testing-library/react';
import { withIntl } from '../../../i18n/test-support.js';
import { VisualRuleBuilder } from './visual-rule-builder.js';

describe('VisualRuleBuilder', () => {
  it('shows system-provided GIVEN context and WHEN/THEN blocks', () => {
    render(
      withIntl(
        <VisualRuleBuilder
          given={<span>Match event is recorded</span>}
          givenLabel="GIVEN"
          then={<span>Apply outcome</span>}
          thenLabel="THEN"
          when={<span>Condition</span>}
          whenLabel="WHEN"
        />,
      ),
    );

    expect(screen.getByRole('region', { name: 'GIVEN, WHEN, THEN' })).toBeTruthy();
    expect(screen.getByText('Match event is recorded')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'WHEN' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'THEN' })).toBeTruthy();
  });
});
