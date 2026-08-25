---
title: Plano de promoção
description: Configure como os grupos de uma zona se combinam nas cabeças de chave da próxima fase — revisado antes de aplicar.
---

## Para que serve esta tela

Depois que os grupos de uma zona terminam sua fase de todos contra todos, esta tela configura quantos
entrantes avançam de cada grupo e como esses grupos se combinam em uma única lista ordenada para a
próxima fase. Em seguida, mostra essa lista ordenada e calculada para revisão — ela nunca cria nem
altera nenhuma configuração de cabeças de chave por conta própria.

## Campos principais

- **Entrantes que avançam por grupo**: quantos entrantes de cada grupo são promovidos.
- **Faixas**: quando a próxima fase tem mais de uma zona, qual trecho contíguo da lista combinada vai
  para qual das zonas dessa fase.
- **Revisão**: a lista ordenada de candidatos que este plano promoveria, calculada sempre da mesma
  forma — nada é gravado na próxima fase até que um operador configure explicitamente suas cabeças de
  chave no construtor de cabeças de chave, que é pré-preenchido a partir de um plano revisado quando
  existe um.

## O que você não pode fazer aqui

Se um grupo tiver um empate não resolvido em sua própria linha de corte, esta tela informa isso em vez
de apresentar uma lista incompleta — resolva o empate (uma correção auditada, se o resultado de origem
precisar de uma) antes que uma lista combinada possa ser calculada.
