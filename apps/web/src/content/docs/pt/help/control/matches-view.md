---
title: Visão de partidas
description: Uma lista de cartões das partidas de um torneio, fácil de percorrer — local, cronômetro, último evento e contexto de classificação — no site público e no painel de controle.
capabilities:
  - public-web/matches-view
  - control-web/matches-view
roles:
  - admin
  - viewer
  - broadcaster
  - referee
---

## Para que serve esta tela

Seja qual for a estrutura de uma fase — um único grupo, várias zonas, ou uma série de várias partidas
— ela sempre se reduz a uma lista de partidas a jogar. Esta tela é essa lista, como uma grade de
cartões: o torneio inteiro por padrão, ou restrita a uma fase, uma zona/grupo, ou um estado (ao vivo,
próxima, final) com os filtros no topo. Ela complementa, em vez de substituir, a
[chave](/help/control/tournament-authoring) — a chave é a leitura certa para o avanço por eliminação;
esta é a leitura certa para percorrer volume, especialmente entre vários grupos de todos-contra-todos
simultâneos que uma chave não tem como mostrar de uma vez.

Existem duas versões desta tela, que compartilham o mesmo cartão:

- **Pública** (`/{organizacao}/tournaments/{torneio}/matches`) — anônima, sem necessidade de login.
- **Painel de controle** (`.../matches-view`) — acessível apenas por um admin da organização ou um
  tournament-admin com escopo neste torneio, a mesma autoridade que a tela de classificação interna já
  exige.

## O que cada cartão mostra

- **Estado**: ao vivo, próxima ou final, junto com um ícone para que o estado nunca dependa só da cor.
- **Cronômetro**: mostrado apenas enquanto a partida está em andamento — seu tempo decorrido atual, o
  mesmo valor que o console de partida ao vivo lê.
- **Local**: o nome do local atribuído, quando a programação já atribuiu um.
- **Último evento**: o evento registrado mais recentemente, seja qual for — este cartão nunca trata um
  tipo de evento como caso especial, então uma disciplina que declare um novo (uma confirmação de
  revisão, uma substituição) aparece corretamente sem nenhuma mudança nesta tela.
- **Zona/posição, ou estado da série** — nunca os dois no mesmo cartão:
  - Um confronto numa fase de zona/grupo sem série declarada mostra o nome da zona/grupo (quando a
    fase declara mais de um grupo padrão) e a posição atual de cada participante na classificação.
  - Um confronto resolvido por uma série mostra seu andamento e, uma vez resolvido, seu estado agregado
    — a mesma representação de série que a [chave pública](/help/control/series) já usa.
- **Fator decisivo**: não aparece no cartão. A classificação indica o critério de desempate abaixo das linhas que ele separou.
- **Página da partida**: ao abrir um cartão, chega-se à página da partida, com oficiais, escalações e a linha do tempo dos eventos. A linha do tempo mostra o tempo de jogo de cada evento e o placar após cada gol; cada tempo jogado abre e fecha com o seu placar. As escalações mostram quem está inscrito antes do início. Cada jogo de uma série tem a sua própria página, `?game=N`, acessível a partir da chave.

## O rastro completo no cartão de controle

O cartão público não traz linha de desempate. Um organizador com autoridade sobre a classificação interna deste torneio (um admin, ou um tournament-admin com autoridade sobre ele) vê o rastro completo do comparador na versão deste mesmo cartão no painel de controle, como já mostra o expansor de rastro da tela de classificação interna. Um espectador nunca vê um rastro parcial.

## O que esta tela NÃO faz

Ela é somente leitura. Nenhum cartão ou controle aqui muda o estado de uma partida, registra um
evento, nem edita o calendário — essas ações ficam no
[console de partida ao vivo](/help/control/match-console) e no
[construtor de horários](/help/control/schedule). Esta tela serve para acompanhar o que está
acontecendo e o que já aconteceu, não para operar uma partida.
