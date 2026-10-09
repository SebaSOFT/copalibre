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

## Broadcaster-Studio

`/control/<organization>/tournaments/<tournament>/broadcaster` ist eine
Selbstbedienungskonsole für einen Streamer oder Medienbetreiber: Sie stellt automatisch ein
eigenes geräte-gebundenes Anzeige-Token aus, lässt Sie den Overlay-Modus wählen (ein unterer
Balken über Ihrer Kamera oder eine Vollbildszene ohne Kamera) sowie einen Vorschauhintergrund
(transparent, Grünbildschirm, Magentabildschirm oder ein dunkler Stadionhintergrund), und liefert
Ihnen eine einsatzbereite OBS-Browser-Source-URL mit Live-Vorschau — kein Administrator muss
Ihnen ein Token geben oder die eigene Sitzung teilen. Während dieses Overlay geöffnet ist, zeigt
ein live erfasstes Tor, ein Punkt oder eine Karte einen animierten Hinweis mit Mannschaft und
Spieler an und blendet sich danach automatisch aus — niemand vor Ort muss ihn auslösen oder
schließen.

## Was die Anzeige in der Halle zeigt

Die Anzeige mit vollständiger Rotation zeigt nacheinander die Tabelle, die besten Spielenden, die Turnierstatistik und – wenn die hervorgehobene Phase ihn hat – den Turnierbaum, danach die Spielliste. Eine Adresse mit `?view=standings` oder `?view=matches` hält diesen einen Bereich im Vollbild fest, statt zu rotieren (`?view=fixtures` funktioniert weiter als alter Name von `matches`). Die Meister-Zusammenfassung eines beendeten Turniers gehört allein zur rotierenden Anzeige. Die Kopfzeile nennt den Turnierstatus: Ein laufendes Turnier zeigt eine beschriftete Uhr auf die Minute in der Zeitzone der Organisation, ein beendetes den Tag seines letzten Spiels, ohne laufende Uhr.

Ein angeheftetes Spiel – `/tv/<Organisation>/tournaments/<Turnier>/stages/<Phase>/matches/<Nummer>` – wird wie auf der öffentlichen Spielseite über seine Nummer innerhalb der Phase angesprochen und zeigt immer Ergebnis, Seiten und erfasste Ereignisse, beendet oder nicht. Eine Nummer, die die Phase nicht hat, wird als nicht existierendes Spiel gemeldet.

Eine Phase kann Formate mischen, daher stellt die Anzeige jede Zone nach dem Format dar, das sie spielt:

- **Tabelle**: Jede Zone, die Teilnehmende in einer Tabelle rangiert, erhält eine eigene Tabelle mit dem Zonennamen als Überschrift. Zeilen verschiedener Zonen werden nie in einer Rangliste vermischt, und jede Tabelle zeigt bis zu acht Zeilen. Eine Phase, deren Zonen alle das Format der Phase spielen, behält eine einzelne Tabelle ohne Überschrift.
- **Turnierbaum**: Zonen mit einem K.-o.-Format werden als Turnierbaum gezeichnet.
- **Spiele**: Listet alle Spiele des Turniers in einer kompakten Tabelle, zwei pro Zeile mit Kürzeln und Ergebnis, Seite für Seite; die Seiten wechseln mit der Rotation, eine feste `matches`-Ansicht blättert weiter.

Die Bauchbinde bleibt unverändert: Sie nennt ein Spiel, keine Phase.

### Der Anzeige-Starter

`/tv` ist ein Starter, der die Adresse einer Hallenanzeige oder eines Overlays zusammenstellt: Organisation, Turnier und Ansicht (rotierende Anzeige, Tabelle, Spielliste, ein angeheftetes Spiel oder das Übertragungs-Overlay), Hintergrund und Sprache wählen. Die Sprache ändert die Beschriftungen des Starters sofort, ohne Neuladen. Phasen erscheinen mit Nummer und Name, Spiele nach Zone und Gruppe gruppiert mit Runde, beiden Teilnehmenden und ihrer Nummer (`#34`). Die Ansichten für ein angeheftetes Spiel und das Overlay fragen nach einem Spiel, und der Startlink trägt es, sodass mehrere Overlays je ein eigenes Spiel zeigen können; ein Overlay mit der automatischen Auswahl zeigt das Live-Spiel des Platzes.

## Was ein Zuschauer auf der öffentlichen Website sieht

Die öffentliche Website (ohne Anmeldung) zeigt Tabellen, Turnierbaum und Spielberichte eines Turniers so,
wie sie veröffentlicht werden, unter derselben Organisation/Turnier-Adresse, die auch das
Kontrollzentrum und die `/tv/**`-Oberflächen verwenden. Eine laufende [Serie](/help/control/series)
zeigt ihren Live-Spielstand und welche Seite im öffentlichen Turnierbaum führt, genauso wie im
Kontrollzentrum, und eine noch nicht geplante Begegnung wird als solche angezeigt, nie geraten.

Auf dem TV-Bildschirm listet die Zusammenfassung eines beendeten Turniers, das zonenweise entschieden wurde, den Sieger oder die gemeinsamen Sieger jeder Zone der letzten Phase unter dem Namen der Zone auf, dieselben Sieger wie die öffentliche Übersicht. Ein Turnier mit einem einzigen Sieger behält die Einzelsieger-Darstellung, und der Tabellenführer einer früheren Phase wird nie als Sieger gezeigt.

## Was Sie hier nicht tun können

Keine der beiden Oberflächen akzeptiert Eingaben von einem Zuschauer oder einem TV-Gerät: Beide sind
schreibgeschützte Darstellungen bereits veröffentlichter Daten. Änderungen an dem, was veröffentlicht
wird, geschehen im eigenen Kontrollzentrum der Organisation, nicht auf den öffentlichen oder
`/tv/**`-Oberflächen.
