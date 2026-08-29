---
title: Übertragungs- und öffentliche Oberflächen
description: Anzeige-Tokens für TV-Bildschirme vor Ort und Streaming-Overlays, und was ein Zuschauer auf der öffentlichen Website sieht.
capabilities:
  - live-operations/broadcast-tv-surfaces
  - live-operations/public-live-surfaces
  - public-web/public-web-shell
roles:
  - broadcaster
  - admin
---

## Anzeige-Tokens

Eine `/tv/**`-Route — eine vollständig rotierende Anzeige oder eine einzelne fixierte Begegnung, als
normale Seite oder als transparenter `?mode=overlay` für Chroma-Key-Aufnahmen in einem Stream — wird
durch ein geräteeigenes Anzeige-Token autorisiert, nicht durch die Anmeldung einer Person. Das Token wird
vom Organisations-Dashboard ausgestellt, an eine bestimmte `/tv/**`-Route gebunden und unabhängig
widerrufbar: Das Widerrufen des Tokens eines Geräts stoppt nur dieses Gerät, während alle anderen Geräte
und alle Personensitzungen unberührt bleiben.

Ein Gerät mit einem gültigen Token benötigt niemanden vor Ort, um weiter zu funktionieren. Es übersteht
einen Stromausfall, ohne erneut Anmeldedaten einzugeben, und erholt sich still von einer
Verbindungsunterbrechung oder nicht verfügbaren Daten — eine `/tv/**`-Oberfläche zeigt nie einen Fehler,
den eine Person schließen müsste.

## Was ein Zuschauer auf der öffentlichen Website sieht

Die öffentliche Website (ohne Anmeldung) zeigt Tabellen, Turnierbaum und Spielberichte eines Turniers so,
wie sie veröffentlicht werden, unter derselben Organisation/Turnier-Adresse, die auch das
Kontrollzentrum und die `/tv/**`-Oberflächen verwenden. Eine laufende [Serie](/help/control/series)
zeigt ihren Live-Spielstand und welche Seite im öffentlichen Turnierbaum führt, genauso wie im
Kontrollzentrum, und eine noch nicht geplante Begegnung wird als solche angezeigt, nie geraten.

## Was Sie hier nicht tun können

Keine der beiden Oberflächen akzeptiert Eingaben von einem Zuschauer oder einem TV-Gerät: Beide sind
schreibgeschützte Darstellungen bereits veröffentlichter Daten. Änderungen an dem, was veröffentlicht
wird, geschehen im eigenen Kontrollzentrum der Organisation, nicht auf den öffentlichen oder
`/tv/**`-Oberflächen.
