---
title: Carregar dados da partida
description: Entrada em lote/estruturada para uma partida jogada sem console ao vivo presente.
capabilities: []
roles:
  - admin
  - referee
---

## Para que serve esta tela

Nem toda partida tem um operador no console enquanto está sendo jogada. Esta tela permite carregar o
elenco de uma partida, seu histórico completo de eventos e seu resultado final juntos, depois do fato —
para um clube reportando uma partida fora de casa, ou um organizador colocando em dia um acúmulo de
súmulas em papel.

Aplica-se apenas a uma partida agendada sem atividade previamente registrada. Uma partida que já tem
eventos ou segmentos de uma sessão ao vivo deve ser finalizada pelo
[console ao vivo](/help/control/match-console) em vez disso — carregar um segundo histórico sobre um ao
vivo entraria em conflito com ele.

## Campos principais

- **Elenco**: a mesma seleção de jogadores por entrante que o console ao vivo oferece, mantida apenas
  nesta tela até você enviar — nada é salvo na partida até que o lote inteiro seja enviado.
- **Segmentos**: cada período/tempo/set que a partida teve, na ordem de jogo, cada um já marcado como
  concluído com sua duração. Não há relógio ao vivo aqui.
- **Eventos**: o histórico completo da partida, na ordem em que realmente aconteceu, cada um com seu
  próprio horário real — não o momento em que você está inserindo.
- **Resultado**: o resultado final da partida, enviado junto com tudo acima.

## Um único envio, tudo ou nada

Pressionar "Enviar dados da partida" envia o elenco, cada evento e o resultado juntos, em uma única
transação. Se um único evento for inválido, nada é registrado — o envio inteiro é recusado, e o que
você inseriu permanece na tela para que você corrija a única entrada que falhou e reenvie, em vez de
começar de novo.

## Importando de uma planilha

A seção "Importar de CSV" carrega uma planilha no mesmo editor acima, para revisão antes do envio —
nunca pula a etapa de revisão nem a validação do envio. Baixe o modelo para saber o formato exato de
colunas que um arquivo precisa.
