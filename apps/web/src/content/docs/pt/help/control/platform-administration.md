---
title: Administração da plataforma
description: Crie organizações, gerencie os super-admins da instalação e instale módulos de disciplina/perfil.
capabilities:
  - control-web/platform-administration
  - platform/default-module-catalogue
roles:
  - super-admin
---

## Para que serve esta tela

Esta é a console própria da instalação, acessada apenas como `super-admin` — um nível acima de qualquer
organização. Nada aqui é restrito a uma única organização: toda ação aqui afeta a instalação inteira.

## Organizações

Uma nova organização é criada aqui — seu alias, nome de exibição, idioma principal e fuso horário — e
seu primeiro administrador é convidado por email na mesma etapa. Uma organização criada sem um
administrador convidado fica sem ninguém que possa entrar e gerenciá-la, por isso as duas coisas são
feitas juntas.

## Usuários

A lista de usuários de qualquer organização é alcançada pelo seu alias, para que um super-admin possa
entrar e alterar a função ou o status de um usuário sem precisar ser membro dessa organização.

## Super-admins

Os super-admins da instalação são listados, criados e removidos aqui. Um super-admin é criado por ID de
principal — a identidade já precisa existir (ter entrado pelo menos uma vez) antes de poder ser
promovida.

## Módulos

Módulos de disciplina e de perfil de torneio são instalados aqui por alias, uma faixa de versão opcional
e uma fonte alternativa opcional para um módulo que não está no catálogo padrão. Os módulos instalados
são listados com seu tipo, versão e fonte, e podem ser verificados ou removidos. Verificar atualizações
compara as versões instaladas com o que a fonte de cada módulo publica atualmente, sem instalar nada até
que seja solicitado.

## O que você não pode fazer aqui

Nada aqui alcança os próprios dados de torneio de uma organização — nenhuma partida, resultado ou
inscrição é visível ou editável nesta tela. Isso é o próprio painel de controle de cada organização,
alcançado por um administrador de organização, não por um super-admin agindo a partir desta console.
