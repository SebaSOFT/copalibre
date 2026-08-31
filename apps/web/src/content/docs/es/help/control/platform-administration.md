---
title: Administración de la plataforma
description: Creá organizaciones, gestioná los super-admins de la instalación e instalá módulos de disciplina/perfil.
capabilities:
  - control-web/platform-administration
  - platform/default-module-catalogue
roles:
  - super-admin
---

## Para qué sirve esta pantalla

Esta es la consola propia de la instalación, a la que se llega solo como `super-admin` — un nivel por
encima de cualquier organización. Nada acá está limitado a una sola organización: cada acción acá afecta
a toda la instalación.

## Organizaciones

Acá se crea una organización nueva — su alias, nombre visible, idioma principal y zona horaria — y se
invita a su primer administrador por email en el mismo paso. Una organización creada sin invitar a un
administrador queda sin nadie que pueda iniciar sesión y gestionarla, por eso se hacen juntos.

## Usuarios

Se llega a la lista de usuarios de cualquier organización por su alias, así un super-admin puede entrar
a cambiar el rol o estado de un usuario sin necesidad de ser miembro de esa organización.

## Super-admins

Acá se listan, crean y eliminan los super-admins de la instalación. Un super-admin se crea por ID de
principal — la identidad ya tiene que existir (haber iniciado sesión al menos una vez) antes de poder
promoverse.

## Módulos

Acá se instalan módulos de disciplina y de perfil de torneo por alias, un rango de versión opcional y
una fuente alternativa opcional para un módulo que no está en el catálogo por defecto. Los módulos
instalados se listan con su tipo, versión y fuente, y se pueden verificar o eliminar. Revisar
actualizaciones compara las versiones instaladas contra lo que publica actualmente la fuente de cada
módulo, sin instalar nada hasta que se pida.

## Qué no podés hacer acá

Nada acá llega a los datos propios de una organización — ningún partido, resultado o inscripción es
visible ni editable desde esta pantalla. Eso es el propio panel de control de cada organización, al que
llega un administrador de organización, no un super-admin actuando desde esta consola.
