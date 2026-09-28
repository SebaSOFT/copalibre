---
title: Vereinsportal
description: Das eigene Mitgliederverzeichnis eines Vereinsadministrators und die Einreichung eines Turnierkaders.
capabilities:
  - control-web/club-portal
roles:
  - club-admin
  - admin
---

## Für wen das gedacht ist

Das Vereinsportal ist ein Selbstbedienungsbereich für einen `club-admin` — einen Benutzer, dessen
Rolle auf einen bestimmten Verein beschränkt ist, statt auf die gesamte Organisation. Alles hier ist
auf diesen einen Verein begrenzt: ein Vereinsadministrator kann niemals die Mitglieder, Mannschaften
oder Anmeldungen eines anderen Vereins sehen oder ändern.

## Mitgliederverzeichnis

`/control/<organisation>/clubs/<verein>/portal/members` listet alle bereits mit Ihrem Verein
verbundenen Personen auf und erlaubt es, eine neue Person hinzuzufügen (Name sowie optional Alias
und Geburtsdatum) oder Name bzw. Alias eines bestehenden Mitglieds zu korrigieren. Ein hier
hinzugefügtes Mitglied gehört ab dem Moment seiner Erstellung zu Ihrem Verein — es gibt keinen
separaten Schritt „dem Verein zuweisen".

Staatsangehörigkeit, ein Foto und andere Identitätsdetails bleiben weiterhin Aufgabe eines
Organisationsadministrators, genau wie heute bei jedem Personendatensatz.

## Einen Turnierkader einreichen

`/control/<organisation>/clubs/<verein>/portal/tournaments/<turnier>/roster` führt Sie durch die
Anmeldung Ihres Vereins bei einem offenen Turnier:

1. Wählen Sie eine der bestehenden Mannschaften Ihres Vereins oder erstellen Sie eine neue.
2. Wählen Sie aus, welche Mitglieder Ihres Vereins den Kader bilden, und weisen Sie jedem eine Rolle
   zu — Spieler, Ersatzspieler, Trainer oder Betreuer.
3. Reichen Sie ein. Dadurch wird Ihre Mannschaft als **ausstehender** Teilnehmer mit diesem Kader
   angemeldet — derselbe ausstehende Status, mit dem jede Anmeldung beginnt.

Ein Turnieradministrator prüft und genehmigt die Anmeldung über den eigenen
Anmeldungsüberprüfungsbildschirm; an diesem Schritt ändert sich nichts, nur weil Sie sie selbst
eingereicht haben. Sie können jederzeit zurückkehren und eine weitere Mannschaft für ein anderes
Turnier vorbereiten — nichts hier ist eine einmalige Aktion.
