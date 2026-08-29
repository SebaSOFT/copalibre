---
title: Super-admin
description: O que a função super-admin pode fazer, e o que não pode fazer.
capabilities:
  - control-web/platform-administration
roles:
  - super-admin
---

## Para que serve esta função

O próprio operador da instalação — um nível acima de cada organização, sem ser membro de nenhuma delas.
Super-admin existe para criar organizações, gerenciar quem mais possui super-admin, e instalar os
módulos de disciplina e perfil de torneio que toda a instalação executa.

Diferente de cada outra função deste site, super-admin fica totalmente fora da correspondência de
capacidades de organização: é uma função de instalação (`INSTALLATION_ROLES`), não uma função de
organização (`ORGANIZATION_ROLES`), então não tem entrada na correspondência declarada de função para
capacidade nem lista de capacidades gerada aqui — sua autoridade é um conjunto fixo e pequeno de ações
em nível de instalação, descritas diretamente.

## O que pode fazer

- Criar uma nova organização, nomeando seu alias, nome de exibição, idioma principal e fuso horário, e
  convidar seu primeiro administrador na mesma etapa.
- Listar, criar e remover super-admins de instalação, por ID de principal.
- Acessar a lista de usuários de qualquer organização, por alias, para mudar a função ou o status de um
  usuário — sem precisar de associação a essa organização.
- Instalar um módulo de disciplina ou perfil de torneio por alias, um intervalo de versão opcional, e
  uma fonte alternativa opcional; listar, verificar, remover, e verificar atualizações dos módulos
  instalados.
- Criar uma nova disciplina ou perfil de torneio pelo assistente guiado de administração de plataforma,
  produzindo um pacote de módulo que essa mesma autoridade de instalação então instala.

## O que não pode fazer

Nada alcança os próprios dados de torneio de uma organização: nenhum fixture, resultado ou inscrição é
visível ou editável através desta função. Isso pertence ao próprio painel de controle de cada
organização, alcançado por um [admin](/pt/help/roles/admin/), não por super-admin atuando através do
console de instalação.

## Telas que vê

A tela de administração de plataforma, e nenhuma outra tela do painel de controle — as telas limitadas
a uma organização pertencem a uma função de organização, que super-admin não possui apenas por ser
super-admin.
