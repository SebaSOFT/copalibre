---
title: Vereinsadmin
description: Was die Rolle club-admin tun kann, was sie erbt, und was sie nicht kann.
capabilities:
  - control-web/roles-permissions
roles:
  - club-admin
---

## Wofür diese Rolle da ist

Befugnis über einen Verein: den, den diese Zuweisung benennt, und nur diesen Verein. Ein Vereinsadmin
pflegt die Identität dieses Vereins — Name, Alias, Abkürzung und Emblem — ohne organisationsweiten
Administratorzugriff dafür zu benötigen.

## Was sie tun kann

<!-- GENERATED:CAPABILITIES:START -->

- `org.manage-clubs`

<!-- GENERATED:CAPABILITIES:END -->

Begrenzt, nicht organisationsweit: Ein Vereinsadmin, der auf einen Verein einwirkt, den er nicht
verwaltet, wird abgelehnt — genauso wie ein Teilnehmer abgelehnt wird, wenn er auf die Daten eines
anderen Teilnehmers einwirkt.

## Was sie erbt

Nichts — club-admin besitzt die Fähigkeiten keiner anderen Rolle. [Admin](/de/help/roles/admin/) erbt
`org.manage-clubs` von club-admin, nicht umgekehrt: Admin besitzt alles, was club-admin besitzt, ohne
Einschränkung, zusätzlich zum eigenen.

## Was sie nicht kann

Nichts außerhalb der Vereinsverwaltung. Ein Vereinsadmin kann keine Benutzer einladen oder verwalten,
keine Organisationseinstellungen ändern, keine Turniere erstellen oder verwalten, keine Anmeldungen
prüfen, und kein Spiel betreiben — jede dieser Aktionen benötigt eine Fähigkeit, die diese Rolle nicht
besitzt. Sie kann auch nicht auf einen Verein einwirken, den sie nicht verwaltet, selbst innerhalb
derselben Organisation.

## Bildschirme, die sie sieht

Jeder Bildschirm des Kontrollpanels, den die Mitglieder dieser Organisation sehen, außer „Rollen" — die
Benutzerverwaltung benötigt `org.manage-users`, eine Fähigkeit, die club-admin nie besitzt, sodass
dieser Navigationseintrag für sie nie erscheint. Das folgt aus der deklarierten Zuordnung, nicht aus
einer Ausschlussliste pro Bildschirm: Wird morgen ein neuer Benutzerverwaltungsbildschirm hinzugefügt,
schließt das club-admin automatisch aus, ohne dass hier etwas zu aktualisieren wäre.
