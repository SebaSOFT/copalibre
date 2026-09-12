import {
  BUTTON_VARIANTS,
  CARD_STATES,
  CHECKBOX_TOKENS,
  RADIO_TOKENS,
  FILE_PICKER_TOKENS,
  INPUT_TOKENS,
  SELECT_TOKENS,
  TEXTAREA_TOKENS,
} from '../components.js';
import { CONTROL_DENSITY_SPACING, FONT_SIZE } from '../primitives.js';
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

  const formControls = (
    [
      ['input', INPUT_TOKENS],
      ['select', SELECT_TOKENS],
      ['textarea', TEXTAREA_TOKENS],
      ['checkbox', CHECKBOX_TOKENS],
      ['radio', RADIO_TOKENS],
      ['file-picker', FILE_PICKER_TOKENS],
    ] as const
  )
    .map(
      ([atom, states]) =>
        `<div class="swatch"><strong>${escape(atom)}</strong>${Object.keys(states)
          .map(
            (state) =>
              `<div class="cl-${escape(atom)}--${escape(state)} form-control-sample">${escape(state)}</div>`,
          )
          .join('\n          ')}</div>`,
    )
    .join('\n      ');

  const fontSizes = Object.keys(FONT_SIZE)
    .map(
      (name) =>
        `<div class="font-size-sample" data-font-size="${escape(name)}"><code>${escape(name)}</code><span style="font-size: var(--cl-font-size-${escape(name)})">CopaLibre Aa 0123</span></div>`,
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
    .font-size-sample { display: grid; grid-template-columns: 4rem 1fr;
                        align-items: baseline; gap: var(--cl-space-4); }
    /* The chamfer and its fallback, side by side: the point is the comparison. */
    .square { border-radius: 0; clip-path: none; }
    .form-control-sample { padding: var(--cl-space-2) var(--cl-space-3); border: 1px solid;
                            margin-block-start: var(--cl-space-1); }
    .density-demo { display: flex; flex-direction: column; }
    .density-demo > div { background: var(--cl-surface-chrome); padding: var(--cl-space-2); }
    .density-demo.marketing { gap: var(--cl-space-6); }
    .density-demo.control { gap: var(--cl-density-row-gap, var(--cl-space-2)); }
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
    <h2>Controles de formulario (atoms — 0141)</h2>
    <div class="row">
      ${formControls}
    </div>
  </section>

  <section>
    <h2>Diálogo (organism — 0141)</h2>
    <div class="row">
      <div class="cl-dialog-surface cl-chamfer" style="padding: var(--cl-space-4); width: 240px;">
        <p>Superficie del diálogo</p>
      </div>
      <div class="cl-dialog-backdrop" style="padding: var(--cl-space-4); width: 240px;">
        <p>Fondo del diálogo</p>
      </div>
    </div>
  </section>

  <section>
    <h2>Niveles de superficie y alternancia (0222)</h2>
    <div class="cl-band cl-chamfer" style="padding: var(--cl-space-4); margin-bottom: var(--cl-space-4); width: 100%;">
      <p>Banda nivel panel (base: <code>--cl-surface-panel</code>)</p>
      <div class="cl-card" style="padding: var(--cl-space-3);">
        <header class="cl-card__header" style="padding: var(--cl-space-2);">Cabecera chrome (<code>--cl-surface-chrome</code>)</header>
        <div class="cl-card__body" style="padding: var(--cl-space-2);">Cuerpo alternado (<code>--cl-surface-base</code>)</div>
      </div>
    </div>
    <div class="cl-band cl-band--base cl-chamfer" style="padding: var(--cl-space-4); width: 100%;">
      <p>Banda nivel base (base: <code>--cl-surface-base</code>)</p>
      <div class="cl-card" style="padding: var(--cl-space-3);">
        <header class="cl-card__header" style="padding: var(--cl-space-2);">Cabecera chrome (<code>--cl-surface-chrome</code>)</header>
        <div class="cl-card__body" style="padding: var(--cl-space-2);">Cuerpo alternado (<code>--cl-surface-panel</code>)</div>
      </div>
    </div>
  </section>

  <section>
    <h2>Densidad — marketing vs. Control-web</h2>
    <p>${Object.entries(CONTROL_DENSITY_SPACING)
      .map(([name, value]) => `<code>${escape(name)}: ${escape(value)}</code>`)
      .join(' &middot; ')}</p>
    <div class="row">
      <div class="density-demo marketing">
        <div>Sección</div>
        <div>Sección</div>
        <div>Sección</div>
      </div>
      <div data-density="control" class="density-demo control">
        <div>Sección</div>
        <div>Sección</div>
        <div>Sección</div>
      </div>
    </div>
  </section>

  <section>
    <h2>Plantillas (templates — 0141 / 0147)</h2>
    <div class="row">
      <div class="cl-list-screen cl-chamfer" style="width: 320px; padding: var(--cl-space-4); background: var(--cl-surface-panel);">
        <div class="cl-list-screen__header"><h3 class="cl-list-screen__title">Roles</h3></div>
        <div class="cl-list-screen__toolbar">Barra de herramientas</div>
        <div class="cl-list-screen__listing">Listado</div>
        <div class="cl-list-screen__pagination">Paginación</div>
      </div>
      <div class="cl-form-screen cl-chamfer" style="width: 320px; padding: var(--cl-space-4); background: var(--cl-surface-panel);">
        <div class="cl-form-screen__header"><h3 class="cl-form-screen__title">Nueva organización</h3></div>
        <div class="cl-form-screen__section">
          <h4 class="cl-form-screen__section-heading">Datos</h4>
          <div class="cl-form-screen__section-fields">Campos</div>
        </div>
        <div class="cl-form-screen__footer">Guardar</div>
      </div>
      <div class="cl-match-console-screen cl-chamfer" style="width: 320px; padding: var(--cl-space-4); background: var(--cl-surface-panel);">
        <div class="cl-match-console-screen__header"><h3 class="cl-match-console-screen__title">Mendoza vs San Juan</h3></div>
        <div class="cl-match-console-screen__scoreboard" style="padding: var(--cl-space-2);">Marcador</div>
        <div class="cl-match-console-screen__workspace">
          <div class="cl-match-console-screen__primary">Eventos</div>
          <div class="cl-match-console-screen__rail">Cronómetro</div>
        </div>
      </div>
    </div>
  </section>

  <section>
    <h2>Niveles de superficie — calibración 0220</h2>
    <p>
      El nivel de un contenedor sale de <strong>qué es</strong>, no de cuán profundo está.
      El contenido <strong>alterna</strong> contra la banda sobre la que se apoya; el cromo
      — cabecera, pie, chip, etiqueta — <strong>sube</strong> siempre al nivel de cromo.
      Cada límite lleva borde: dos niveles nunca se distinguen sólo por su relleno.
    </p>
    <p>
      Fuente: <code>../copalibre-app/src/components/ExplainableStandingsDemo.astro</code> pone su
      tarjeta en <code>ink-950</code> bajo una banda <code>ink-900</code>;
      <code>AuditedResultsDemo.astro</code> pone la misma forma en <code>ink-900</code> sobre una
      banda <code>ink-950</code>. La misma tarjeta es más clara sobre una banda oscura y más
      oscura sobre una clara, y por eso contar antepasados no alcanza.
    </p>
    <div class="cl-band" style="padding: var(--cl-space-4)">
      <p><code>.cl-band</code> — banda</p>
      <div class="cl-card cl-chamfer">
        <div class="cl-card__header"><strong>.cl-card__header</strong> — cromo, sube</div>
        <div class="cl-card__content">
          <p><code>.cl-card</code> dentro de <code>.cl-band</code> — baja</p>
          <div class="cl-row" style="padding: var(--cl-space-2)">.cl-row</div>
          <div class="cl-row--alt" style="padding: var(--cl-space-2)">.cl-row--alt</div>
        </div>
      </div>
    </div>
    <div class="cl-band--base" style="padding: var(--cl-space-4); margin-top: var(--cl-space-4)">
      <p><code>.cl-band--base</code> — banda oscura</p>
      <div class="cl-card cl-chamfer">
        <div class="cl-card__header"><strong>.cl-card__header</strong> — cromo, sube igual</div>
        <div class="cl-card__content"><p>La misma tarjeta, ahora más clara que su banda.</p></div>
      </div>
    </div>
    <p>
      Las filas son roles opacos, no un relleno translúcido sobre lo que haya detrás: así su
      contraste se verifica desde el token y no desde una composición.
    </p>
  </section>

  <section>
    <h2>Chaflán — familia y excepciones</h2>
    <p>
      El chaflán es una familia: el par diagonal por defecto, cada una de sus esquinas por
      separado, y la medida de control. Se expresa por esquina, con un nivel
      <code>@supports</code> para las formas largas antes del atajo, para que un navegador que
      sólo tiene las primeras siga biselando en vez de caer a escuadra. Nunca <code>clip-path</code>:
      recortaría el anillo de foco y el resplandor.
    </p>
    <div class="row">
      <div class="cl-card cl-chamfer" style="padding: var(--cl-space-3)"><code>.cl-chamfer</code></div>
      <div class="cl-card cl-chamfer-tr" style="padding: var(--cl-space-3)"><code>.cl-chamfer-tr</code></div>
      <div class="cl-card cl-chamfer-bl" style="padding: var(--cl-space-3)"><code>.cl-chamfer-bl</code></div>
      <div class="cl-card cl-chamfer cl-chamfer--control" style="padding: var(--cl-space-3)"><code>.cl-chamfer--control</code></div>
    </div>
    <p>
      <strong>Divergencia deliberada:</strong> el proyecto de referencia pinta las insignias a
      escuadra, sin clase de chaflán en ningún sitio de uso. CopaLibre corta en cambio el par
      izquierdo — a tamaño de insignia el par diagonal deja sus dos cortes en extremos opuestos de
      una etiqueta corta y se lee como una caja torcida, no como el motivo. Queda registrado aquí
      para que una revisión posterior lea una decisión y no una deriva.
    </p>
    <div class="row">
      <span class="cl-badge cl-badge--live">En vivo</span>
      <span class="cl-badge cl-badge--upcoming">Próximo</span>
    </div>
  </section>

  <section>
    <h2>Acción primaria — calibración 0220</h2>
    <p>
      <code>--cl-primary</code> quedó donde estaba: el control primario de la referencia se rellena
      con <code>--cl-state-live</code>, el mismo <code>cyan-400</code> del que ya partía. Leerlo del
      código y no muestrear una captura fue lo que lo resolvió — una muestra de región plana del
      mismo botón daba <code>#4CC8FC</code>, que es variación de pantalla, no intención.
    </p>
    <p>
      El hover sí necesitaba valor: la referencia aclara el relleno en vez de filtrarlo, así que
      <code>--cl-primary-hover</code> nombra ahora <code>cyan-300</code>. El primitivo
      <code>cyan-400</code> no se movió, porque también sostiene el estado en vivo y el anillo de
      foco: calibrar una llamada a la acción no puede reteñir cada insignia en vivo de tres
      superficies.
    </p>
  </section>

  <section>
    <h2>Previsualización de componentes servidos</h2>
    <p>
      Storybook no renderiza Astro. Un componente servido se revisa framando el renderizador real
      en <code>/__preview/&lt;id&gt;</code>, no imitando su marcado en React — una imitación
      coincide consigo misma dijera lo que dijera el original.
    </p>
    <p>En dos terminales, desde la raíz del repositorio:</p>
    <pre><code>yarn workspace @copalibre/web dev
yarn workspace @copalibre/web storybook</code></pre>
    <p>Storybook reenvía <code>/__preview</code> al servidor Astro en el puerto 4321.
      La barra de idiomas controla el idioma del componente; un idioma explícito en los argumentos
      de la historia tiene prioridad. Un error HTTP muestra el estado no disponible.</p>
    <p>
      La ruta sólo existe en desarrollo, sólo acepta identificadores de una lista y un idioma
      soportado, y nunca marcado. Sin el servidor, cada historia lo dice y nombra el comando.
    </p>
    <p>
      <strong>Pendiente para 0223:</strong> las composiciones — tabla de posiciones, etiquetas y
      leyenda de resultados, cinta, llave, cabecera pública móvil, tarjetas informativas y bloque de
      código con cabecera de archivo — junto con su adopción en superficies reales y la revisión de
      paridad. Esta mitad entrega los niveles, los roles, la tipografía, los datos de ejemplo y la
      costura que aquellas consumen.
    </p>
  </section>

  <section>
    <h2>Escala tipográfica</h2>
    <div>
      ${fontSizes}
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
