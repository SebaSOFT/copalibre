# Usability session script / Guion de la sesión de usabilidad

Use this script with the same 3–5 tournament operators who take the tree test. Allow about 30–45
minutes for the usability tasks. Read the prompts as written, in the participant's chosen language.

Usa este guion con las mismas 3–5 personas operadoras que hacen la prueba del árbol. Reserva unos
30–45 minutos para las tareas de usabilidad. Lee las consignas tal como están, en el idioma que elija
la persona participante.

## English

### Before the session

- Assign a participant code; keep contact details separate from research notes.
- Obtain consent using `consent-note.md`. Written notes are the default; do not capture audio or video.
- Use a tablet for the live-console tasks and the Panamericano development demo.
- If the demo has no pending registration to review, test the available list or empty state. Do not
  create database records by hand or imply that sample data is real.
- Ask the participant to think aloud. Do not explain labels, point to controls, or suggest a route.

### Opening and warm-up

Say:

> We are evaluating how this interface supports your work, not evaluating you. Please describe what
> you expect to happen as you go. You can pause, skip a task or stop at any time. I will take written
> notes; I will not record audio or video.

Ask:

1. What is your role when you help run a tournament?
2. Which tools do you use most during a match day?
3. What device would you normally use beside the playing area?

Do not ask the participant to design a solution before trying the tasks.

### Task A — Record a match on a tablet

Read:

> You are the table official for this match. Start the clock, record a goal, record a card, and record
> a timeout. The connection then drops. Record one more event while offline, reconnect, and show me
> how you would confirm whether it synchronized.

Moderator sequence:

1. Start timing only when the participant begins.
2. Let the participant choose the event controls and confirm actions.
3. Ask them to disconnect the tablet from the network only when they reach the offline part.
4. Do not prompt a reload. Observe how the participant recognizes offline state, records the event,
   reconnects, and checks synchronization.
5. If the chosen event is unavailable in the demo match, record the mismatch and ask the participant
   what they would expect instead; do not substitute an event for them.

Neutral prompts, only when the participant stops speaking:

- What are you looking for now?
- What do you expect this action to do?
- What tells you that the event was saved or synchronized?

### Task B — Review registrations

Read:

> An organizer has received participant registrations for this tournament. Review the available
> entries and tell me what you would check next. Do not approve, reject or edit an entry.

Observe whether the participant finds the review area, understands each entry's state, and can tell
what remains to be checked. If no entries are available, observe how they interpret the empty state
and record that the demo provided no pending registration; do not fabricate one.

### Closing

Ask:

1. Which step felt least clear, and what made it unclear?
2. Was there any point where you worried an action might be lost or applied twice?
3. What would you change first for your work?

Thank the participant. Record observations with the participant code, not their name. Complete the
corresponding rows in `results-template.md` before discussing findings with the next participant.

### Observation sheet

| Time | Task / step | Participant action or first click | Outcome / hesitation / error | Short quote (anonymous) |
|---|---|---|---|---|
| | | | | |
| | | | | |
| | | | | |

## Español

### Antes de la sesión

- Asigna un código a la persona participante; guarda sus datos de contacto por separado de las notas.
- Pide consentimiento con `consent-note.md`. La opción predeterminada son notas escritas; no grabes
  audio ni video.
- Usa una tableta para las tareas de la consola en vivo y el demo de desarrollo Panamericano.
- Si el demo no tiene inscripciones pendientes para revisar, prueba la lista disponible o el estado
  vacío. No crees registros directamente en la base de datos ni presentes datos de muestra como reales.
- Pide que la persona piense en voz alta. No expliques etiquetas, señales controles ni sugieras un camino.

### Apertura y preguntas iniciales

Di:

> Estamos evaluando cómo esta interfaz acompaña tu trabajo, no te estamos evaluando a vos. Contame qué
> esperás que ocurra mientras avanzás. Podés hacer una pausa, saltear una tarea o terminar cuando
> quieras. Voy a tomar notas escritas; no voy a grabar audio ni video.

Pregunta:

1. ¿Qué rol tenés cuando ayudás a organizar un torneo?
2. ¿Qué herramientas usás más durante una jornada de partidos?
3. ¿Qué dispositivo usarías normalmente cerca del campo de juego?

No le pidas a la persona que diseñe una solución antes de probar las tareas.

### Tarea A — Registrar un partido desde una tableta

Lee:

> Sos la persona de mesa para este partido. Iniciá el reloj, registrá un gol, una tarjeta y un tiempo
> muerto. Después se corta la conexión. Registrá un evento más sin conexión, reconectate y mostrame
> cómo confirmarías si se sincronizó.

Secuencia para moderar:

1. Empezá a medir el tiempo cuando la persona inicie.
2. Dejá que elija los controles de eventos y las acciones de confirmación.
3. Pedile que desconecte la tableta de la red cuando llegue a la parte sin conexión.
4. No sugieras recargar la página. Observá cómo reconoce el estado sin conexión, registra el evento,
   se reconecta y verifica la sincronización.
5. Si el evento elegido no está disponible en el partido del demo, registrá la diferencia y preguntá
   qué esperaría la persona; no elijas otro evento en su lugar.

Preguntas neutrales, solo si la persona deja de hablar:

- ¿Qué estás buscando ahora?
- ¿Qué esperás que haga esta acción?
- ¿Qué te indica que el evento se guardó o sincronizó?

### Tarea B — Revisar inscripciones

Lee:

> Una persona organizadora recibió inscripciones para este torneo. Revisá las entradas disponibles y
> contame qué comprobarías después. No apruebes, rechaces ni edites ninguna entrada.

Observá si la persona encuentra el área de revisión, entiende el estado de cada entrada y puede
identificar qué falta comprobar. Si no hay entradas, observá cómo interpreta el estado vacío y
anotá que el demo no ofreció inscripciones pendientes; no inventes una.

### Cierre

Pregunta:

1. ¿Qué paso te resultó menos claro y por qué?
2. ¿Hubo algún momento en que te preocupó que una acción se perdiera o se aplicara dos veces?
3. ¿Qué cambiarías primero para tu trabajo?

Agradecé la participación. Registrá observaciones con el código asignado, no con el nombre. Completá
las filas correspondientes de `results-template.md` antes de conversar los hallazgos con la siguiente
persona.

### Hoja de observación

| Hora | Tarea / paso | Acción o primer clic | Resultado / duda / error | Cita breve (anónima) |
|---|---|---|---|---|
| | | | | |
| | | | | |
| | | | | |
