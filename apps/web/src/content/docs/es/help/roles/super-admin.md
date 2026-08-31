---
title: Super-admin
description: Qué puede hacer el rol super-admin, y qué no puede hacer.
capabilities:
  - control-web/platform-administration
roles:
  - super-admin
---

## Para qué sirve este rol

El propio operador de la instalación — un nivel por encima de cada organización, sin ser miembro de
ninguna de ellas. Super-admin existe para crear organizaciones, gestionar quién más tiene super-admin, e
instalar los módulos de disciplina y perfil de torneo que ejecuta toda la instalación.

A diferencia de cada otro rol de este sitio, super-admin está fuera por completo de la correspondencia
de capacidades de organización: es un rol de instalación (`INSTALLATION_ROLES`), no uno de organización
(`ORGANIZATION_ROLES`), así que no tiene entrada en la correspondencia declarada de rol a capacidad ni
lista de capacidades generada aquí — su autoridad es un conjunto fijo y pequeño de acciones a nivel de
instalación, descritas directamente.

## Qué puede hacer

- Crear una organización nueva, nombrando su alias, nombre visible, idioma principal y zona horaria, e
  invitar a su primer administrador en el mismo paso.
- Listar, crear y quitar super-admins de la instalación, por ID de principal.
- Entrar a la lista de usuarios de cualquier organización, por alias, para cambiar el rol o el estado de
  un usuario — sin necesitar membresía en esa organización.
- Instalar un módulo de disciplina o perfil de torneo por alias, un rango de versión opcional, y una
  fuente alternativa opcional; listar, verificar, quitar, y comprobar actualizaciones de los módulos
  instalados.
- Crear una disciplina o perfil de torneo nuevo mediante el asistente guiado de administración de
  plataforma, que produce un paquete de módulo que luego instala esa misma autoridad a nivel de
  instalación.

## Qué no puede hacer

Nada llega a los datos propios del torneo de una organización: ningún fixture, resultado o inscripción
es visible o editable a través de este rol. Eso pertenece al propio panel de control de cada
organización, al que llega un [admin](/es/help/roles/admin/), no super-admin actuando a través de la
consola de instalación.

## Qué pantallas ve

La pantalla de administración de plataforma, y ninguna otra pantalla del panel de control — las
pantallas limitadas a una organización pertenecen a un rol de organización, que super-admin no tiene por
el solo hecho de ser super-admin.
