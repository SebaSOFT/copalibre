---
title: Superfícies de transmissão e públicas
description: Tokens de exibição para telas de TV no local e overlays de streaming, e o que um espectador vê no site público.
capabilities:
  - live-operations/broadcast-tv-surfaces
  - live-operations/tv-dashboard-localization
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

## Estúdio do transmissor

`/control/<organization>/tournaments/<tournament>/broadcaster` é um console de autoatendimento
para um streamer ou operador de mídia: ele emite automaticamente seu próprio token de exibição,
permite escolher o modo de sobreposição (uma faixa inferior sobre sua câmera, ou uma cena em tela
cheia sem câmera) e um fundo de pré-visualização (transparente, tela verde, tela magenta ou um
fundo escuro de estádio), e fornece uma URL de OBS Browser Source pronta para colar com
pré-visualização ao vivo — nenhum administrador precisa te dar um token nem compartilhar o próprio
login. Enquanto essa sobreposição estiver aberta, um gol, ponto ou cartão registrado ao vivo exibe
um aviso animado com o nome do time e do jogador, e se fecha sozinho — nunca precisa que alguém no
local o acione ou feche.

## O que a tela do local mostra

A tela em rotação completa percorre a classificação, os destaques, as estatísticas do torneio e, quando a fase em destaque a tem, a chave e depois a lista de jogos. Um endereço com `?view=standings` ou `?view=matches` fixa essa única seção em tela cheia em vez de girar (`?view=fixtures` continua funcionando como o nome antigo de `matches`). O resumo do campeão de um torneio encerrado pertence somente à tela em rotação. O cabeçalho nomeia o estado do torneio: um em andamento mostra um relógio rotulado, ao minuto, no fuso horário da organização; um encerrado mostra o dia do seu último jogo, sem relógio correndo.

Um jogo fixado — `/tv/<organização>/tournaments/<torneio>/stages/<fase>/matches/<número>` — é identificado como na página pública do jogo, pelo seu número dentro da fase, e sempre mostra placar, lados e eventos registrados, encerrado ou não. Um número que a fase não tem é informado como um jogo que não existe.

Uma fase pode misturar formatos, então a tela apresenta cada zona pelo formato que ela joga:

- **Classificação**: Cada zona que ordena participantes em uma tabela tem a sua própria tabela, com o nome da zona no cabeçalho. As linhas de zonas diferentes nunca se misturam em uma mesma classificação, e cada tabela mostra até oito linhas. Uma fase cujas zonas jogam todas o formato da fase mantém uma única tabela sem cabeçalho.
- **Chave**: As zonas que jogam um formato eliminatório são desenhadas como chave.
- **Jogos**: Lista todos os jogos do torneio em uma tabela compacta, dois por linha com abreviações e placar, uma página por vez; as páginas avançam com a rotação e uma visão `matches` fixa continua paginando.

A sobreposição do terço inferior não muda: ela nomeia uma partida, não uma fase.

### Sobreposições: um jogo, séries e sets

Uma sobreposição (`?mode=overlay`) mostra só o jogo que lhe foi dado: o nomeado em seu endereço (`/tv/<organização>/tournaments/<torneio>/stages/<fase>/matches/<número>?mode=overlay`) ou, com `?court=<quadra>`, o jogo ao vivo dessa quadra. Aberta sem nenhum dos dois, informa que nenhum jogo está selecionado e não mostra placar, de modo que duas sobreposições nunca mostram o mesmo jogo por acaso. Um jogo dentro de uma série mostra como está a série (jogos ganhos por cada lado e o jogo em andamento) junto ao placar, e um jogo disputado em sets mostra os sets já jogados e o que está em andamento, com o lado mandante primeiro e o rótulo de set da disciplina no idioma da página. Uma disciplina jogada em períodos cronometrados nomeia, em vez disso, o período em andamento. Um jogo sem nada disso aparece como antes.

### O lançador de tela

`/tv` é um lançador que monta o endereço de uma tela do local ou de uma sobreposição: escolha a organização, o torneio e a visão (rotativa, classificação, lista de jogos, um jogo fixado ou a sobreposição de transmissão), o fundo e o idioma. O idioma muda na hora os textos do próprio lançador, sem recarregar. As fases aparecem com número e nome, e os jogos são agrupados por zona e grupo com a rodada, os dois participantes e o número (`#34`). As visões de jogo fixado e de sobreposição pedem um jogo e o link de lançamento o leva, de modo que várias sobreposições podem mostrar cada uma o seu jogo; uma sobreposição pode, em vez disso, seguir o jogo ao vivo de uma quadra (`court=`).

## O que um espectador vê no site público

O site público (sem login) mostra a classificação, a chave e os relatórios de partida de um torneio
conforme são publicados, no mesmo endereço organização/torneio usado pelo painel de controle e pelas
superfícies `/tv/**`. Uma [série](/help/control/series) em andamento mostra seu placar ao vivo e qual
lado está vencendo na chave pública da mesma forma que no painel de controle, e uma partida ainda não
agendada é mostrada como tal, nunca é adivinhada.

No ecrã de TV, o resumo de um torneio terminado decidido zona a zona lista o campeão ou os campeões partilhados de cada zona da última fase sob o nome da zona, os mesmos vencedores que a visão geral pública mostra. Um torneio com um único campeão mantém a apresentação de campeão único, e o líder da tabela de uma fase anterior nunca é apresentado como campeão.

## O que você não pode fazer aqui

Nenhuma das duas superfícies aceita entrada de um espectador ou de um dispositivo de TV: ambas são
representações somente leitura de dados já publicados. Alterar o que é publicado acontece no próprio
painel de controle da organização, não nas superfícies públicas nem `/tv/**`.
