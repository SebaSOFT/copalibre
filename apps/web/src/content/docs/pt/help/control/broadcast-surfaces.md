---
title: Superfícies de transmissão e públicas
description: Tokens de exibição para telas de TV no local e overlays de streaming, e o que um espectador vê no site público.
capabilities:
  - live-operations/broadcast-tv-surfaces
  - live-operations/public-live-surfaces
  - public-web/public-web-shell
roles:
  - broadcaster
  - admin
---

## Tokens de exibição

Uma rota `/tv/**` — uma exibição em rotação completa ou uma partida única fixada, como página normal ou
como `?mode=overlay` transparente para captura por chroma-key em uma transmissão — é autorizada por um
token de exibição próprio do dispositivo, não pelo login de uma pessoa. O token é emitido a partir do
painel da organização, vinculado a uma rota `/tv/**` específica, e revogável de forma independente:
revogar o token de um dispositivo interrompe apenas esse dispositivo, e nenhum outro dispositivo ou
sessão de qualquer pessoa é afetado.

Um dispositivo com um token válido não precisa de ninguém presente para continuar funcionando. Ele
sobrevive a um corte de energia sem pedir credenciais novamente, e se recupera silenciosamente de uma
conexão perdida ou dados indisponíveis — uma superfície `/tv/**` nunca mostra um erro que uma pessoa
precisaria fechar.

## O que um espectador vê no site público

O site público (sem login) mostra a classificação, a chave e os relatórios de partida de um torneio
conforme são publicados, no mesmo endereço organização/torneio usado pelo painel de controle e pelas
superfícies `/tv/**`. Uma [série](/help/control/series) em andamento mostra seu placar ao vivo e qual
lado está vencendo na chave pública da mesma forma que no painel de controle, e uma partida ainda não
agendada é mostrada como tal, nunca é adivinhada.

## O que você não pode fazer aqui

Nenhuma das duas superfícies aceita entrada de um espectador ou de um dispositivo de TV: ambas são
representações somente leitura de dados já publicados. Alterar o que é publicado acontece no próprio
painel de controle da organização, não nas superfícies públicas nem `/tv/**`.
