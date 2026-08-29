---
title: Anmeldungsprüfung
description: Was das Akzeptieren, Ablehnen oder Zurückziehen einer Anmeldung bewirkt, und wie man Teilnehmer per CSV importiert.
capabilities:
  - control-web/registration-review
roles:
  - admin
  - club-admin
---

## Wofür dieser Bildschirm ist

Prüft jeden angemeldeten Teilnehmer oder jedes Team, bevor das Turnier veröffentlicht wird, und
entscheidet, ob er/es akzeptiert, abgelehnt oder zurückgezogen wird. Jede Entscheidung wird
einzeln protokolliert, mit vorherigem Zustand, resultierendem Zustand und wer sie getroffen hat.

## Wichtige Felder

- **Status**: ausstehend, akzeptiert, abgelehnt oder zurückgezogen. Von jedem Status aus sind nur
  gültige Übergänge erlaubt — der Bildschirm lässt keine unzulässige Entscheidung zu (zum Beispiel
  etwas bereits Abgelehntes zu akzeptieren).
- **CSV-Import**: laden Sie eine Teilnehmerdatei hoch; das System validiert den Inhalt und zeigt vor
  der Bestätigung eine zeilenweise Vorschau. Keine fehlerhafte Zeile wird importiert, bis die Datei
  korrigiert und erneut versucht wird.
- **Teilnehmer, die eine Abkürzung benötigen**: ein Teilnehmer, der bei jedem automatisch abgeleiteten
  Kurzlabel kollidiert, wird ohne gesetztes Label registriert und ist sonst unsichtbar — dieser
  Abschnitt listet diese Teilnehmer auf und lässt Sie eine direkt festlegen. Ein bereits von einem
  anderen Teilnehmer des Turniers verwendeter Wert wird direkt abgelehnt, unter Nennung des Konflikts;
  ein gelöster Teilnehmer verschwindet aus der Liste.
- **Massenprüfung**: wendet dieselbe Entscheidung auf mehrere Anmeldungen gleichzeitig an; jede wird
  weiterhin einzeln protokolliert, nicht als ein einziges aggregiertes Ereignis.

## Was dieser Bildschirm NICHT tut

Er ändert weder Spielergebnisse noch den Spielplan — es geht ausschließlich darum, wer teilnimmt,
bevor das Turnier beginnt.
