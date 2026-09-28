---
title: Portal do clube
description: O diretório de membros próprio de um administrador de clube e o envio do elenco do torneio.
capabilities:
  - control-web/club-portal
roles:
  - club-admin
  - admin
---

## Para quem é isto

O Portal do clube é um espaço de autoatendimento para um `club-admin` — um usuário cujo papel está
limitado a um clube específico, em vez de à organização inteira. Tudo aqui está restrito a esse
clube: um administrador de clube nunca pode ver ou alterar membros, equipes ou inscrições de outro
clube.

## Diretório de membros

`/control/<organização>/clubs/<clube>/portal/members` lista todos que já estão afiliados ao seu
clube e permite adicionar uma nova pessoa (nome e, opcionalmente, apelido e data de nascimento) ou
corrigir o nome ou apelido de um membro existente. Um membro adicionado aqui pertence ao seu clube
desde o momento em que é criado — não há uma etapa separada de "atribuir ao clube".

Nacionalidade, foto e outros detalhes de identidade continuam sendo tarefa de um administrador da
organização, exatamente como hoje para qualquer registro de pessoa.

## Enviando o elenco de um torneio

`/control/<organização>/clubs/<clube>/portal/tournaments/<torneio>/roster` orienta você a inscrever
seu clube em um torneio aberto:

1. Escolha uma das equipes existentes do seu clube, ou crie uma nova.
2. Selecione quais membros do seu clube compõem o elenco e atribua a cada um uma função — jogador,
   suplente, técnico ou equipe técnica.
3. Envie. Isso registra sua equipe como participante **pendente** com esse elenco anexado — o mesmo
   estado pendente em que qualquer inscrição começa.

Um administrador do torneio revisa e aprova a inscrição em sua própria tela de revisão de
inscrições; nada nessa etapa muda pelo fato de você mesmo tê-la enviado. Você sempre pode voltar e
preparar outra equipe para um torneio diferente — nada aqui é uma ação única.
