---
title: MCP per l'IA
description: Come un'IA può gestire CopaLibre tramite copalibre mcp.
capabilities: []
roles:
  - super-admin
  - admin
---

`copalibre mcp` avvia un server locale [Model Context Protocol](https://modelcontextprotocol.io),
solo su stdio — nessun trasporto HTTP/SSE. Un client MCP (ad esempio, un agente IA) avvia il
processo e comunica tramite il suo standard input/output; i messaggi di log (il banner, ecc.)
passano per stderr, mai mescolati con il protocollo.

## Strumenti di installazione

Sempre disponibili, senza bisogno di configurare alcun token — eseguono esattamente la stessa logica
dei loro comandi CLI equivalenti, nello stesso processo:

- **`copalibre_doctor`**: valida configurazione e dipendenze (come `copalibre doctor`).
- **`copalibre_module_list`**: elenca i moduli installati.
- **`copalibre_upgrade_check`**: verifica la compatibilità dei moduli e le migrazioni in sospeso
  contro una versione target (`target_version`), come `copalibre upgrade-check`.

## Strumenti di creazione moduli

Sempre disponibili, senza token — operano sul filesystem locale e Git, mai su `apps/api`:

- **`copalibre_module_scaffold`**: genera un pacchetto modulo strutturalmente valido, inizializzato
  da un documento del catalogo già valido, come un repository Git locale etichettato.
- **`copalibre_module_validate_local`**: valida un pacchetto locale senza cercarlo né installarlo.
- **`copalibre_module_submit`**: esegue il fork di `copalibre-modules`, pubblica il modulo su un
  nuovo branch, e apre una pull request.

Questo è lo scenario completo che giustifica questo server: un'IA legge le regole di uno sport,
chiede all'operatore i dettagli necessari, assembla il modulo localmente, lo valida, lo installa in
un'installazione di sviluppo locale per provarlo davvero (tramite `copalibre module add --source
file://...`, senza meccanismo separato) e lo invia come pull request — tutto senza uscire dal
protocollo MCP.

## Strumenti di gestione tornei

Registrati solo quando `COPALIBRE_MCP_TOKEN` e `COPALIBRE_API_URL` sono configurati — senza token,
non compaiono nemmeno nell'elenco degli strumenti del server, e non viene mai tentata alcuna
chiamata HTTP. `COPALIBRE_MCP_TOKEN` è un token bearer già valido secondo lo stesso contratto di
autenticazione OIDC/JWT usato dal resto dell'API; questo comando non emette né gestisce token, li
inoltra soltanto.

- **`copalibre_get_organization`**: legge un'organizzazione tramite il suo alias.
- **`copalibre_list_tournaments`**: elenca i tornei attivi (non archiviati) di un'organizzazione.
- **`copalibre_get_tournament`**: legge un torneo tramite il suo alias all'interno di
  un'organizzazione.
- **`copalibre_create_tournament`**: crea un torneo in stato bozza.
- **`copalibre_publish_tournament`**: pubblica la configurazione di un torneo in bozza.

Questo è un insieme iniziale e curato, non uno specchio esaustivo di ogni endpoint di `apps/api` —
ampliarlo in seguito è lavoro previsto, non un limite fisso.

## Configurare un client MCP

Un client MCP tipico avvia `copalibre mcp` come sottoprocesso, passando le variabili d'ambiente
necessarie (`DATABASE_URL`, e opzionalmente `COPALIBRE_MCP_TOKEN`/`COPALIBRE_API_URL` per gli
strumenti torneo). Vedi
[`docs/MCP.md`](https://github.com/SebaSOFT/copalibre/blob/develop/docs/MCP.md) nel repository per
un esempio completo di configurazione.

## Documentazione per l'IA

Il server MCP annuncia le proprie `instructions` nella risposta di `initialize` — lo stesso
riassunto di questa pagina, nella forma che un client MCP legge prima di scegliere uno strumento.
Questa stessa istanza pubblica anche `/llms.txt` e `/llms-full.txt` alla radice del sito di guida,
per un'IA che invece percorre le pagine renderizzate.
