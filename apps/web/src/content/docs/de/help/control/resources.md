---
title: Austragungsorte & Offizielle
description: Austragungsorte und Offizielle einer Organisation auflisten, erstellen und bearbeiten — was der Spielplan-Editor zuweist.
capabilities:
  - tournament-engine/resource-scheduling
roles:
  - admin
---

## Wofür dieser Bildschirm ist

Die Austragungsorte und Offiziellen einer Organisation werden hier verwaltet: der Ressourcenpool, den
der Spielplan-Editor den Begegnungen einer Phase zuweist. Beide sind über jedes Turnier hinweg
wiederverwendbar, das diese Organisation durchführt — einmal erstellt, so oft wie nötig zugewiesen.

## Wichtige Felder

- **Name / Alias / Kapazität des Austragungsorts**: die Identität eines Austragungsorts und wie viele
  Begegnungen er gleichzeitig aufnehmen kann (ein Verein mit drei Plätzen ist ein Austragungsort mit
  Kapazität drei, nicht drei Austragungsorte).
- **Details zum Austragungsort**: Freitext, für einen Bediener zum Lesen — eine Adresse, ein Belag,
  oder für einen virtuellen Austragungsort (einen Spielserver) dessen Adresse, Region oder aktuelle
  Karte. Wird nie validiert oder geparst.
- **Name / Rollen des Offiziellen**: die Identität eines Offiziellen und die Rollen, denen er
  zugewiesen werden kann (Schiedsrichter, Assistent, Tischoffizieller, Beobachter).

## Was Sie hier nicht tun können

Das Löschen eines Austragungsorts oder Offiziellen ist noch nicht verfügbar — einer, der versehentlich
erstellt und nie verwendet wurde, kann einfach ignoriert werden. Die Zuweisung eines Austragungsorts
oder Offiziellen zu einer bestimmten Begegnung erfolgt im Spielplan-Editor, nicht hier.
