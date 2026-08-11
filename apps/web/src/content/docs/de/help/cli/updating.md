---
title: Aktualisierung
description: Der nicht destruktive Weg zur Aktualisierung des CopaLibre-Frameworks und seiner installierten Module.
---

## Das Framework aktualisieren

Empfohlene, nicht destruktive Reihenfolge:

1. **Sichern Sie**, bevor Sie irgendetwas anfassen: `./copalibre backup --file backups/pre-upgrade.dump`.
2. **Aktualisieren** Sie den Checkout oder die Image-Referenz auf die neue Version (starten Sie die
   Dienste noch nicht neu).
3. **Prüfen Sie die Kompatibilität** mit der neuen Version, ohne etwas neu zu starten:
   ```bash
   ./copalibre upgrade-check --target-version <neue-version>
   ```
   Meldet, ob ein installiertes Modul mit dieser Version nicht mehr kompatibel wäre (dieselbe
   Prüfung, die `module verify` gegen die laufende Version verwendet, aber gegen die Zielversion),
   und listet ausstehende Datenbankmigrationen — ohne eine davon anzuwenden. Endet mit einem Exit-
   Code ungleich null, wenn ein Modul inkompatibel würde; beheben Sie dies, bevor Sie fortfahren.
4. **Starten Sie neu** mit der neuen Version (`./copalibre start` oder `docker compose up --detach
--wait`). Ausstehende Migrationen werden automatisch und der Reihe nach angewendet, bevor eine
   Prozessrolle beginnt, Datenverkehr zu bedienen — kein separater manueller Schritt.

## Module aktualisieren

Jede installierte Disziplin oder jedes Turnierprofil ist ein Modul, das unabhängig vom Framework
versioniert wird.

```bash
./copalibre module list --outdated
```

Listet nur die installierten Module auf, die eine neuere veröffentlichte Version als die
installierte haben.

```bash
./copalibre module add <alias>@<bereich>
```

Installiert eine bestimmte Version oder einen Bereich (zum Beispiel `@^2.0.0`) eines bereits
installierten Moduls — die Neuinstallation mit einer anderen Version ist die Art, ein Modul zu
aktualisieren. Ein bereits gestartetes Turnier referenziert weiterhin die Version, mit der es
erstellt wurde; die Aktualisierung eines Moduls ändert niemals rückwirkend ein laufendes Turnier.

Siehe die [Befehlsreferenz](/help/cli/commands/) für die restlichen Optionen von `module`.
