/**
 * The workbench half of the Astro preview seam.
 *
 * Frames `/__preview/<id>` from the running dev server. It passes an id and a
 * locale and nothing else — never markup — so what appears in the frame is the
 * production component rendered by the production renderer, not a React
 * approximation of it that would agree with itself no matter what shipped.
 *
 * When the dev server is not running the frame stays empty, which reads as a
 * broken component rather than a missing process. So this says which it is, and
 * names the command that fixes it.
 */
import { useEffect, useState } from 'react';

export interface AstroPreviewProps {
  /** An id the preview route allowlists. Anything else is a 404 by design. */
  readonly component: string;
  /** A supported interface language; the route falls back to `en`. */
  readonly locale?: string;
  /** Frame height in pixels. Width always fills the story canvas. */
  readonly height?: number;
}

export function AstroPreview({
  component,
  locale = 'en',
  height = 320,
}: AstroPreviewProps): React.JSX.Element {
  const source = `/__preview/${encodeURIComponent(component)}?locale=${encodeURIComponent(locale)}`;
  const [result, setResult] = useState<{ source: string; available: boolean }>();

  useEffect(() => {
    let cancelled = false;
    // Storybook proxies this bounded path to Astro. Same-origin requests let
    // us distinguish a real preview from a 404 or an unavailable upstream.
    fetch(source, { signal: AbortSignal.timeout(5000) })
      .then((response) => {
        if (!cancelled) setResult({ source, available: response.ok });
      })
      .catch(() => {
        if (!cancelled) setResult({ source, available: false });
      });
    return () => {
      cancelled = true;
    };
  }, [source]);

  if (result?.source === source && !result.available) {
    return (
      <div className="cl-card cl-chamfer" role="status">
        <p className="cl-card__title">Preview unavailable</p>
        <p className="cl-card__description">
          This component is server-rendered, so the workbench frames the real renderer rather than
          imitating it. Start the dev server and reload:
        </p>
        <pre className="cl-code" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          yarn workspace @copalibre/web dev
        </pre>
      </div>
    );
  }

  return (
    <iframe
      title={`${component} rendered by Astro`}
      src={`http://localhost:4321${source}`}
      width="100%"
      height={height}
      style={{
        border: '1px solid var(--cl-border-muted)',
        boxSizing: 'border-box',
        display: 'block',
        colorScheme: 'dark',
      }}
    />
  );
}
