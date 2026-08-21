---
title: Console de partida ao vivo
description: O que o console de partida faz, e o que não pode mais mudar depois de um resultado registrado.
---

## Para que serve esta tela

Esta é a tela de operação de uma partida em andamento: registrar eventos e segmentos à medida que
ocorrem, e registrar o resultado final quando a partida termina. O que se faz aqui é transmitido ao
vivo para a tela pública do torneio.

## Campos principais

- **Evento**: um fato pontual da partida (um ponto, um cartão, uma substituição) registrado com seu
  momento exato — forma o histórico reconstituível da partida, não apenas o placar final.
- **Segmento**: uma divisão da partida com seu próprio cronômetro (um set, um período). O cronômetro
  e o resultado são gerenciados por segmento, não como um único cronômetro para toda a partida.
- **Resultado**: o resultado final da partida, registrado uma única vez. Uma vez registrado, não é
  sobrescrito nesta tela — qualquer correção posterior passa pelo fluxo auditado de
  correção/substituição, não recarregando aqui.

## O que você não pode fazer depois de registrar o resultado

Uma vez finalizada a partida, esta tela não permite mais adicionar eventos como se a partida
continuasse, nem recarregar o resultado diretamente. Isso é intencional: protege a integridade do
histórico já publicado.

## Trabalhando com uma conexão instável

A conectividade à beira do campo cai. Esta tela foi feita para isso: registrar um evento, ajustar o
cronômetro, selecionar uma convocação ou finalizar uma partida grava primeiro numa fila local
durável — _antes_ mesmo de tentar enviar — para que uma queda de sinal nunca faça perder algo que
você já fez.

- **O status de sincronização** está sempre visível no topo da tela: se você está online, quantas
  ações ainda aguardam envio, e quando a última realmente foi sincronizada.
- **Uma ação enfileirada permanece enfileirada**, sem se perder, mesmo com conexão instável, uma
  zona sem sinal, ou até fechando e reabrindo esta tela — reabri-la retoma o envio do que ainda
  estiver pendente.
- **Assim que a conectividade volta**, tudo que estava na fila é enviado automaticamente, na ordem
  em que você fez.
- **Uma ação recusada** — uma que o servidor também teria recusado ao vivo, como uma mudança de
  convocação enviada depois que a partida já terminou — é exibida com clareza, com o motivo, para
  que você saiba exatamente o que precisa da sua atenção. Ela nunca bloqueia o que ficou na fila
  depois dela.

O que esta tela não faz: recuperar uma digitação ou seleção que você nunca chegou a enviar. Se você
estava no meio de uma edição quando a conexão caiu, essa entrada específica se perde como sempre —
só as ações que você já tentou registrar estão protegidas.
