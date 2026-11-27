---
title: Superficies de transmisión y públicas
description: Tokens de display para pantallas de TV en sede y overlays de streaming, y qué ve un espectador en el sitio público.
capabilities:
  - live-operations/broadcast-tv-surfaces
  - live-operations/tv-dashboard-localization
  - live-operations/public-live-surfaces
  - public-web/public-web-shell
roles:
  - broadcaster
  - admin
---

## Tokens de display

Una ruta `/tv/**` — una pantalla en rotación completa o un partido fijo, ya sea como página normal o
como `?mode=overlay` transparente para captura por chroma-key en un stream — se autoriza con un token de
display propio del dispositivo, no con el login de una persona. El token se emite desde el panel de la
organización, queda atado a una ruta `/tv/**` específica y se puede revocar por separado: revocar el
token de un dispositivo detiene solo ese dispositivo, y ningún otro dispositivo ni sesión de ninguna
persona se ve afectada.

Un dispositivo con un token válido no necesita a nadie presente para seguir funcionando. Sobrevive a un
corte de energía sin volver a pedir credenciales, y se recupera en silencio de una conexión perdida o
datos no disponibles — una superficie `/tv/**` nunca muestra un error que una persona tendría que
cerrar.

## Estudio de transmisión

`/control/<organization>/tournaments/<tournament>/broadcaster` es una consola de autoservicio para
un streamer u operador de medios: emite tu propio token de display automáticamente, te deja elegir
el modo de superposición (una franja inferior sobre tu cámara, o una escena de pantalla completa
sin cámara) y un fondo de vista previa (transparente, croma verde, croma magenta o un fondo oscuro
de estadio), y te da una URL lista para pegar en OBS Browser Source con vista previa en vivo —
ningún administrador tiene que darte un token ni compartir su propia sesión. Mientras esa
superposición está abierta, un gol, punto o tarjeta registrado en vivo muestra un aviso animado con
el nombre del equipo y el jugador, y se cierra solo — nunca necesita que alguien en la sede lo
dispare o lo cierre.

## Qué muestra la pantalla del recinto

La pantalla en rotación completa recorre la tabla de posiciones, los destacados, las estadísticas del torneo y, cuando la fase destacada la tiene, la llave y luego la lista de partidos. Una dirección con `?view=standings` o `?view=matches` fija esa sección a pantalla completa en lugar de rotar (`?view=fixtures` sigue funcionando como el nombre anterior de `matches`). El recapitulativo de campeón de un torneo finalizado pertenece solo a la pantalla en rotación. El encabezado nombra el estado del torneo (programado, en vivo, en progreso o finalizado) y muestra el reloj en la zona horaria de la organización.

Un partido fijado — `/tv/<organización>/tournaments/<torneo>/stages/<fase>/matches/<número>` — se identifica como en la página pública del partido, por su número dentro de la fase, y siempre muestra su resultado, sus lados y sus eventos registrados, esté o no finalizado. Un número que la fase no tiene se informa como un partido que no existe.

Una fase puede mezclar formatos, así que la pantalla presenta cada zona según el formato que juega:

- **Posiciones**: Cada zona que ordena participantes en una tabla tiene su propia tabla, encabezada con el nombre de la zona. Las filas de zonas distintas nunca se mezclan en un mismo orden, y en la rotación completa y en una vista fija de posiciones cada tabla recorre todas sus filas, mientras que el diseño de presentación muestra hasta ocho filas a la vez. Una fase cuyas zonas juegan todas el formato de la fase conserva una sola tabla sin encabezado.
- **Llaves**: Las zonas que juegan un formato de eliminación se dibujan como llave.
- **Partidos**: Lista todos los partidos del torneo en una tabla compacta, de a dos por fila con abreviaturas y resultado, una página por vez; las páginas avanzan con la rotación y una vista `matches` fija sigue paginando.

La superposición de tercio inferior no cambia: nombra un partido, no una fase.

### Superposiciones: un partido, series y sets

Una superposición muestra solo el partido que se le dio: el que nombra su dirección (`/tv/<organización>/tournaments/<torneo>/stages/<fase>/matches/<número>?mode=overlay-lower`) o, con `?court=<cancha>`, el partido en vivo de esa cancha. Abierta sin ninguno, no pinta nada al aire, de modo que dos superposiciones nunca muestran el mismo partido por casualidad. Hay tres presentaciones: `?mode=overlay-scorebug`, y el `?mode=overlay` a secas que usan las fuentes existentes, es un marcador de esquina arriba a la derecha; `?mode=overlay-lower` es una franja inferior en la banda de abajo, con ambos escudos y nombres, el marcador, la copa y la ronda, la cancha, el estado y el reloj del partido, o el horario de inicio de un partido que todavía no se jugó; `?mode=overlay-full` es una escena opaca a pantalla completa con la cinta de resultados. El marcador de esquina y la franja inferior son transparentes por defecto. Cada superposición mantiene sus gráficos dentro del área segura de la transmisión, el 5 % del cuadro desde cada borde, y sobre un chroma sus gráficos son opacos y sin sombra. Un partido dentro de una serie muestra cómo va la serie (partidos ganados por cada lado y el partido en juego) junto al resultado, y un partido jugado por sets muestra los sets ya jugados y el que está en juego, con el lado local primero y la etiqueta de set de la disciplina en el idioma de la página. El segmento en juego se nombra por su lugar en el partido («2do tiempo», «2da vuelta», «3er set») cuando la disciplina juega varios del mismo tipo, y sin número cuando juega uno solo. Un partido sin nada de esto se ve como antes. El reloj de juego en las páginas públicas en vivo, el marcador de TV y la superposición proviene directamente de la consola del partido en vivo.

### El lanzador de pantalla

`/tv` es un lanzador que arma la dirección de una pantalla del recinto o de una superposición: elegí la organización, el torneo y la vista (el panel rotativo, el diseño de presentación o de panel, la cuadrícula de canchas, la tabla de posiciones, la lista de partidos, un partido fijado o una de las tres superposiciones), el fondo y el idioma. La barra de tercio inferior y el marcador de esquina arrancan con fondo transparente, la escena a pantalla completa con el fondo de su disciplina, y cada vista muestra una descripción de una línea. El idioma cambia las etiquetas del lanzador al instante, sin recargar la página. Las etapas se listan con su número y nombre, y los partidos se agrupan por zona y grupo; cada opción muestra la copa y la ronda, los dos equipos, el horario de inicio en la zona horaria de la organización, la cancha, el estado y su número (`#34`). La etapa se abre en el partido en vivo, si no en el próximo programado, y si no en la última. Seguir una cancha y fijar un partido son dos elecciones separadas. La dirección final se muestra con un botón para copiarla y se previsualiza en un marco 16:9, para pegarla en OBS.

### Contadores del partido

Una disciplina puede declarar contadores del partido: totales de eventos registrados por lado, como faltas de equipo, tiempos muertos o tarjetas. Cada overlay muestra los contadores junto al marcador: en forma corta en el scorebug y en el lower third (`F 4`, o `TM 1/1` cuando la disciplina fija un límite), y en forma completa en un partido fijado. Un contador en su valor de advertencia adopta el tono de advertencia y muestra un `!`, así que nunca depende solo del color. El contador solo resalta: un registro por encima de su límite se acepta y la consola nunca lo rechaza ni advierte. La página pública del partido muestra los mismos totales por lado y, mientras el partido está en vivo, cada penalización temporal con el tiempo restante. Un partido finalizado conserva los contadores que cuentan todo el partido y omite los que se reinician en cada segmento.

## Qué ve un espectador en el sitio público

El sitio público (sin login) muestra las posiciones, la llave y los reportes de partido de un torneo tal
como se publican, en la misma dirección organización/torneo que usan el panel de control y las
superficies `/tv/**`. Una [serie](/help/control/series) en curso muestra su marcador en vivo y qué lado
va ganando en la llave pública de la misma forma que en el panel de control, y un partido todavía no
programado se muestra así, nunca se adivina.

En la pantalla de TV, el recapitulativo de un torneo finalizado que se definió zona por zona lista al campeón o a los campeones compartidos de cada zona de la última fase bajo el nombre de la zona, los mismos ganadores que muestra el resumen público. Un torneo con un único campeón conserva la presentación de campeón único, y el líder de la tabla de una fase anterior nunca se presenta como campeón.

En el sitio público, cada partido indica su fase, y su zona y grupo cuando la fase los tiene. Una fase con varios grupos muestra una tabla de posiciones por grupo, y un desempate que separó a equipos empatados aparece bajo la tabla junto a la columna que lo decidió. Un partido de eliminación empatado indica qué lado avanza. Las pestañas del torneo (resumen, partidos, en vivo, posiciones y la llave cuando una fase la dibuja) abren cada una su propia página. Los horarios se muestran en la zona horaria de la organización, con una nota que la nombra, y un partido que no comenzó 15 minutos después de su inicio aparece como demorado. El resumen muestra el avance del torneo, y el calendario tiene un filtro por día en escritorio.

## Qué no podés hacer acá

Ninguna de las dos superficies acepta entrada de un espectador ni de un dispositivo de TV: ambas son
representaciones de solo lectura de datos ya publicados. Cambiar lo que se publica pasa en el propio
panel de control de la organización, no en las superficies públicas ni `/tv/**`.
