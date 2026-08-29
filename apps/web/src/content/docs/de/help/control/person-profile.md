---
title: Personenprofil
description: Foto, Anzeigename, Staatsangehörigkeit und natürlicher Schlüssel einer Person, erreichbar über den Bildschirm zur Anmeldungsprüfung.
capabilities:
  - control-web/identity-visuals
roles:
  - admin
  - club-admin
---

## Wofür dieser Bildschirm ist

Zeigt die Identität einer registrierten Person: ihr Foto (oder ein Platzhalter, wenn keines
hochgeladen wurde), Anzeigename, Flagge der Staatsangehörigkeit und natürlicher Schlüssel — dieselbe
Ausweisnummer, mit der sie über Mannschaften und Wettbewerbe hinweg erkannt wird. Erreichbar über
„Profil anzeigen“ aus der erweiterten Zeile des Bildschirms zur Anmeldungsprüfung.

## Wichtige Felder

- **Foto**: wird angezeigt, wenn eines über den Bildschirm zur Anmeldungsprüfung hochgeladen wurde;
  andernfalls wird stattdessen eine Platzhalter-Silhouette angezeigt, nie ein defektes Bild.
- **Staatsangehörigkeit**: die Flagge für den erfassten ISO-3166-1-Alpha-2-Ländercode der Person,
  sofern festgelegt.
- **Natürlicher Schlüssel**: das für diese Person erfasste Ausweisdokument (z. B. eine nationale
  Ausweisnummer), sofern vorhanden.

## Was dieser Bildschirm NICHT tut

Er erlaubt keine Bearbeitung — Staatsangehörigkeit und Foto werden über die erweiterte Zeile des
Bildschirms zur Anmeldungsprüfung festgelegt, nicht hier. Es gibt keinen separaten Bildschirm „Person
bearbeiten“.
