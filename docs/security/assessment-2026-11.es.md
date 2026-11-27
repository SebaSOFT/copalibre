# Evaluación de seguridad, noviembre 2026

Informe de la revisión de seguridad pedida por el responsable del proyecto el 2026-11-05. Cubre los
27 controles del pedido sobre el código de esta rama. El veredicto de cada release lo produce el gate
(`yarn security:release`) para la revisión y los artefactos exactos que se publican; este informe
resume la revisión y no reemplaza ese veredicto.

**No certifica la ausencia de vulnerabilidades.** Revisa lo que el pedido nombra, con la evidencia
que se indica, sobre los perfiles de despliegue que se distribuyen. No cubre instalaciones de
terceros, bases de datos o proveedores que opera cada operador, ni credenciales fuera del repositorio.

## Veredicto

**Release: bloqueado, con el veredicto completo registrado y no aplicado.**

- El gate estático aprueba sus 32 controles y bloquea la publicación si falla.
- El veredicto completo queda bloqueado por cinco motivos, todos explícitos:
  1. El usuario de base de datos con el que corre la aplicación es superusuario (hallazgo abierto,
     decisión del responsable).
  2. La prueba de escalada de privilegios en runtime necesita un comando soportado para crear el
     primer super-admin, que todavía no existe.
  3. Tres atestaciones esperan la firma del responsable: dependencias sin uso, revisión de límites
     de confianza e incidentes de credenciales.
  4. La evidencia de runtime y el escaneo de imágenes se producen en CI y en el job de release, no
     en esta revisión local. Localmente pasaron.
  5. La política vigente registra el veredicto completo sin aplicarlo hasta que todos los controles
     de runtime tengan evidencia.

## Controles

| Control pedido                        | Evidencia                                                                                                                                          | Estado                                                         |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Autenticación                         | Tests de JWT (algoritmos, emisor, firma, `none`, HMAC), OIDC (state, entrega del token), sondas con tokens falsificados por header, cookie y query | Aprobado                                                       |
| Claves fuera del navegador            | Sin token en storage ni cookie legible; escaneo de artefactos web y de la CLI sin credenciales ni source maps                                      | Aprobado                                                       |
| Protección de la base de datos        | Solo el gateway publicado en el host; base y storage internos                                                                                      | **Abierto:** la aplicación usa el superusuario de PostgreSQL   |
| HTTPS                                 | HSTS en el borde que se distribuye; redirección HTTP→HTTPS y HSTS medidos detrás del Caddy de borde                                                | Aprobado                                                       |
| Hash de contraseñas                   | Argon2id con parámetros fijados (64 MiB, t=3, p=4), rehash al iniciar sesión, mismo costo para cuentas inexistentes                                | Aprobado                                                       |
| Validación en el servidor             | Propiedades no declaradas rechazadas antes de efectos; largos máximos en credenciales                                                              | Aprobado                                                       |
| XSS                                   | Sinks HTML revisados, CSP con hashes y sin `unsafe-eval`, nombres hostiles como texto en páginas públicas y Control, CSV neutralizado              | Aprobado                                                       |
| Actividad sospechosa                  | Ráfagas de rechazos generan una alerta redactada y deduplicada que llega a un receptor de prueba; runbook en `incident-response.md`                | Aprobado                                                       |
| Rutas de administración               | Toda ruta declara su acceso y sin declaración falla cerrada; aislamiento entre organizaciones                                                      | Aprobado en tests; **bloqueado** en runtime por el super-admin |
| Consultas parametrizadas              | Kysely enlaza los valores; cada SQL crudo o identificador dinámico está revisado y listado                                                         | Aprobado                                                       |
| Variables de entorno                  | Placeholders, proxies confiables y cookie insegura detectados por `doctor` sin mostrar valores                                                     | Aprobado                                                       |
| Rate limits                           | Límites compartidos entre réplicas, cupos por dirección en streams, dirección del cliente creída solo desde proxies nombrados                      | Aprobado                                                       |
| CORS                                  | Solo `COPALIBRE_APP_URL`                                                                                                                           | Aprobado                                                       |
| Headers de seguridad                  | nosniff, Referrer-Policy y política de framing en páginas, API y errores, medidos en runtime                                                       | Aprobado                                                       |
| Cookies de sesión                     | `__Host-`, Secure, HttpOnly, SameSite=Strict, Path, logout limpia las tres, refresh rota                                                           | Aprobado                                                       |
| CSRF                                  | Double-submit firmado y ligado a la sesión; Bearer no lo necesita                                                                                  | Aprobado                                                       |
| Links de recuperación con vencimiento | Hash en reposo, vencimiento, ligados a su propósito, de un solo uso incluso con concurrencia                                                       | Aprobado                                                       |
| Tipos y tamaños de upload             | Tipo por contenido, formatos aceptados, dimensiones, tamaño, nombres sin traversal, cuarentena, paquetes de módulos acotados                       | Aprobado                                                       |
| Precios y pagos en el servidor        | No existe flujo de pagos; una guarda falla en cuanto aparezca                                                                                      | No aplica                                                      |
| Debug apagado en producción           | Sin endpoints de debug, stack traces, `X-Powered-By` ni inspector, medido en runtime                                                               | Aprobado                                                       |
| Dependencias vulnerables              | Auditorías de registro y Dependabot antes de publicar; imágenes escaneadas con Trivy                                                               | Aprobado                                                       |
| Paquetes sin uso                      | Análisis con knip revisado a mano; ocho declaraciones eliminadas                                                                                   | Atestación pendiente                                           |
| Archivos expuestos                    | `.env`, `.git`, backups, manifiestos y traversal codificado sin contenido privado, medido en runtime                                               | Aprobado                                                       |
| Secretos en el historial de Git       | gitleaks sobre 22 refs y 1605 commits: sin credenciales reales                                                                                     | Aprobado                                                       |
| Revocar y rotar claves comprometidas  | Ninguna credencial comprometida encontrada; política de incidentes documentada                                                                     | Atestación pendiente                                           |
| Revisión completa                     | Cadena de suministro de CI, módulos, egress, comandos e inventario de superficie                                                                   | Atestación pendiente                                           |
| Protecciones y reporte                | Gate con evaluador, excepciones, redacción y este informe                                                                                          | Aprobado                                                       |

## Hallazgos

Diecinueve hallazgos se reprodujeron, se corrigieron en esta rama y tienen test de regresión
(`findings.json`). Uno queda abierto.

| Hallazgo                                                                                              | Severidad         | Corrección                                                                                      |
| ----------------------------------------------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------- |
| Dos pedidos simultáneos consumían el mismo token de un solo uso                                       | Alta              | `UPDATE … RETURNING` condicional                                                                |
| El nombre de un archivo subido entraba a la clave de storage y alcanzaba objetos de otra organización | Alta              | Nombre reducido a un archivo plano                                                              |
| El alias de un módulo llegaba a una ruta y a argumentos de git sin validar                            | Alta              | Alias validado, `--`, transportes limitados                                                     |
| El compose publicaba roles internos en todas las interfaces                                           | Alta              | Solo loopback; `upgrade` corrige instalaciones                                                  |
| El API creía `X-Forwarded-For` de cualquiera                                                          | Alta              | `COPALIBRE_TRUSTED_PROXIES`                                                                     |
| El release ejecutaba una CLI de Smithery sin fijar con la clave disponible                            | Alta              | Versión fijada en el lockfile                                                                   |
| La CLI podía subir assets desde otro commit con la misma versión                                      | Alta              | Assets atados al commit del tag                                                                 |
| Un token de otro propósito se gastaba antes de rechazarse                                             | Media             | El tipo es parte de la condición                                                                |
| El reset de contraseña no cerraba las sesiones abiertas                                               | Media             | Revoca los refresh                                                                              |
| El login delataba por tiempo qué cuentas existen                                                      | Media             | Hash señuelo                                                                                    |
| Eventos ponía a todos los espectadores en un solo balde                                               | Media             | Misma política de proxies                                                                       |
| Actions fijadas por tags que se pueden mover                                                          | Media             | SHA de commit                                                                                   |
| Una imagen se servía con el tipo que declaraba el cliente                                             | Media             | Tipo por contenido                                                                              |
| La ruta de un asset de módulo podía salir del paquete                                                 | Media             | Patrón y chequeo de ruta                                                                        |
| El envío de un módulo pasaba repositorio y rama sin validar a `gh` y `git`                            | Media             | Validados                                                                                       |
| Ningún borde distribuido enviaba HSTS                                                                 | Media             | Caddy lo envía; NGINX lo documenta                                                              |
| Contraseñas sin largo máximo                                                                          | Baja              | 1024 caracteres                                                                                 |
| Un token de reset inválido devolvía 500                                                               | Baja              | 400                                                                                             |
| El CSV no neutralizaba tab ni retorno de carro                                                        | Baja              | Agregados                                                                                       |
| **La aplicación corre con el superusuario de PostgreSQL**                                             | **Alta, abierto** | Requiere separar el owner de migraciones de un rol con permisos de filas y un camino de upgrade |

Además, el escaneo de imágenes encontró el npm de la imagen base, que ningún rol usa, con advisories
en sus dependencias. Se eliminó de la imagen de runtime. Un advisory alto del binario de Caddy, no
alcanzable con la configuración que se distribuye, queda revisado con vencimiento en
`.trivyignore.yaml` hasta que Caddy publique la corrección.

## Acciones pendientes

1. **Responsable:** decidir el rol de base de datos de runtime. Recomendado: un rol de aplicación
   solo con permisos de filas, el owner para las migraciones, y que `copalibre upgrade` cree el rol.
2. **Responsable:** firmar o rechazar las tres atestaciones, con la evidencia de `reviews.md`.
3. **Responsable:** aceptar o rechazar la entrada de Caddy en `.trivyignore.yaml`. La política del
   gate no permite eximir hallazgos altos propios; esta entrada es de un binario de terceros.
4. Entregar el comando soportado de primer super-admin, que habilita la prueba de escalada en runtime.
5. Activar la aplicación del veredicto completo en el release cuando los controles de runtime tengan
   evidencia.

## Límites

- Las sondas de runtime corrieron contra una instalación descartable con el perfil de producción y el
  Caddy de borde con una CA interna; no contra ninguna instalación real.
- El historial de Git revisado es el que tiene el clon; un historial borrado del remoto no se puede
  revisar.
- La revisión de concurrencia de tokens usa PostgreSQL; SQLite serializa escrituras y no prueba esa
  carrera.
- Las auditorías de dependencias reflejan los advisories publicados a la fecha de cada corrida.
