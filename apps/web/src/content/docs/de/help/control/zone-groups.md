---
title: Zonen und Gruppen
description: Erstellen Sie Zonen und Gruppen innerhalb einer Phase, und weisen Sie ihnen Teilnehmer zu.
capabilities:
  - control-web/zone-group-management
roles:
  - admin
---

## Wofür dieser Bildschirm ist

Manche Turniere teilen eine Phase in separate Zonen auf (z. B. „Goldpokal“ und „Silberpokal“), und
jede Zone in Gruppen, die untereinander eine Rundenrunde spielen. Dieser Bildschirm erstellt diese
Zonen und Gruppen und weist ihnen Teilnehmer zu — entweder über dieselbe deterministische,
beschränkungstreue automatische Auslosung, die auch für die Bracket-Setzung verwendet wird, oder durch
manuelle Platzierung jedes Teilnehmers.

Eine Phase, die noch nie eine explizite Zone oder Gruppe erstellt hat, zeigt genau eine von jeder —
die implizite, die jede Phase bereits hat.

## Wichtige Felder

- **Zone**: eine benannte Unterteilung einer Phase (z. B. ein separater Pokal innerhalb derselben
  Phase).
- **Gruppe**: eine benannte Unterteilung einer Zone, die eine Rundenrunde unter ihren eigenen
  Teilnehmern spielt.
- **Automatische Auslosung**: dieselbe deterministische, beschränkungstreue Zuweisung, die bereits der
  Bracket-Setzungs-Editor und die Lobby-Zuweisung für Läufe verwenden — läuft bei gleichem Seed
  identisch erneut ab.
- **Manuelle Platzierung**: jeden Teilnehmer direkt einer Zonen- oder Gruppennummer zuweisen, genau so
  erfasst, wie es das Ergebnis einer automatischen Auslosung wäre.

## In einer Zone ein anderes Format spielen

Standardmäßig spielt jede Zone das Format ihrer Phase. Öffnen Sie bei einer Zone **Zonenformat ändern**,
um ihr ein eigenes zu geben — zum Beispiel zwei K.-o.-Zonen und eine Ligazone für die übrigen Vereine —
und, wenn das Format es braucht, eine eigene Serienlänge. Die Ansicht kennzeichnet eine abweichende Zone
und zeigt das Format, das die anderen erben; mit **Format der Phase** kehrt eine Zone zum Format der Phase
zurück. Die Formatliste ist die, die die Disziplin des Turniers anbietet. Sobald die Phase Spiele hat,
sind Format und Serie der Zonen gesperrt.

Die öffentliche Phasenseite zeichnet dann jede Zone so, wie ihr Format es verlangt: einen Turnierbaum für
eine K.-o.-Zone und die Spiele mit ihrer Tabelle für eine Ligazone.

## Was Sie hier nicht tun können

Eine bereits erstellte Zone oder Gruppe umzubenennen ist noch nicht möglich — benennen Sie sie bei der
Erstellung sorgfältig.
