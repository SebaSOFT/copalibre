---
title: Detalhamento de Estatísticas do Jogador
description: O total do torneio e o detalhamento partida a partida no perfil público do jogador.
capabilities:
  - tournament-engine/player-statistics-drilldowns
roles:
  - viewer
  - broadcaster
---

## Visão Geral

A página de perfil público de um jogador mostra uma linha de total do torneio e um detalhamento
partida a partida para cada tabela de classificação em nível de pessoa declarada pela modalidade
do torneio — o espectador alterna entre as tabelas declaradas (por exemplo, "artilheiros" e
"assistências" de uma modalidade) por meio de um seletor rotulado, sem sair do perfil.

## Total do Torneio vs. Linhas de Partida

- A linha de **total do torneio** mostra todo tipo de coluna declarado pela tabela: valores
  atômicos (coletores) e qualquer razão composta ou calculada ao longo de todo o torneio (por
  exemplo, gols por partida).
- Cada **linha de partida** mostra apenas as colunas atômicas (do tipo coletor) daquela partida —
  uma razão composta ou calculada depende de mais de uma partida e, portanto, nunca aparece em uma
  linha de partida. As linhas de partida são ordenadas cronologicamente por fase e número da
  partida, e identificam a partida pelo seu número público de fase/partida, nunca por um
  identificador interno.

## Quando um Jogador Não Tem Estatísticas Registradas

Um jogador sem participação no elenco das partidas finalizadas do torneio vê um estado vazio
explícito na seção de estatísticas do torneio, em vez de uma tabela que sugira partidas com
valores zerados que nunca ocorreram.
