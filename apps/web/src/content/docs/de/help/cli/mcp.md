---
title: MCP für KI
description: Wie eine KI CopaLibre über copalibre mcp betreiben kann.
---

`copalibre mcp` startet einen lokalen [Model Context Protocol](https://modelcontextprotocol.io)-
Server, ausschließlich über stdio — kein HTTP/SSE-Transport. Ein MCP-Client (zum Beispiel ein
KI-Agent) startet den Prozess und kommuniziert über seine Standard-Ein-/Ausgabe; Protokollmeldungen
(das Banner usw.) laufen über stderr, niemals vermischt mit dem Protokoll.

## Installationswerkzeuge

Immer verfügbar, ohne dass ein Token konfiguriert werden muss — sie führen genau dieselbe Logik wie
ihre entsprechenden CLI-Befehle aus, im selben Prozess:

- **`copalibre_doctor`**: validiert Konfiguration und Abhängigkeiten (wie `copalibre doctor`).
- **`copalibre_module_list`**: listet die installierten Module auf.
- **`copalibre_upgrade_check`**: prüft Modulkompatibilität und ausstehende Migrationen gegen eine
  Zielversion (`target_version`), wie `copalibre upgrade-check`.

## Werkzeuge zur Modulerstellung

Immer verfügbar, ohne Token — sie arbeiten mit dem lokalen Dateisystem und Git, niemals mit
`apps/api`:

- **`copalibre_module_scaffold`**: erzeugt ein strukturell gültiges Modulpaket, ausgehend von einem
  bereits gültigen Katalogdokument, als getaggtes lokales Git-Repository.
- **`copalibre_module_validate_local`**: validiert ein lokales Paket, ohne es zu suchen oder zu
  installieren.
- **`copalibre_module_submit`**: forkt `copalibre-modules`, veröffentlicht das Modul auf einem neuen
  Branch und öffnet einen Pull Request.

Dies ist das vollständige Szenario, das diesen Server rechtfertigt: Eine KI liest die Regeln einer
Sportart, fragt den Betreiber nach den benötigten Details, stellt das Modul lokal zusammen, validiert
es, installiert es in einer lokalen Entwicklungsinstallation, um es wirklich auszuprobieren (über
`copalibre module add --source file://...`, ohne separaten Mechanismus), und reicht es als Pull
Request ein — alles ohne das MCP-Protokoll zu verlassen.

## Turnierbetriebswerkzeuge

Nur registriert, wenn `COPALIBRE_MCP_TOKEN` und `COPALIBRE_API_URL` konfiguriert sind — ohne Token
erscheinen sie nicht einmal in der Werkzeugliste des Servers, und es wird nie ein HTTP-Aufruf
versucht. `COPALIBRE_MCP_TOKEN` ist ein bereits gültiges Bearer-Token unter demselben OIDC/JWT-
Authentifizierungsvertrag, den auch der Rest der API verwendet; dieser Befehl gibt keine Token aus
und verwaltet keine, sondern leitet sie nur weiter.

- **`copalibre_get_organization`**: liest eine Organisation anhand ihres Alias.
- **`copalibre_list_tournaments`**: listet die aktiven (nicht archivierten) Turniere einer
  Organisation auf.
- **`copalibre_get_tournament`**: liest ein Turnier anhand seines Alias innerhalb einer
  Organisation.
- **`copalibre_create_tournament`**: erstellt ein Turnier im Entwurfsstatus.
- **`copalibre_publish_tournament`**: veröffentlicht die Konfiguration eines Turniers im Entwurf.

Dies ist eine anfängliche, kuratierte Auswahl, kein erschöpfendes Abbild jedes `apps/api`-
Endpunkts — sie später zu erweitern ist erwartete Arbeit, keine feste Grenze.

## Einen MCP-Client konfigurieren

Ein typischer MCP-Client startet `copalibre mcp` als Unterprozess und übergibt die benötigten
Umgebungsvariablen (`DATABASE_URL` und optional `COPALIBRE_MCP_TOKEN`/`COPALIBRE_API_URL` für die
Turnierwerkzeuge). Siehe
[`docs/MCP.md`](https://github.com/SebaSOFT/copalibre/blob/develop/docs/MCP.md) im Repository für
ein vollständiges Konfigurationsbeispiel.

## Dokumentation für KI

Der MCP-Server kündigt seine eigenen `instructions` in der `initialize`-Antwort an — dieselbe
Zusammenfassung wie diese Seite, in der Form, die ein MCP-Client liest, bevor er ein Werkzeug
auswählt. Dieselbe Instanz veröffentlicht auch `/llms.txt` und `/llms-full.txt` an der Wurzel der
Hilfe-Website, für eine KI, die stattdessen die gerenderten Seiten durchsucht.
