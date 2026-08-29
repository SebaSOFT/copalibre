---
title: Importar y exportar
description: Importación masiva de participantes por CSV, y exportación CSV/JSON de participantes, resultados, posiciones y configuración del torneo.
capabilities:
  - control-web/data-import-export
roles:
  - admin
---

## Importar

Los participantes se importan masivamente por CSV desde la pantalla de
[revisión de inscripciones](/help/control/registration-review). Cada fila se valida antes de escribir
nada: una fila que falla la validación se reporta con su número de fila y motivo, y ninguna fila se
importa hasta que el archivo completo se acepta, o se corrige y se vuelve a subir — un archivo
parcialmente importado no es un estado que produzca esta pantalla. Un CSV exportado antes desde esta
misma instalación se reimporta sin problemas, así que dar la vuelta a una lista de participantes
(editarla en una planilla, traerla de vuelta) es un camino soportado, no un accidente.

## Exportar

- **Participantes**: planteles individuales o de equipo, por alias — se llega desde
  [revisión de inscripciones](/help/control/registration-review).
- **Resultados y posiciones**: los resultados calculados y la tabla de posiciones de una etapa, por
  alias — se llega desde [posiciones](/help/control/standings).
- **Configuración del torneo**: el reglamento completo, las anulaciones y los scripts personalizados
  como JSON, desde el panel de la organización — el mismo documento que una instalación nueva podría
  reimportar para reproducir las reglas del torneo, no sus resultados.

Cada exportación reemplaza un identificador interno de la base de datos por el alias público de la
entidad, así un archivo exportado nunca filtra un identificador que nada fuera de la instalación
debería ver.

## Qué no podés hacer acá

Importar resultados o posiciones no está soportado — esos se calculan, no se cargan, y la única manera
de cambiar uno después es el [flujo de corrección auditada](/help/control/corrections).
