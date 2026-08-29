---
title: Importar e exportar
description: Importação em massa de participantes por CSV, e exportação CSV/JSON de participantes, resultados, classificação e configuração do torneio.
capabilities:
  - control-web/data-import-export
roles:
  - admin
---

## Importar

Participantes são importados em massa por CSV a partir da tela de
[revisão de inscrições](/help/control/registration-review). Cada linha é validada antes de qualquer
gravação: uma linha que falha na validação é reportada com seu número de linha e motivo, e nenhuma linha
é importada até que o arquivo inteiro seja aceito, ou corrigido e reenviado — um arquivo parcialmente
importado não é um estado que esta tela produz. Um CSV exportado anteriormente desta mesma instalação é
reimportado sem problemas, então fazer o percurso completo com uma lista de participantes (editá-la em
uma planilha, trazê-la de volta) é um caminho suportado, não um acidente.

## Exportar

- **Participantes**: elencos individuais ou de equipe, por alias — acessado a partir de
  [revisão de inscrições](/help/control/registration-review).
- **Resultados e classificação**: os resultados calculados e a tabela de classificação de uma fase, por
  alias — acessado a partir de [classificação](/help/control/standings).
- **Configuração do torneio**: o regulamento completo, as substituições e os scripts personalizados
  como JSON, a partir do painel da organização — o mesmo documento que uma instalação nova poderia
  reimportar para reproduzir as regras do torneio, não seus resultados.

Cada exportação substitui um identificador interno do banco de dados pelo alias público da entidade,
então um arquivo exportado nunca vaza um identificador que nada fora da instalação deveria ver.

## O que você não pode fazer aqui

Importar resultados ou classificação não é suportado — esses são calculados, não digitados, e a única
forma de alterar um depois é o [fluxo de correção auditada](/help/control/corrections).
