import { act, fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { CopyIdButton } from './copy-id-button.js';

describe('CopyIdButton', () => {
  const labels = {
    label: 'Copy ID',
    copiedLabel: 'ID copied',
    failedLabel: 'Could not copy ID',
  };

  it('copies the identifier only after the operator activates the button', async () => {
    const writeText = jest.fn<() => Promise<void>>().mockResolvedValue();
    Object.assign(navigator, { clipboard: { writeText } });

    render(<CopyIdButton {...labels} value="018f06f4-3d70-7000-8000-000000000001" />);

    expect(writeText).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy ID' }));
    });

    expect(writeText).toHaveBeenCalledWith('018f06f4-3d70-7000-8000-000000000001');
    expect(screen.getByRole('status').textContent).toBe('ID copied');
  });

  it('announces clipboard failures and supports a contextual label', async () => {
    const writeText = jest.fn<() => Promise<void>>().mockRejectedValue(new Error('denied'));
    Object.assign(navigator, { clipboard: { writeText } });

    render(<CopyIdButton {...labels} label="Copy actor ID" value="actor-1" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy actor ID' }));
    });

    expect(screen.getByRole('status').textContent).toBe('Could not copy ID');
  });
});
