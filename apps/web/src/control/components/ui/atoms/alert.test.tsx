import { render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { Alert } from './alert.js';

describe('the Alert atom', () => {
  it('announces a failure assertively, so it interrupts', () => {
    render(<Alert tone="destructive">Could not save</Alert>);
    expect(screen.getByRole('alert').textContent).toBe('Could not save');
  });

  it('announces everything else politely, using a role rather than a bare live region', () => {
    // A conditionally rendered `aria-live` region never announces: it has to
    // exist before its content changes. Every alert here appears *as* the
    // change, so the role is what makes it heard.
    render(<Alert tone="success">Saved</Alert>);
    expect(screen.getByRole('status').textContent).toBe('Saved');
  });

  it('lets a screen opt out when something else already announced the message', () => {
    const { container } = render(
      <Alert live="off" tone="info">
        Loading
      </Alert>,
    );
    expect(container.querySelector('[role]')).toBeNull();
  });

  it('carries a tone modifier for every tone except the default', () => {
    const { container: info } = render(<Alert tone="info">x</Alert>);
    const infoClasses = (info.firstChild as HTMLElement).className;
    expect(infoClasses).toContain('cl-inline-alert');
    expect(infoClasses).not.toContain('cl-inline-alert--');

    for (const tone of ['success', 'destructive', 'live'] as const) {
      const { container } = render(<Alert tone={tone}>x</Alert>);
      expect((container.firstChild as HTMLElement).className).toContain(`cl-inline-alert--${tone}`);
    }
  });

  it('renders a paragraph for a single line and a div once it carries structure', () => {
    // A `<p>`'s block margin is load-bearing on 59 existing call sites, and a
    // list may not be nested inside a paragraph — which three call sites need.
    const { container: plain } = render(<Alert tone="info">text</Alert>);
    expect(plain.firstChild?.nodeName).toBe('P');

    const { container: titled } = render(
      <Alert heading="Done" tone="success">
        <ul>
          <li>one</li>
        </ul>
      </Alert>,
    );
    expect(titled.firstChild?.nodeName).toBe('DIV');
    expect(titled.querySelector('ul')).not.toBeNull();
  });

  it('stacks itself when given a title, because a two-line alert is not a row', () => {
    const { container } = render(
      <Alert heading="Account ready" tone="success">
        Redirecting
      </Alert>,
    );
    expect((container.firstChild as HTMLElement).className).toContain('cl-inline-alert--stacked');
    expect(screen.getByText('Account ready').className).toBe('cl-inline-alert__title');
  });

  it('renders a dismiss control only when the caller supplies a handler', () => {
    const { rerender } = render(<Alert tone="info">x</Alert>);
    expect(screen.queryByRole('button')).toBeNull();

    const onDismiss = jest.fn();
    rerender(
      <Alert dismissLabel="Dismiss notification" onDismiss={onDismiss} tone="info">
        x
      </Alert>,
    );
    screen.getByRole('button', { name: 'Dismiss notification' }).click();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
