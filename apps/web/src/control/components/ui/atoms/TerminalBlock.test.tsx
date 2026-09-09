import { render, screen, fireEvent, act } from '@testing-library/react';
import { jest } from '@jest/globals';
import { TerminalBlock } from './TerminalBlock.js';

describe('the TerminalBlock atom', () => {
  it('renders title, macOS window dots, and command prompt', () => {
    render(<TerminalBlock title="install.sh" command="copalibre module install test" />);

    expect(screen.getByText('install.sh')).not.toBeNull();
    expect(screen.getByTestId('dot-red')).not.toBeNull();
    expect(screen.getByTestId('dot-yellow')).not.toBeNull();
    expect(screen.getByTestId('dot-green')).not.toBeNull();
    expect(screen.getByText('copalibre module install test')).not.toBeNull();
  });

  it('renders multi-line code without command prompt when code is provided', () => {
    render(<TerminalBlock title="config.yaml" code="key: value" language="yaml" />);

    expect(screen.getByText('config.yaml')).not.toBeNull();
    expect(screen.getByText('key: value')).not.toBeNull();
  });

  it('attempts to copy command to clipboard on button click', async () => {
    const writeTextMock = jest.fn<() => Promise<void>>().mockResolvedValue();
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });

    render(<TerminalBlock command="copalibre start" />);
    const copyButton = screen.getByRole('button', { name: /copy command/i });
    await act(async () => {
      fireEvent.click(copyButton);
    });

    expect(writeTextMock).toHaveBeenCalledWith('copalibre start');
  });
});
