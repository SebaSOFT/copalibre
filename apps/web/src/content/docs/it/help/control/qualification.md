---
title: Qualificazione
description: Conferma chi si è qualificata per una fase generata in anticipo — anteprima, poi conferma in un solo passaggio.
capabilities:
  - tournament-engine/stage-qualification
roles:
  - admin
---

## A cosa serve questa schermata

Quando un piano di qualificazione verificato invia qualificate a una fase, il sorteggio può generare quella
fase **in anticipo**, prima che la precedente finisca. I posti del primo turno si leggono come posizioni di
qualificazione ("1° Girone A", "2° miglior seconda", "Qualificata 5") e le partite si possono già
programmare.

Questa schermata assegna quelle posizioni. Elenca ogni posizione con la partecipante che la classifica
attuale vi colloca; nulla cambia finché non confermi.

## Stati principali

- **Fase precedente in corso**: la schermata conta le partite non concluse. Concludere l’ultima non assegna
  nulla da sola.
- **Parità sulla linea di taglio**: la schermata indica le partecipanti a pari merito e la posizione
  contesa, e non offre la conferma finché non è risolta.
- **Pronta**: conferma e ogni posto riceve la sua partecipante in una volta. Gli orari assegnati restano.
- **Serve una nuova conferma**: un risultato è cambiato dopo la conferma. Conferma di nuovo finché la fase
  successiva non è iniziata.

## Cosa non puoi fare qui

Non puoi cambiare a mano chi si è qualificata: correggi il risultato di origine. Quando una partita della
fase successiva è iniziata, i suoi posti non cambiano più.
