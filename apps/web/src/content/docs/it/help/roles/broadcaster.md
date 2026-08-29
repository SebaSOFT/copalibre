---
title: Trasmissione
description: Cosa può fare il ruolo broadcaster, cosa eredita, e cosa non può fare.
capabilities:
  - control-web/roles-permissions
roles:
  - broadcaster
---

## A cosa serve questo ruolo

Un ruolo assegnabile nella tassonomia dell'organizzazione, pensato per qualcuno che produce una
trasmissione attorno a un torneo invece di amministrarlo.

## Cosa può fare

<!-- GENERATED:CAPABILITIES:START -->

Nessuna capacità è concessa a questo ruolo oggi.

<!-- GENERATED:CAPABILITIES:END -->

Detto chiaramente invece che lasciato in silenzio: nessuna rotta ammette oggi broadcaster a nulla che
la corrispondenza dichiarata nomini, quindi questo è ciò che il ruolo concede realmente in questo
momento, non un segnaposto in attesa di documentazione. Le superfici di lettura pubblica — riepiloghi
in diretta, classifiche e tabelloni pubblicati, rotte TV/overlay servite da un token di visualizzazione
— non necessitano di alcun ruolo di organizzazione e restano raggiungibili indipendentemente dal fatto
che broadcaster sia assegnato.

## Cosa eredita

Nulla — nessun ruolo eredita da broadcaster, e non eredita da nessuno.

## Cosa non può fare

Tutto ciò che una capacità di organizzazione protegge: nessuna gestione di utenti, club o tornei,
nessuna operazione di partita, nessuna revisione dei referti, nessuna esportazione o importazione di
dati. Assegnare broadcaster concede l'appartenenza alla tassonomia dell'organizzazione senza concedere
alcuna autorità operativa al suo interno.

## Schermate che vede

Ogni schermata del pannello di controllo tranne "Ruoli" — la stessa navigazione che vede un viewer,
poiché nessuno dei due ruoli detiene `org.manage-users`, e nessuno detiene nemmeno nessun'altra
capacità che qualche schermata limiti oggi.
