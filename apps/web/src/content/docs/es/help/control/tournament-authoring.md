---
title: Creación de torneo
description: Qué configura el asistente de creación de torneo y qué significa cada campo.
capabilities:
  - control-web/tournament-authoring
  - tournament-engine/discipline-driven-results
  - tournament-engine/tournament-fixture-engine
  - tournament-engine/tournament-profile
  - tournament-engine/tournament-domain-model
  - tournament-engine/competition-identity
  - tournament-engine/rules-engine
  - tournament-engine/scripting-hook-surface
  - tournament-engine/placement-stage-format
roles:
  - admin
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

## Planificar zonas

Cada fase puede dividirse en zonas al crear el torneo. Abra **Zonas** dentro de una fase, agregue una zona y póngale nombre. Una zona juega con el formato y la serie de su fase, salvo que elija otro formato para ella (por ejemplo, dos zonas de eliminación y una liga de todos contra todos dentro de una misma fase) o le defina una serie propia. Los nombres de zona deben ser únicos dentro de la fase. El asistente solo declara la estructura: los participantes se asignan a las zonas después de la inscripción, en la pantalla de zonas y grupos, donde también se puede cambiar el formato de cada zona hasta que la fase tenga partidos generados.

## Ciclo de vida

Un torneo recién creado queda en estado **borrador**. Desde ahí sigue un camino lineal:
borrador → publicado → iniciado → finalizado → archivado. Cada paso es una decisión explícita en
otra pantalla, no algo que esta pantalla haga por usted. Una vez **iniciado**, la disciplina y el
perfil de torneo quedan congelados en la versión que tenían en ese momento — un torneo en curso
nunca cambia de reglas a mitad de camino.
