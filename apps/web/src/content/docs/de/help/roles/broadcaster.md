---
title: Übertragung
description: Was die Rolle broadcaster tun kann, was sie erbt, und was sie nicht kann.
capabilities:
  - control-web/roles-permissions
roles:
  - broadcaster
---

## Wofür diese Rolle da ist

Eine zuweisbare Rolle in der Taxonomie der Organisation, gedacht für jemanden, der eine Übertragung
rund um ein Turnier produziert, statt es zu verwalten.

## Was sie tun kann

<!-- GENERATED:CAPABILITIES:START -->

Dieser Rolle wird heute keine Fähigkeit gewährt.

<!-- GENERATED:CAPABILITIES:END -->

Klar ausgesprochen statt stillschweigend übergangen: Keine Route lässt broadcaster heute zu etwas zu,
das die deklarierte Zuordnung benennt, also ist dies, was die Rolle im Moment tatsächlich gewährt, kein
Platzhalter, der auf Dokumentation wartet. Öffentliche Leseoberflächen — Live-Übersichten,
veröffentlichte Tabellen und Turnierbäume, TV-/Overlay-Routen, die über ein Anzeigetoken bereitgestellt
werden — benötigen keine Organisationsrolle und bleiben unabhängig davon erreichbar, ob broadcaster
zugewiesen ist.

## Was sie erbt

Nichts — keine Rolle erbt von broadcaster, und sie erbt von keiner.

## Was sie nicht kann

Alles, was eine Organisationsfähigkeit schützt: keine Verwaltung von Benutzern, Vereinen oder Turnieren,
keine Spielbedienung, keine Berichtsprüfung, kein Datenexport oder -import. Das Zuweisen von broadcaster
gewährt Mitgliedschaft in der Taxonomie der Organisation, ohne dabei irgendeine operative Befugnis
innerhalb davon zu gewähren.

## Bildschirme, die sie sieht

Jeder Bildschirm des Kontrollpanels außer „Rollen" — dieselbe Navigation, die ein Viewer sieht, da
keine der beiden Rollen `org.manage-users` besitzt, und keine ebenfalls keine andere Fähigkeit besitzt,
die heute irgendein Bildschirm voraussetzt.
