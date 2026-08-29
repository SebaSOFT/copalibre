---
title: Séries de várias partidas
description: Declarar uma série, o que cada classe de resolução faz, agendar suas partidas, e ler uma na chave pública.
capabilities:
  - tournament-engine/match-series
roles:
  - admin
  - referee
  - broadcaster
  - viewer
---

## O que é uma série

Uma série resolve um confronto entre dois participantes com mais de uma partida em vez de uma. Ela não
tem tela própria — é declarada no assistente de
[criação de torneio](/help/control/tournament-authoring), agendada em
[horários](/help/control/schedule), registrada partida por partida no
[console ao vivo](/help/control/match-console) ou [carregada](/help/control/load-match-data) depois, e
lida na chave pública. Um confronto que não declara série gera exatamente uma partida e se comporta
exatamente como sempre.

## Declarando uma

Uma série declara uma extensão (quantas partidas pode disputar) e uma classe de resolução:

- **Melhor de**: a série termina assim que um lado venceu partidas suficientes para tornar as
  restantes irrelevantes. Uma extensão melhor-de precisa ser ímpar, para que uma maioria seja sempre
  possível.
- **Agregado**: o vencedor é quem marcou mais no total ao longo de todas as partidas, somadas — não
  quem venceu mais partidas individuais.
- **Pontos por etapa**: cada partida da série concede seus próprios pontos, e o vencedor da série é
  quem acumula mais pontos no total.

Uma série também pode ser marcada como disputada em campo neutro, e sua classificação pode contar cada
partida separadamente (padrão — cada partida soma seu próprio triunfo, empate ou derrota) ou a série
inteira (toda a série soma um único resultado, não importa quantas partidas foram necessárias).

## Agendando e jogando

Cada partida da série recebe seu próprio horário e seus próprios árbitros na tela de
[horários](/help/control/schedule). Assim que a série é decidida — um lado garantiu um melhor-de, ou
restam poucas partidas capazes de mudar o resultado — suas partidas restantes são marcadas como não
mais necessárias, em vez de ficarem com aparência de não agendadas ou abandonadas.

## O que você não pode fazer aqui

Uma partida já jogada e registrada não pode ser "desjogada" declarando a série novamente: corrigir uma
partida finalizada de uma série decidida passa pelo
[fluxo de correção auditada](/help/control/corrections), que bloqueia explicitamente que uma correção se
propague para uma fase que já começou a usar o resultado da série.
