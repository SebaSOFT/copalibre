# Handoff Prompt: Implementación del Pipeline OpenSpec (0280–0294)

## 1. Contexto del Proyecto y Estado Actual

- **Repositorio**: CopaLibre (`/Users/sebasoft/dev/git-repo/sebasoft/copalibre`)
- **Rama activa**: `develop`
- **Protocolo de trabajo mandatorio**: `.agent/skills/feature-delivery/SKILL.md` (un cambio OpenSpec por rama, verificación estricta de CI, PR individual, espera de aprobación de merge explícita, y posterior archivo + promoción de specs antes de tomar el siguiente cambio).
- **Herramientas de exploración y diseño**:
  - CodeGraph antes de grep/find (`codegraph_explore`).
  - Impeccable y OpenSpec (`openspec validate <change> --strict`).
  - Tokens de diseño normativos: `DESIGN.md`, `packages/design-tokens/src/generate/css.ts`.
  - Geometría de biselado: **SIN `clip-path`**, utilizando:
    ```css
    border-radius: 0 var(--cl-chamfer-size) 0 var(--cl-chamfer-size);
    corner-shape: square bevel square bevel;
    ```
  - Jerarquía cromática de una sola señal: Cyan `#00D4FF` (foco/acción/en vivo), Ámbar `#FF9C1E` (próximos/alertas), Verde `#22C55E` (concluidos/confirmación), Rojo `#EF4444` (disputa/error). Siempre emparejados con etiqueta de texto o ícono.

---

## 2. Inventario de Cambios OpenSpec Listos para Implementar

Se ha completado el barrido sobre las **15 superficies** de CopaLibre con datos reales (`torneo-apertura-2026`). Las 15 propuestas cuentan con `proposal.md`, `specs/`, y `tasks.md` validadas estrictamente con `openspec validate <change> --strict`:

### Lote 1 (Batch 1): Integridad de Dominio y Datos en Wire (Prioridad Crítica)

1. **`0282-seeding-builder-entrant-name-resolution`**
   - _Problema_: En `/stages/1/seeding`, los atletas/equipos se renderizan como UUIDs opacos (`01a0ac...`) en vez de sus nombres legibles.
   - _Solución_: Extender el endpoint de seeding para resolver y retornar los nombres mediante `EnrollmentRepository.resolveEntrantNames`.
2. **`0283-zone-group-roster-visibility-and-ui-alignment`**
   - _Problema_: En `/stages/1/zones`, `GroupResponse` no expone los IDs ni nombres de los participantes asignados a cada zona.
   - _Solución_: Agregar `entrantIds` / `entrants` al DTO de wire y contrato de grupos, y renderizar badges en la tarjeta del grupo.
3. **`0289-audit-trail-actor-resolution-and-diff-formatting`**
   - _Problema_: En `/control/[org]/audit-trail`, los actores de las firmas criptográficas se exponen como UUIDs crudos y las transiciones de estado como dumps de `JSON.stringify`.
   - _Solución_: Hidratar identificadores de usuario (email/alias) y formatear diffs en lenguaje estructurado.

### Lote 2 (Batch 2): Deuda de Component Ownership y Erradicación de Raw HTML

4. **`0287-resources-management-ui-ownership-and-spacing-alignment`**: Erradicar las **11 etiquetas `<label>` HTML crudas** en `VenueManagementTemplate.tsx` mediante `<FormRow>` y `<Label>`, reduciendo `KNOWN_RAW_ELEMENTS`.
5. **`0285-tournament-settings-plain-language-and-file-picker-i18n`**: Reemplazar `<input type="file">` por el átomo `<FilePicker>`, formatear reglas en lenguaje llano (`segments`, booleans, nulls) y adoptar `.cl-image-frame`.
6. **`0286-roles-permissions-ui-ownership-and-scope-placeholder-alignment`**: Reemplazar `<select>` e `<input>` nativos por átomos de `@copalibre/ui`.
7. **`0292-emblem-crop-modal-image-frame`**: Eliminar estilo inline `cropAreaStyle` en `ImageCropModal.tsx` adoptando `.cl-image-frame` y preservando sombra suspendida de diálogo.

### Lote 3 (Batch 3): Templates, Tokens, i18n y Superficies Públicas/TV

8. **`0280-control-dashboard-activity-and-device-alignment`**: Reemplazar clases manuales `.cl-card` por `<Card>`.
9. **`0281-match-console-localization-and-ledger-alignment`**: Aplicar `.cl-chamfer--control` a botones de eventos rápidos, `tabular-nums` en reloj y localizar filtros de categorías.
10. **`0284-promotion-plan-localization-and-entrant-names`**: Localizar cadenas de reglas de desempate a catálogos i18n.
11. **`0288-organization-settings-preferences-localization-and-ui-ownership`**: Agregar descriptores i18n a configuraciones de PAT y preferencias.
12. **`0290-analytics-dashboard-composition-and-kpi-expansion`**: Eliminar 5 estilos inline en `AnalyticsTemplate.tsx`, adoptar `ListScreenLayout` y token `.cl-stat-tile`.
13. **`0291-tournament-wizard-atomic-chamfers`**: Aplicar `.cl-chamfer--control` en los step badges de `WizardShell.tsx` y proxy de Vite.
14. **`0293-public-tournament-tabular-nums`**: Forzar `.cl-tabular-nums` en tablas de posiciones públicas y alternancia de bandas.
15. **`0294-tv-broadcast-high-contrast-scorebug`**: Enforce de pozos `ink-950` en marcadores de TV para asegurar contraste > 4.5:1 a 12 metros de distancia.

---

## 3. Instrucciones de Inicio para el Próximo Agente

1. **Revisar la Matriz de Gaps**:
   - Leer `docs/reviews/0225-audit-gap-matrix-consolidation.md` para entender el impacto global y los archivos involucrados.
2. **Commit Inicial de Housekeeping en `develop` (si corresponde)**:
   - Los archivos `packages/design-tokens/src/generate/css.ts`, `tokens.test.ts` (sintaxis `square bevel`) y `astro.config.mjs` (proxy `/disciplines`) fueron ajustados y sus tests pasan. Puedes comprometerlos como refactor base o incluirlos en el primer cambio.
3. **Comenzar con el Primer Cambio (Recomendado: `0282`)**:
   - Crear rama: `git checkout -b change/0282-seeding-builder-entrant-name-resolution develop`
   - Leer `openspec/changes/0282-seeding-builder-entrant-name-resolution/proposal.md` y `tasks.md`.
   - Implementar las tareas con CodeGraph.
   - Ejecutar la suite de validación:
     ```bash
     rtk err yarn typecheck
     rtk err yarn lint
     yarn workspace @copalibre/api test
     yarn workspace @copalibre/web test --testPathPatterns 'SeedingBuilder'
     openspec validate 0282-seeding-builder-entrant-name-resolution --strict
     ```
   - Al estar green: realizar commit con Conventional Commits (`feat(web): resolve entrant names in seeding builder [0282]`).
   - Pedir confirmación al usuario para el PR/Merge antes de archivar y continuar con `0283`.
