---
title: Zonas y grupos
description: Creá zonas y grupos dentro de una etapa, y asigná entrantes a ellos.
capabilities:
  - control-web/zone-group-management
roles:
  - admin
---

## Para qué sirve esta pantalla

Algunos torneos dividen una etapa en zonas separadas (por ejemplo, «Copa Oro» y «Copa Plata»), y cada
zona en grupos que juegan todos contra todos entre sí. Esta pantalla crea esas zonas y grupos, y les
asigna entrantes — ya sea mediante el mismo sorteo automático con semilla y que respeta restricciones
usado para el sembrado de la llave, o ubicando cada entrante manualmente.

Una etapa que nunca tuvo una zona o grupo explícito creado muestra exactamente uno de cada — el
implícito que ya tiene toda etapa.

## Datos clave

- **Zona**: una subdivisión con nombre de una etapa (por ejemplo, una copa separada dentro de la misma
  etapa).
- **Grupo**: una subdivisión con nombre de una zona, que juega todos contra todos entre sus propios
  entrantes.
- **Sorteo automático**: la misma asignación determinista y que respeta restricciones que ya usan el
  armador de sembrado de llave y la asignación de lobby de series — se repite idéntica dada la misma
  semilla.
- **Ubicación manual**: asignar cada entrante a un número de zona o grupo directamente, registrado
  exactamente como quedaría el resultado de un sorteo automático.

## Jugar un formato distinto en una zona

Por defecto, cada zona juega el formato de su fase. Abrí **Cambiar el formato de la zona** en una zona
para darle uno propio —por ejemplo, dos zonas de eliminación directa y una liga todos contra todos para
los clubes que sobran— y, si el formato lo necesita, su propia cantidad de partidos por serie. La pantalla
marca la zona personalizada y muestra el formato que heredan las demás; elegir **Formato de la fase**
devuelve la zona al de la fase. La lista de formatos es la que ofrece la disciplina del torneo. Cuando la
fase ya tiene partidos, el formato y la serie de las zonas quedan bloqueados.

La página pública de la fase dibuja entonces cada zona como lo pide su formato: una llave para una zona de
eliminación directa, y los partidos con su tabla de posiciones para una zona de liga.

## Qué no podés hacer acá

Renombrar una zona o grupo ya creado todavía no está disponible — nombralo con cuidado al crearlo.
