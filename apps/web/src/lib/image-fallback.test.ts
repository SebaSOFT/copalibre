import { installImageFallback, resetImageFallbackForTests } from './image-fallback.ts';

function frame(): { image: HTMLImageElement; fallback: HTMLElement } {
  document.body.innerHTML =
    '<div><img data-image-fallback src="/missing.png" alt=""><span style="display: none">TLL</span></div>';
  const image = document.querySelector('img') as HTMLImageElement;
  const fallback = document.querySelector('span') as HTMLElement;
  return { image, fallback };
}

describe('image fallback without inline handlers', () => {
  beforeEach(() => resetImageFallbackForTests());

  it('swaps an image that fails after the listener is installed', () => {
    const { image, fallback } = frame();
    Object.defineProperty(image, 'complete', { value: false });
    installImageFallback();

    image.dispatchEvent(new Event('error'));

    expect(image.style.display).toBe('none');
    expect(fallback.style.display).toBe('');
  });

  it('swaps an image that had already failed when the module ran', () => {
    const { image, fallback } = frame();
    Object.defineProperty(image, 'complete', { value: true });
    Object.defineProperty(image, 'naturalWidth', { value: 0 });

    installImageFallback();

    expect(image.style.display).toBe('none');
    expect(fallback.style.display).toBe('');
  });

  it('leaves a loaded image and images without the marker alone', () => {
    document.body.innerHTML =
      '<img data-image-fallback src="/ok.png" alt=""><span style="display: none"></span><img src="/x.png" alt="">';
    const [loaded, unmarked] = [...document.querySelectorAll('img')] as HTMLImageElement[];
    Object.defineProperty(loaded, 'complete', { value: true });
    Object.defineProperty(loaded, 'naturalWidth', { value: 64 });
    installImageFallback();

    unmarked.dispatchEvent(new Event('error'));

    expect(loaded.style.display).toBe('');
    expect(unmarked.style.display).toBe('');
  });
});
