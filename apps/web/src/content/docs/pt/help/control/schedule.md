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

## O que você não pode fazer aqui

Reagendar uma partida já finalizada é recusado: seu horário já é um registro, não um plano, e alterá-lo
passa pelo [fluxo de correção auditada](/help/control/corrections). Uma partida sem horário atribuído é
mostrada explicitamente como sem partida agendada — nunca omitida silenciosamente, e nunca confundida com
um bye de chave. Criar ou editar um local ou árbitro acontece em
[locais e árbitros](/help/control/resources), não aqui.
