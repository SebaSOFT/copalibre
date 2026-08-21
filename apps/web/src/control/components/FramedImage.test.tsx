import { render, screen, fireEvent } from '@testing-library/react';
import { FramedImage } from './FramedImage.js';

describe('FramedImage', () => {
  it('renders the image inside the shared frame class when a src is given', () => {
    render(
      <FramedImage alt="Club emblem" placeholder={<span>placeholder</span>} src="/emblem.png" />,
    );

    const image = screen.getByAltText('Club emblem');
    expect(image.tagName).toBe('IMG');
    expect(image.getAttribute('src')).toBe('/emblem.png');
    expect(image.closest('.cl-image-frame')?.className).toContain('cl-image-frame--control');
    expect(screen.queryByText('placeholder')).toBeNull();
  });

  it('renders the placeholder inside the same frame class when there is no src', () => {
    render(
      <FramedImage alt="Club emblem" placeholder={<span>placeholder</span>} src={undefined} />,
    );

    const placeholder = screen.getByText('placeholder');
    expect(placeholder.closest('.cl-image-frame')?.className).toContain('cl-image-frame--control');
    expect(screen.queryByAltText('Club emblem')).toBeNull();
  });

  it('falls back to the placeholder once the image fails to load', () => {
    render(
      <FramedImage alt="Club emblem" placeholder={<span>placeholder</span>} src="/broken.png" />,
    );

    fireEvent.error(screen.getByAltText('Club emblem'));

    expect(screen.getByText('placeholder')).toBeTruthy();
    expect(screen.queryByAltText('Club emblem')).toBeNull();
  });

  it('sizes the frame from the size prop', () => {
    render(
      <FramedImage
        alt="Club emblem"
        placeholder={<span>placeholder</span>}
        size={32}
        src="/emblem.png"
      />,
    );

    const frame = screen.getByAltText('Club emblem').closest('.cl-image-frame') as HTMLElement;
    expect(frame.style.width).toBe('32px');
  });
});
