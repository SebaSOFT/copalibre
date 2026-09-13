/**
 * The one failure this seam has to report honestly.
 *
 * When the dev server is not running the frame is simply empty, which a
 * reviewer reads as a broken component rather than a missing process. The
 * unavailable state is what makes that distinction, so it is worth a test.
 */
import { jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import { AstroPreview } from './AstroPreview.js';

describe('AstroPreview', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('names the command to run when the dev server is absent', async () => {
    global.fetch = jest.fn<typeof fetch>().mockRejectedValue(new Error('connection refused'));

    render(<AstroPreview component="result-legend" />);

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('Preview unavailable');
    });
    // The reviewer needs the fix, not just the diagnosis.
    expect(screen.getByRole('status').textContent).toContain('yarn workspace @copalibre/web dev');
  });

  it('frames the real renderer once the server answers', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));

    render(<AstroPreview component="result-legend" locale="es" />);

    const frame = await screen.findByTitle('result-legend rendered by Astro');
    // The locale reaches the route, so a translated render is one control away.
    expect(frame.getAttribute('src')).toContain('locale=es');
    expect(frame.getAttribute('src')).toContain('/__preview/result-legend');
  });

  it('passes an identifier and a locale, never markup', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));

    render(<AstroPreview component="result-legend" />);

    const frame = await screen.findByTitle('result-legend rendered by Astro');
    const source = frame.getAttribute('src') ?? '';
    expect(new URL(source, 'http://localhost').searchParams.get('locale')).toBe('en');
    expect([...new URL(source, 'http://localhost').searchParams.keys()]).toEqual(['locale']);
  });

  it('reports an unknown component and recovers when the selection changes', async () => {
    global.fetch = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const { rerender } = render(<AstroPreview component="not-a-component" />);
    await screen.findByRole('status');
    rerender(<AstroPreview component="result-legend" />);
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(screen.getByTitle('result-legend rendered by Astro')).toBeDefined();
  });

  it('does not let a stale failed request replace the new selection', async () => {
    let rejectOld: (error: Error) => void = () => undefined;
    global.fetch = jest
      .fn<typeof fetch>()
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectOld = reject;
          }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const { rerender } = render(<AstroPreview component="not-a-component" />);
    rerender(<AstroPreview component="result-legend" locale="de" />);
    rejectOld(new Error('old request failed'));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByTitle('result-legend rendered by Astro').getAttribute('src')).toContain(
      'locale=de',
    );
  });
});
