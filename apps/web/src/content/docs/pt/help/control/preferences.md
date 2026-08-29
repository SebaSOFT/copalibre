---
title: Preferências
description: Gerencie seus tokens de acesso pessoal e suas configurações pessoais do CopaLibre.
capabilities:
  - platform/internationalization
  - platform/native-auth
  - platform/personal-access-tokens
roles:
  - admin
  - club-admin
  - referee
  - broadcaster
  - viewer
---

## Para que serve esta tela

A tela de preferências permite gerenciar suas configurações pessoais no CopaLibre.

## Tokens de acesso pessoal

Você pode gerar tokens de acesso pessoal (PAT) para autenticar-se na API ou no servidor MCP do
CopaLibre sem usar seu usuário e senha.

- **Gerar um token**: insira um rótulo e uma duração de expiração, depois clique em "Gerar". Certifique-se
  de copiar o token imediatamente, pois ele não pode ser visualizado novamente.
- **Revogar um token**: se um token for comprometido ou não for mais necessário, você pode revogá-lo a
  qualquer momento.

Esses tokens não têm estado e verificam sua identidade a cada requisição.
