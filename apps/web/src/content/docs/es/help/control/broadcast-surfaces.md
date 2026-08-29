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
