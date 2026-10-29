# Session setup / Preparación de la sesión

Use a disposable development stack, never a production installation. Keep the same loaded dataset for
all participants in one study round so each person starts with comparable data.

Usa un entorno de desarrollo descartable, nunca una instalación de producción. Conserva el mismo
conjunto de datos para todas las personas de una ronda, así todas empiezan con información comparable.

## English

### Prepare the development stack

1. Start the local stack with `copalibre dev`, or start only its infrastructure with:
   `docker compose -f docker-compose.dev.yml --profile infrastructure up --detach --wait`.
2. Install the `rink-hockey` discipline if it is not already installed: `copalibre module add rink-hockey`.
   The development object-storage environment required by this command is documented in
   [`DEMO-DATA.md`](../../DEMO-DATA.md).
3. Load the Panamericano demo and create an administrator invitation for the test account:

   ```sh
   copalibre dev demo panamericano-clubes-2025 --anchor today --played-until now --with-admin <operator-email>
   ```

   `--anchor today` places the first game day today in the organization's time zone. `--played-until
   now` marks only games completed by the current time as played and leaves later games scheduled.
   `--with-admin` creates an administrator invitation for the demo organization; it is not a
   referee-only account. The command prints a setup link once. Share it privately with the test
   operator, and do not put the link or email address in research notes.

4. Complete account setup through that link before the session. Keep the test account and stack
   separate from any real tournament data.
5. Write down the dataset flags, organization time zone, browser, device and account role in the
   session log. Do not include credentials or setup links.

The loader skips a dataset that is already present; rerunning the command does not reset it or apply
new flags. For a clean run, use the documented disposable-stack reset in `DEMO-DATA.md`, then repeat
these steps. Never reset a shared development database for a research session.

If a study task depends on referee-only permissions, do not treat this administrator invitation as a
referee account. Use an account configured through supported access-control flows, or record that the
task was tested with administrator access and limit the finding accordingly. Never create accounts or
assign roles by writing database records manually.

### Before each participant

- Check that the demo tournament opens and that the tablet can reach the development site.
- Use the same device class and viewport for comparable sessions; the live-console exercise is
  tablet-first.
- Confirm the participant is an adult and has agreed to the note-taking terms in `consent-note.md`.
- Do not reload repeatedly while exercising offline behavior. Disconnect and reconnect the tablet's
  network when prompted by `usability-script.md`.
- Do not restore or reset the dataset between participants in the same study round.

## Español

### Preparar el entorno de desarrollo

1. Inicia el entorno local con `copalibre dev`, o inicia solo su infraestructura con:
   `docker compose -f docker-compose.dev.yml --profile infrastructure up --detach --wait`.
2. Instala la disciplina `rink-hockey` si todavía no está instalada: `copalibre module add rink-hockey`.
   Las variables de almacenamiento de objetos que necesita este comando están documentadas en
   [`DEMO-DATA.md`](../../DEMO-DATA.md).
3. Carga el demo Panamericano y crea una invitación de administrador para la cuenta de prueba:

   ```sh
   copalibre dev demo panamericano-clubes-2025 --anchor today --played-until now --with-admin <email-operador>
   ```

   `--anchor today` ubica el primer día de partidos en la fecha de hoy, según la zona horaria de la
   organización. `--played-until now` marca como jugados solo los partidos terminados hasta ese
   momento y deja programados los posteriores. `--with-admin` crea una invitación de administrador
   para la organización del demo; no crea una cuenta exclusiva de árbitro. El comando muestra un
   enlace de configuración una sola vez. Compártelo en privado con la persona operadora de prueba y
   no guardes el enlace ni su correo en las notas de investigación.

4. Completa la configuración de la cuenta desde ese enlace antes de la sesión. Mantén la cuenta y el
   entorno de prueba separados de los datos de torneos reales.
5. Anota en el registro de sesión las opciones del demo, la zona horaria de la organización, el
   navegador, el dispositivo y el rol de la cuenta. No incluyas credenciales ni enlaces de acceso.

El cargador omite un conjunto de datos que ya existe; volver a ejecutar el comando no lo reinicia ni
aplica opciones nuevas. Para empezar limpio, usa el reinicio documentado para un entorno descartable
en `DEMO-DATA.md` y repite estos pasos. Nunca reinicies una base de desarrollo compartida para una
sesión de investigación.

Si una tarea depende de permisos exclusivos de árbitro, no trates esta invitación de administrador
como si fuera una cuenta de árbitro. Usa una cuenta configurada mediante los flujos de acceso
soportados o deja asentado que la tarea se probó con permisos de administrador y limita la conclusión
en consecuencia. Nunca crees cuentas ni asignes roles escribiendo registros directamente en la base
de datos.

### Antes de cada participante

- Comprueba que se pueda abrir el torneo del demo y que la tableta acceda al sitio de desarrollo.
- Usa la misma clase de dispositivo y el mismo tamaño de pantalla en sesiones comparables; la tarea
  de consola en vivo se hace primero en tableta.
- Confirma que la persona sea adulta y haya aceptado las condiciones para tomar notas de
  `consent-note.md`.
- No recargues repetidamente durante la prueba sin conexión. Desconecta y reconecta la red de la
  tableta cuando lo indique `usability-script.md`.
- No restaures ni reinicies el conjunto de datos entre participantes de una misma ronda.
