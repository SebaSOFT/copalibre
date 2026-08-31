---
title: Correções e conflitos offline
description: Pré-visualizar uma correção, o que uma correção de série faz, e por que um resultado na fila contra uma partida anulada é mantido, não descartado.
capabilities:
  - tournament-engine/result-correction-authority
  - live-operations/live-match-operations
roles:
  - admin
  - referee
---

## Por que uma correção nunca é uma edição direta

Um resultado calculado não pode ser sobrescrito. Depois que uma partida é finalizada, alterá-la passa
por uma correção auditada — uma ação explícita que registra quem fez, quando, por quê, o estado anterior
e o estado resultante. Este é o único caminho de volta a um resultado finalizado, a partir do
[console ao vivo](/help/control/match-console), dos
[dados de partida carregados](/help/control/load-match-data), ou de [horários](/help/control/schedule).

## Pré-visualize antes de aplicar

Uma correção pré-visualiza seu próprio impacto a jusante antes de ser aplicada: quais classificações,
tabelas e projeções mudariam se ela fosse aplicada. Nada é recalculado até que a correção seja
explicitamente confirmada.

Uma correção não se propaga automaticamente para uma fase que já começou a usar o resultado sendo
corrigido — um resultado da fase de grupos que alimenta uma chave já iniciada não reembaralha essa chave
silenciosamente. A correção ainda se aplica ao registro; a fase a jusante fica sinalizada para a própria
revisão do organizador, em vez de ser reescrita por ele automaticamente.

## Corrigindo uma partida de uma série

Corrigir uma partida de uma [série](/help/control/series) pré-visualiza seu efeito sobre toda a série,
não apenas sobre aquela partida — um placar corrigido pode inverter qual lado está liderando um
melhor-de, ou mudar um total agregado, e a pré-visualização mostra isso antes de a correção ser
confirmada.

## Por que um resultado offline na fila pode ser recusado e mantido

O console de partida continua funcionando offline e envia as ações na fila assim que a conectividade
volta. Um resultado na fila pode ser recusado ao reconectar — na maioria das vezes porque a partida à
qual se referia foi anulada por uma decisão de série enquanto o operador registrava offline, e nunca
será jogada. Esse item na fila não é descartado: seu conteúdo completo permanece na fila, recusado, para
que o operador possa julgar se o resultado pertence a outro lugar — tipicamente como correção de uma
partida anterior da mesma série — em vez de perder o que foi registrado. Uma recusa em um item nunca
bloqueia o restante da fila de ser processado.
