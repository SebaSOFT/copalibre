import { render } from '@testing-library/react';
import { Container, type ContainerVariant } from './container.js';

describe('Container', () => {
  it.each<ContainerVariant>(['control', 'form'])('applies the %s width variant', (variant) => {
    const { container } = render(<Container variant={variant}>content</Container>);

    expect(container.firstElementChild?.getAttribute('class')).toBe(
      `cl-container cl-container--${variant}`,
    );
  });

  it('forwards attributes and appends a caller class', () => {
    const { container } = render(
      <Container
        aria-label="Main content"
        className="page-content"
        data-testid="container"
        variant="form"
      >
        content
      </Container>,
    );
    const element = container.firstElementChild as HTMLElement;

    expect(element.getAttribute('aria-label')).toBe('Main content');
    expect(element.getAttribute('data-testid')).toBe('container');
    expect(element.getAttribute('class')).toBe('cl-container cl-container--form page-content');
  });
});
