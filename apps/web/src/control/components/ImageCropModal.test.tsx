import { jest } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ImageCropModal } from './ImageCropModal.js';
import type {
  BackgroundRemovalProgress,
  BackgroundRemovalTask,
} from '../lib/background-removal.js';
import { withIntl } from '../i18n/test-support.js';

type RemoveBackgroundFn = NonNullable<
  React.ComponentProps<typeof ImageCropModal>['removeBackground']
>;

async function confirmImageLoaded(): Promise<void> {
  const dialog = screen.getByRole('dialog');
  const img = await waitFor(() => {
    const el = dialog.querySelector('img');
    if (!el) throw new Error('cropper image not ready');
    return el;
  });
  fireEvent.load(img);
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

  it('shows progress while removal is running and frames the cropper once complete', async () => {
    let progressCallback: ((p: BackgroundRemovalProgress) => void) | undefined;
    let resolveResult!: (blob: Blob) => void;
    const mockTask: BackgroundRemovalTask = {
      result: new Promise((resolve) => {
        resolveResult = resolve;
      }),
      cancel: jest.fn(),
    };
    const mockRemove: jest.MockedFunction<RemoveBackgroundFn> = jest.fn((_file, options) => {
      progressCallback = options?.onProgress;
      return mockTask;
    });

    render(
      withIntl(
        <ImageCropModal
          imageSrc="blob:source"
          onCancel={jest.fn()}
          onConfirm={jest.fn()}
          removeBackground={mockRemove}
        />,
      ),
    );

    expect(screen.getByText('Removing image background…')).toBeDefined();
    const progress = screen.getByRole('progressbar');
    expect(progress.getAttribute('value')).toBe('0');

    await waitFor(() => expect(mockRemove).toHaveBeenCalled());
    act(() => {
      progressCallback?.({ key: 'isnet_quint8', current: 65, total: 100 });
    });
    expect(screen.getByText('65%')).toBeDefined();
    expect(progress.getAttribute('value')).toBe('65');

    act(() => {
      resolveResult(new Blob(['cutout'], { type: 'image/png' }));
    });

    const dialog = screen.getByRole('dialog');
    await waitFor(() => {
      expect(dialog.querySelector('.cl-image-frame')).not.toBeNull();
    });
    expect(dialog.classList.contains('cl-dialog-surface')).toBe(true);
  });

  it('calls onCancel and cancels removal when Cancel is clicked', async () => {
    const onCancel = jest.fn();
    const onConfirm = jest.fn();
    const mockCancel = jest.fn();
    const mockTask: BackgroundRemovalTask = {
      result: new Promise(() => {}),
      cancel: mockCancel,
    };
    const mockRemove: jest.MockedFunction<RemoveBackgroundFn> = jest.fn(() => mockTask);

    render(
      withIntl(
        <ImageCropModal
          imageSrc="blob:source"
          onCancel={onCancel}
          onConfirm={onConfirm}
          removeBackground={mockRemove}
        />,
      ),
    );

    await waitFor(() => expect(mockRemove).toHaveBeenCalled());
    fireEvent.click(screen.getByText('Cancel'));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(mockCancel).toHaveBeenCalledTimes(1);
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

    await confirmImageLoaded();
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

  it('updates the zoom and rotation controls as the user drags them', async () => {
    render(
      withIntl(
        <ImageCropModal imageSrc="blob:source" onCancel={jest.fn()} onConfirm={jest.fn()} />,
      ),
    );

    const zoom = (await screen.findByLabelText('Zoom')) as HTMLInputElement;
    const rotation = screen.getByLabelText('Rotation') as HTMLInputElement;

    fireEvent.change(zoom, { target: { value: '2' } });
    fireEvent.change(rotation, { target: { value: '90' } });

    expect(zoom.value).toBe('2');
    expect(rotation.value).toBe('90');
  });

  it('shows error state when removal fails, keeps confirm disabled without explicit choice', async () => {
    const mockTask: BackgroundRemovalTask = {
      result: Promise.reject(new Error('WASM failure')),
      cancel: jest.fn(),
    };
    const mockRemove: jest.MockedFunction<RemoveBackgroundFn> = jest.fn(() => mockTask);
    const onConfirm = jest.fn();

    render(
      withIntl(
        <ImageCropModal
          imageSrc="blob:source"
          onCancel={jest.fn()}
          onConfirm={onConfirm}
          removeBackground={mockRemove}
        />,
      ),
    );

    await screen.findByText(
      'Background removal failed. Retry or choose to keep the original image.',
    );
    expect((screen.getByText('Use image') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Keep original' })).toBeDefined();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('allows retrying when removal fails', async () => {
    let attempts = 0;
    const mockRemove: jest.MockedFunction<RemoveBackgroundFn> = jest.fn(() => {
      attempts++;
      if (attempts === 1) {
        return { result: Promise.reject(new Error('fail 1')), cancel: jest.fn() };
      }
      return {
        result: Promise.resolve(new Blob(['cutout-2'], { type: 'image/png' })),
        cancel: jest.fn(),
      };
    });

    render(
      withIntl(
        <ImageCropModal
          imageSrc="blob:source"
          onCancel={jest.fn()}
          onConfirm={jest.fn()}
          removeBackground={mockRemove}
        />,
      ),
    );

    await screen.findByText(
      'Background removal failed. Retry or choose to keep the original image.',
    );
    expect(mockRemove).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(mockRemove).toHaveBeenCalledTimes(2));
    await confirmImageLoaded();
    await waitFor(() =>
      expect((screen.getByText('Use image') as HTMLButtonElement).disabled).toBe(false),
    );
  });

  it('allows explicitly choosing to keep the original image when removal fails', async () => {
    const mockTask: BackgroundRemovalTask = {
      result: Promise.reject(new Error('Network error')),
      cancel: jest.fn(),
    };
    const mockRemove: jest.MockedFunction<RemoveBackgroundFn> = jest.fn(() => mockTask);
    const onConfirm = jest.fn();

    render(
      withIntl(
        <ImageCropModal
          imageSrc="blob:source"
          onCancel={jest.fn()}
          onConfirm={onConfirm}
          removeBackground={mockRemove}
        />,
      ),
    );

    await screen.findByText(
      'Background removal failed. Retry or choose to keep the original image.',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Keep original' }));

    await confirmImageLoaded();
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
  });
});
