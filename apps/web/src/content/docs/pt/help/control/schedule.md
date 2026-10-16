---
title: Horários
description: Atribua cada partida a um horário — um horário de início, local e duração declarados — e os árbitros que a trabalham.
capabilities:
  - control-web/match-scheduling
  - tournament-engine/schedule-slots
roles:
  - admin
---

## Para que serve esta tela

Cada partida de uma fase recebe um horário aqui — uma visão de calendário e uma visão de lista sobre o
mesmo lote. Um horário não é digitado à mão por partida: é um início, local e duração declarados uma vez
no conjunto de recursos de [locais e árbitros](/help/control/resources), e o construtor de horários
atribui uma partida a um deles, não o contrário. Os árbitros são ativados por partida a partir do mesmo
conjunto de recursos.

## Granularidade de partida, não de confronto

O agendamento opera sobre a partida, não sobre o confronto entre dois participantes. Um confronto de uma
única partida tem uma partida para posicionar; uma [série](/help/control/series) de cinco tem cinco,
cada uma com seu próprio horário e seus próprios árbitros — a quarta e a quinta partida da série podem
ficar em horários reservados nunca preenchidos se a série for decidida antes, e o construtor as marca
como não mais necessárias em vez de deixá-las com aparência de não agendadas.

## Pré-visualize antes de publicar

Antes de qualquer publicação, o construtor pré-visualiza o lote e mostra cada conflito — um local ou
árbitro com reserva dupla, uma violação da regra de descanso — nomeando as partidas envolvidas, e nomeia
qualquer partida já publicada que o lote moveria. Publicar é atômico: cada atribuição do lote entra em
vigor junto, ou nenhuma entra.

## Quanto tempo uma partida ocupa o horário

Uma partida alocada ocupa o início do seu horário mais a sua **duração estimada**: o tempo
regulamentar da disciplina (por exemplo, dois tempos de 25 minutos, 50 minutos), com a quantidade de
períodos própria do torneio. Uma disciplina sem tempo regulamentar (jogada em sets, por exemplo) ocupa
o horário inteiro. O local também fica reservado durante a troca entre partidas. Assim, horários
curtos nunca escondem um choque: duas partidas de 50 minutos com quinze minutos de diferença no mesmo
local são um conflito.

A regra de descanso vem das [configurações](/help/control/tournament-authoring) do torneio: o
descanso mínimo entre o fim de uma partida de um participante e o início da próxima. Um torneio que
não declara nenhuma não aplica regra de descanso.

## Alterar uma partida publicada pede um motivo

Mover, trocar a arbitragem ou retirar uma partida já **publicada** pede o motivo antes de publicar. A
janela lista cada partida publicada alterada com horário e local antigos e novos. Informe um motivo
para o lote inteiro — escolha um comum, um usado recentemente ou digite o seu — ou marque uma partida
como exceção com seu próprio motivo (o botão "Outro motivo" da linha, ou selecione várias linhas e
marque juntas). Publicar fica desabilitado até que todas as partidas listadas tenham motivo. O
horário, o local, o início e a arbitragem anteriores ficam guardados com o motivo, a pessoa e o
momento. Um lote de primeiras alocações é publicado sem perguntar.

Pelo teclado: ↑/↓ movem entre partidas, Espaço seleciona, E marca uma exceção, Enter publica e Esc
fecha: primeiro a lista de sugestões aberta, depois a caixa de diálogo.

## Retirar uma partida do horário

"Retirar do horário" tira uma partida alocada do seu horário dentro do lote: a pré-visualização a
mostra sem horário e lista os horários liberados, para que outra partida ocupe um deles na mesma
publicação.

## O que você não pode fazer aqui

Reagendar uma partida já finalizada é recusado: seu horário já é um registro, não um plano, e alterá-lo
passa pelo [fluxo de correção auditada](/help/control/corrections). Uma partida sem horário atribuído é
mostrada explicitamente como sem partida agendada — nunca omitida silenciosamente, e nunca confundida com
um bye de chave. Criar ou editar um local ou árbitro acontece em
[locais e árbitros](/help/control/resources), não aqui.
