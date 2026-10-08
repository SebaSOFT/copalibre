---
title: Superficies de transmisión y públicas
description: Tokens de display para pantallas de TV en sede y overlays de streaming, y qué ve un espectador en el sitio público.
capabilities:
  - live-operations/broadcast-tv-surfaces
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

La pantalla en rotación completa recorre la tabla de posiciones, los destacados, las estadísticas del torneo y, cuando la fase destacada los tiene, las llaves y los partidos de liga. Una dirección con `?view=standings` o `?view=fixtures` fija una de ellas en lugar de rotar.

Una fase puede mezclar formatos, así que la pantalla presenta cada zona según el formato que juega:

- **Posiciones**: Cada zona que ordena participantes en una tabla tiene su propia tabla, encabezada con el nombre de la zona. Las filas de zonas distintas nunca se mezclan en un mismo orden, y cada tabla muestra hasta ocho filas. Una fase cuyas zonas juegan todas el formato de la fase conserva una sola tabla sin encabezado.
- **Llaves**: Las zonas que juegan un formato de eliminación se dibujan como llave.
- **Partidos**: Una zona que juega una liga lista sus partidos agrupados por ronda, con el estado y el resultado de cada uno. La pestaña aparece solo cuando la fase destacada tiene una zona así.

La superposición de tercio inferior no cambia: nombra un partido, no una fase.

## Qué ve un espectador en el sitio público

El sitio público (sin login) muestra las posiciones, la llave y los reportes de partido de un torneo tal
como se publican, en la misma dirección organización/torneo que usan el panel de control y las
superficies `/tv/**`. Una [serie](/help/control/series) en curso muestra su marcador en vivo y qué lado
va ganando en la llave pública de la misma forma que en el panel de control, y un partido todavía no
programado se muestra así, nunca se adivina.

## Qué no podés hacer acá

Ninguna de las dos superficies acepta entrada de un espectador ni de un dispositivo de TV: ambas son
representaciones de solo lectura de datos ya publicados. Cambiar lo que se publica pasa en el propio
panel de control de la organización, no en las superficies públicas ni `/tv/**`.
