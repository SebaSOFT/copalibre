import { render, screen, fireEvent, act } from '@testing-library/react';
import { jest } from '@jest/globals';
import { TerminalBlock } from './terminal-block.js';

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

describe('the TerminalBlock file variant', () => {
  const YAML = 'services:\n  api:\n    image: ghcr.io/sebasoft/copalibre-api:latest\n';

  it('drops the window dots and the prompt, keeping the filename header', () => {
    render(<TerminalBlock code={YAML} language="yaml" title="compose.yaml" variant="file" />);
    expect(screen.queryByTestId('dot-red')).toBeNull();
    expect(screen.queryByText('$')).toBeNull();
    expect(screen.getByText('compose.yaml')).not.toBeNull();
  });

  it('leaves the terminal variant with the ornaments it had', () => {
    render(<TerminalBlock command="copalibre start" title="bash" />);
    expect(screen.getByTestId('dot-red')).not.toBeNull();
    expect(screen.getByText('$')).not.toBeNull();
  });

  it('copies the source exactly, newlines and indentation included', async () => {
    const writeText = jest.fn<() => Promise<void>>().mockResolvedValue();
    Object.assign(navigator, { clipboard: { writeText } });

    render(<TerminalBlock code={YAML} copyLabel="Copy file" title="compose.yaml" variant="file" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy file' }));
    });

    expect(writeText).toHaveBeenCalledWith(YAML);
  });

  it('reports success rather than leaving the reader guessing', async () => {
    const writeText = jest.fn<() => Promise<void>>().mockResolvedValue();
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      <TerminalBlock
        code={YAML}
        copiedLabel="Copied"
        copyLabel="Copy file"
        title="compose.yaml"
        variant="file"
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy file' }));
    });

    expect(screen.getAllByText('Copied').length).toBeGreaterThan(0);
  });

  it('reports a denied clipboard rather than failing silently', async () => {
    const writeText = jest
      .fn<() => Promise<void>>()
      .mockRejectedValue(new Error('NotAllowedError'));
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      <TerminalBlock
        code={YAML}
        copyFailedLabel="Copy failed"
        copyLabel="Copy file"
        title="compose.yaml"
        variant="file"
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy file' }));
    });

    expect(screen.getAllByText('Copy failed').length).toBeGreaterThan(0);
  });

  it('reports an absent clipboard the same way', async () => {
    Object.assign(navigator, { clipboard: undefined });

    render(
      <TerminalBlock
        code={YAML}
        copyFailedLabel="Copy failed"
        copyLabel="Copy file"
        title="compose.yaml"
        variant="file"
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy file' }));
    });

    expect(screen.getAllByText('Copy failed').length).toBeGreaterThan(0);
  });

  it('leaves the code as selectable text, so a page without JavaScript can be copied from', () => {
    const { container } = render(<TerminalBlock code={YAML} title="compose.yaml" variant="file" />);
    const pre = container.querySelector('pre');
    expect(pre?.textContent).toBe(YAML);
  });

  it('scrolls long lines inside its own labelled region rather than widening the page', () => {
    render(
      <TerminalBlock
        code={YAML}
        codeRegionLabel="compose.yaml contents"
        title="compose.yaml"
        variant="file"
      />,
    );
    const region = screen.getByRole('region', { name: 'compose.yaml contents' });
    expect(region.getAttribute('tabindex')).toBe('0');
  });
});
