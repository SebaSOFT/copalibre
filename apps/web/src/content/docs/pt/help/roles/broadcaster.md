---
title: Transmissão
description: O que a função broadcaster pode fazer, o que herda, e o que não pode fazer.
capabilities:
  - control-web/roles-permissions
roles:
  - broadcaster
---

## Para que serve esta função

Uma função atribuível na taxonomia da organização, pensada para alguém que produz uma transmissão em
torno de um torneio em vez de administrá-lo.

## O que pode fazer

<!-- GENERATED:CAPABILITIES:START -->

Nenhuma capacidade é concedida a esta função hoje.

<!-- GENERATED:CAPABILITIES:END -->

Dito com clareza em vez de deixado em silêncio: nenhuma rota admite hoje broadcaster em nada que a
correspondência declarada nomeie, então isto é o que a função realmente concede neste momento, não um
espaço reservado à espera de documentação. As superfícies de leitura pública — resumos ao vivo, tabelas
e chaveamentos publicados, rotas de TV/overlay servidas por um token de exibição — não precisam de
nenhuma função de organização e permanecem acessíveis independentemente de broadcaster estar atribuído.

## O que herda

Nada — nenhuma função herda de broadcaster, e ele não herda de nenhuma.

## O que não pode fazer

Tudo o que uma capacidade de organização protege: nenhuma administração de usuários, clubes ou
torneios, nenhuma operação de partida, nenhuma revisão de denúncias, nenhuma exportação ou importação
de dados. Atribuir broadcaster concede associação na taxonomia da organização sem conceder nenhuma
autoridade operacional dentro dela.

## Telas que vê

Cada tela do painel de controle exceto "Funções" — a mesma navegação que um viewer vê, já que nenhuma
das duas funções possui `org.manage-users`, e nenhuma possui também nenhuma outra capacidade que
alguma tela limite hoje.
