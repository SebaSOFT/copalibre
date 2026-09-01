import { jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ImageCropModal } from './ImageCropModal.js';
import { withIntl } from '../i18n/test-support.js';

function confirmImageLoaded(): void {
  const dialog = screen.getByRole('dialog');
  fireEvent.load(dialog.querySelector('img') as HTMLImageElement);
}

describe('ImageCropModal', () => {
  it('renders with dialog semantics, title, and close button', () => {
    render(
      withIntl(
        <ImageCropModal imageSrc="blob:source" onCancel={jest.fn()} onConfirm={jest.fn()} />,
      ),
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeDefined();
    expect(screen.getByText('Adjust image')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Close' })).toBeDefined();
  });

  it('calls onCancel and never onConfirm when Cancel is clicked', () => {
    const onCancel = jest.fn();
    const onConfirm = jest.fn();
    render(
      withIntl(<ImageCropModal imageSrc="blob:source" onCancel={onCancel} onConfirm={onConfirm} />),
    );

    fireEvent.click(screen.getByText('Cancel'));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('calls onCancel when close button is clicked', () => {
    const onCancel = jest.fn();
    const onConfirm = jest.fn();
    render(
      withIntl(<ImageCropModal imageSrc="blob:source" onCancel={onCancel} onConfirm={onConfirm} />),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('calls onCancel and never onConfirm on Escape', () => {
    const onCancel = jest.fn();
    const onConfirm = jest.fn();
    render(
      withIntl(<ImageCropModal imageSrc="blob:source" onCancel={onCancel} onConfirm={onConfirm} />),
    );

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape', code: 'Escape' });

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('keeps Confirm disabled until a crop area has been computed', () => {
    render(
      withIntl(
        <ImageCropModal imageSrc="blob:source" onCancel={jest.fn()} onConfirm={jest.fn()} />,
      ),
    );

    expect((screen.getByText('Use image') as HTMLButtonElement).disabled).toBe(true);
  });

  it('calls onConfirm with the cropped PNG output once Confirm is clicked, and never calls onCancel', async () => {
    const onCancel = jest.fn();
    const onConfirm = jest.fn();
    render(
      withIntl(<ImageCropModal imageSrc="blob:source" onCancel={onCancel} onConfirm={onConfirm} />),
    );

    confirmImageLoaded();
    await waitFor(() =>
      expect((screen.getByText('Use image') as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(screen.getByText('Use image'));

    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith({
        contentBase64: expect.any(String),
        contentType: 'image/png',
      }),
    );
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('updates the zoom and rotation controls as the user drags them', () => {
    render(
      withIntl(
        <ImageCropModal imageSrc="blob:source" onCancel={jest.fn()} onConfirm={jest.fn()} />,
      ),
    );

    const zoom = screen.getByLabelText('Zoom') as HTMLInputElement;
    const rotation = screen.getByLabelText('Rotation') as HTMLInputElement;

    fireEvent.change(zoom, { target: { value: '2' } });
    fireEvent.change(rotation, { target: { value: '90' } });

    expect(zoom.value).toBe('2');
    expect(rotation.value).toBe('90');
  });
});
