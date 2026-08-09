---
title: Creación de torneo
description: Qué configura el asistente de creación de torneo y qué significa cada campo.
---

## Para qué sirve esta pantalla

Crea un torneo nuevo dentro de la organización: elige la disciplina, el formato y los datos básicos
antes de que exista ningún participante inscrito.

## Datos clave

- **Disciplina**: el conjunto de reglas del deporte/actividad que va a jugarse (ganada, puntos,
  segmentos, etc.). Solo aparecen disciplinas instaladas en esta instalación — si falta la que
  necesita, hay que instalarla primero (`copalibre module add`) antes de poder crear el torneo.
- **Alias**: identificador de ruta pública del torneo, único dentro de la organización. Usa
  minúsculas y guiones; aparece en la URL pública, no se puede cambiar después libremente.
- **Formato**: el formato de disputa disponible para la disciplina elegida (eliminación simple,
  round robin, etc.).

## Ciclo de vida

Un torneo recién creado queda en estado **borrador**. Desde ahí sigue un camino lineal:
borrador → publicado → iniciado → finalizado → archivado. Cada paso es una decisión explícita en
otra pantalla, no algo que esta pantalla haga por usted. Una vez **iniciado**, la disciplina y el
perfil de torneo quedan congelados en la versión que tenían en ese momento — un torneo en curso
nunca cambia de reglas a mitad de camino.
