import { BUTTON_VARIANTS, CARD_STATES } from '../components.js';
import { SEMANTIC_COLORS } from '../semantic.js';

/**
 * The style guide, generated from the same tokens it documents.
 *
 * A hand-written page would drift from the tokens the moment one changed, and
 * the page whose job is to show what the tokens look like would be the last
 * place anyone noticed.
 *
 * Emitted as one self-contained file so it can be opened from disk, served by
 * any surface, and screenshotted by a visual-regression job that does not need
 * an application running.
 */
export function generateStyleGuide(cssHref = './copalibre.css'): string {
  const badges = CARD_STATES.map((state) => {
    const label = SEMANTIC_COLORS[state].nonColourCue;
    return `<span class="cl-badge" style="color: var(--cl-${state})">${escape(label)}</span>`;
  }).join('\n      ');

  const cards = CARD_STATES.map(
    (state) => `<article class="cl-card cl-card--${state.replace('state-', '')} cl-chamfer">
        <h3>${escape(SEMANTIC_COLORS[state].purpose)}</h3>
        <p>${escape(SEMANTIC_COLORS[state].nonColourCue)}</p>
      </article>`,
  ).join('\n      ');

  const buttons = Object.keys(BUTTON_VARIANTS)
    .map(
      (variant) =>
        `<button class="cl-btn cl-btn--${variant} cl-focusable cl-chamfer">${escape(variant)}</button>`,
    )
    .join('\n      ');

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>CopaLibre — guía de estilos</title>
  <link rel="stylesheet" href="${escape(cssHref)}" />
  <style>
    body { background: var(--cl-surface-base); color: var(--cl-text-primary);
           font-family: var(--cl-font-body); margin: 0; padding: var(--cl-space-6); }
    h1, h2 { font-family: var(--cl-font-display); text-transform: uppercase; }
    section { margin-block-end: var(--cl-space-12); }
    .row { display: flex; flex-wrap: wrap; gap: var(--cl-space-4); }
    .swatch { width: 120px; padding: var(--cl-space-2); border: 1px solid var(--cl-border-muted); }
    .swatch__chip { height: 48px; }
    /* The chamfer and its fallback, side by side: the point is the comparison. */
    .square { border-radius: 0; clip-path: none; }
  </style>
</head>
<body>
  <h1>CopaLibre</h1>

  <section>
    <h2>Estados</h2>
    <div class="row">
      ${badges}
    </div>
  </section>

  <section>
    <h2>Tarjetas</h2>
    <div class="row">
      ${cards}
    </div>
  </section>

  <section>
    <h2>Botones</h2>
    <div class="row">
      ${buttons}
    </div>
  </section>

  <section>
    <h2>Alerta y estadística</h2>
    <div class="row">
      <div class="cl-inline-alert cl-chamfer"><strong>Atención</strong> — el partido está demorado.</div>
      <div class="cl-stat-tile cl-chamfer">
        <div class="cl-stat-tile__value">128</div>
        <div>Partidos jugados</div>
      </div>
    </div>
  </section>

  <section>
    <h2>Bisel y respaldo cuadrado</h2>
    <div class="row">
      <div class="cl-card cl-card--live cl-chamfer">Con bisel</div>
      <div class="cl-card cl-card--live square">Sin soporte</div>
    </div>
  </section>

  <section>
    <h2>Paleta</h2>
    <div class="row">
      ${Object.entries(SEMANTIC_COLORS)
        .map(
          ([name]) =>
            `<div class="swatch"><div class="swatch__chip" style="background: var(--cl-${name})"></div><code>${escape(name)}</code></div>`,
        )
        .join('\n      ')}
    </div>
  </section>
</body>
</html>
`;
}

function escape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
