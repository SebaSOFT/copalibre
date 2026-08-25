import { render } from '@testing-library/react';
import { ControlShell } from './ControlShell.js';

describe('the Control-web data-density scope (0141)', () => {
  it('mounts data-density="control" at the shell root, scoping the denser spacing composition', () => {
    const { container } = render(
      <ControlShell active="tournaments" helpPath="tournaments">
        <p>Contenido</p>
      </ControlShell>,
    );
    expect(container.querySelector('[data-density="control"]')).not.toBeNull();
  });
});
