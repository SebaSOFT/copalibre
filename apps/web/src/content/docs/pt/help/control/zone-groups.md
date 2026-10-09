---
title: Zonas e grupos
description: Crie zonas e grupos dentro de uma fase, e atribua entrantes a eles.
capabilities:
  - control-web/zone-group-management
roles:
  - admin
---

## Para que serve esta tela

Alguns torneios dividem uma fase em zonas separadas (por exemplo, "Copa Ouro" e "Copa Prata"), e cada
zona em grupos que jogam entre si todos contra todos. Esta tela cria essas zonas e grupos, e atribui
entrantes a eles — seja pelo mesmo sorteio automático determinístico e respeitando restrições usado
para as cabeças de chave, seja posicionando cada entrante manualmente.

Uma fase que nunca teve uma zona ou grupo explícito criado mostra exatamente um de cada — o implícito
que toda fase já tem.

## Campos principais

- **Zona**: uma subdivisão nomeada de uma fase (por exemplo, uma copa separada dentro da mesma fase).
- **Grupo**: uma subdivisão nomeada de uma zona, jogando todos contra todos entre seus próprios
  entrantes.
- **Sorteio automático**: a mesma atribuição determinística e que respeita restrições já usada pelo
  construtor de cabeças de chave e pela atribuição de lobbies de séries — repete-se de forma idêntica
  dada a mesma semente.
- **Posicionamento manual**: atribuir cada entrante diretamente a um número de zona ou grupo,
  registrado exatamente como ficaria o resultado de um sorteio automático.

## Jogar um formato diferente em uma zona

Por padrão, cada zona joga o formato da sua fase. Abra **Alterar o formato da zona** em uma zona para dar
a ela um formato próprio — por exemplo, duas zonas de mata-mata e uma liga de pontos corridos para os
clubes restantes — e, se o formato exigir, seu próprio tamanho de série. A tela marca a zona personalizada
e mostra o formato que as demais herdam; escolher **Formato da fase** devolve a zona ao da fase. A lista de
formatos é a que a modalidade do torneio oferece. Depois que a fase tem jogos, o formato e a série das
zonas ficam bloqueados.

A página pública da fase então desenha cada zona como seu formato pede: uma chave para uma zona de
mata-mata, e os jogos com a tabela de classificação para uma zona de liga.

## O que você não pode fazer aqui

Renomear uma zona ou grupo já criado ainda não está disponível — nomeie com cuidado ao criar.
