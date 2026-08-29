---
title: Revisão de inscrições
description: O que fazem aceitar, rejeitar ou retirar uma inscrição, e como importar participantes por CSV.
capabilities:
  - control-web/registration-review
roles:
  - admin
  - club-admin
---

## Para que serve esta tela

Revisa cada participante ou equipe inscrito antes da publicação do torneio, e decide se cada um fica
aceito, rejeitado ou retirado. Cada decisão é auditada individualmente com o estado anterior, o
estado resultante e quem a tomou.

## Campos principais

- **Status**: pendente, aceito, rejeitado ou retirado. Só transições válidas são permitidas a partir
  de cada status — a tela não deixa aplicar uma decisão ilegal (por exemplo, aceitar algo já
  rejeitado).
- **Importar por CSV**: envie um arquivo de participantes; o sistema valida o conteúdo e mostra uma
  prévia linha por linha antes de confirmar. Nenhuma linha com erro é importada até que o arquivo
  seja corrigido e reenviado.
- **Inscritos que precisam de uma abreviação**: um entrante que colide em toda etiqueta curta derivada
  automaticamente é registrado sem uma definida, e do contrário fica invisível — esta seção lista
  esses entrantes e permite que você defina uma diretamente. Um valor já usado por outro entrante do
  torneio é recusado na hora, nomeando o conflito; um entrante resolvido desaparece da lista.
- **Revisão em massa**: aplica a mesma decisão a várias inscrições de uma vez; cada uma continua
  sendo auditada separadamente, não como um único evento agregado.

## O que esta tela NÃO faz

Não altera resultados de partidas nem o chaveamento — é exclusivamente sobre quem participa, antes
de o torneio começar.
