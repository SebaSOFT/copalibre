---
title: Consola de partido en vivo
description: Qué hace la consola de partido, y qué no se puede cambiar una vez cargado un resultado.
capabilities:
  - live-operations/live-match-console
  - live-operations/live-match-operations
  - live-operations/realtime-events
  - tournament-engine/declared-tagging
roles:
  - referee
  - admin
---

## Para qué sirve esta pantalla

Es la pantalla de operación de un partido en curso: registrar eventos y segmentos a medida que
ocurren, y cargar el resultado final cuando el partido termina. Lo que se hace acá se transmite en
vivo a la pantalla pública del torneo.

## Datos clave

- **Evento**: un hecho puntual del partido (un punto, una tarjeta, un cambio) registrado con su
  momento exacto — forma el historial reconstruible del partido, no solo el marcador final.
- **Segmento**: una división del partido con reloj propio (un set, un período). El reloj y el
  resultado se manejan por segmento, no como un único cronómetro para todo el partido.
- **Resultado**: el resultado final del partido, cargado una sola vez. Una vez cargado, no se
  sobrescribe desde esta pantalla — cualquier corrección posterior pasa por el flujo auditado de
  corrección/supersesión, no por volver a cargar acá.

## Manejar el reloj

Cada segmento tiene su propio reloj, y lo manejás con tres botones debajo del segmento que
seleccionaste:

- **Iniciar** arranca el reloj de ese segmento y detiene el que estuviera corriendo — solo corre uno
  a la vez.
- **Pausar** lo detiene donde está. Un partido en pausa sigue en curso: la pausa detiene un reloj, no
  la competencia.
- **Terminar período** cierra ese segmento. Después no acepta más Iniciar ni Pausar, y no termina el
  partido — cargar el resultado es una acción aparte.

Estos registran el momento en que realmente tocaste el silbato. El campo de segundos transcurridos
que está al lado sigue siendo lo que siempre fue: la forma de corregir un valor mal registrado,
después del hecho. Ambos caminos quedan en la misma auditoría, con quién lo hizo, cuándo, y qué
marcaba el reloj antes y después.

## Leer el registro de eventos

El registro arranca contraído, mostrando los tres eventos más recientes, para que los controles de
registro entren en una sola pantalla mientras trabajás. Lo que acabás de registrar siempre está
entre ellos: contraer saca de la vista el historial viejo, nunca tu última confirmación. **Ver
historial completo** abre el partido entero.

## Qué NO se puede hacer después de cargar el resultado

Una vez finalizado el partido, esta pantalla no permite seguir agregando eventos como si el partido
continuara, ni recargar el resultado directamente. Eso es intencional: protege la integridad del
historial ya publicado.

## Trabajar con una conexión poco confiable

La conectividad al costado de la cancha se corta. Esta pantalla está pensada para eso: registrar un
evento, ajustar el reloj, seleccionar una convocatoria o finalizar un partido escribe primero en una
cola local durable, _antes_ de intentar enviarlo — así una señal cortada nunca hace perder algo que
ya hiciste.

- **Un punto de conexión** siempre está visible en la parte superior de la pantalla: relleno si
  estás en línea, hueco si no. Pasá el mouse o enfocalo para ver cuántas acciones siguen esperando
  para enviarse y cuándo se sincronizó la última.
- **Una acción en cola queda en cola**, no se pierde, con una conexión intermitente, una zona sin
  señal, o incluso al cerrar y volver a abrir esta pantalla — reabrirla retoma el envío de lo que
  todavía esté esperando.
- **En cuanto vuelve la conectividad**, todo lo que estaba en cola se envía automáticamente, en el
  orden en que lo hiciste.
- **Una acción rechazada** — una que el servidor también habría rechazado en vivo, como un cambio de
  convocatoria enviado después de que el partido ya terminó — se muestra con claridad, con el
  motivo, para que sepas exactamente qué necesita tu atención. Nunca bloquea lo que quedó en cola
  después de ella.

Lo que esta pantalla no hace: recuperar algo que estabas escribiendo o seleccionando pero nunca
llegaste a enviar. Si estabas a mitad de una edición cuando se cortó la conexión, esa entrada
puntual se pierde igual que siempre — solo las acciones que ya intentaste registrar están
protegidas.
