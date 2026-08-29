---
title: Revisione iscrizioni
description: Cosa fanno accettare, rifiutare o ritirare un'iscrizione, e come importare partecipanti via CSV.
capabilities:
  - control-web/registration-review
roles:
  - admin
  - club-admin
---

## A cosa serve questa schermata

Esamina ogni partecipante o squadra iscritta prima che il torneo venga pubblicato, e decide se
ciascuno viene accettato, rifiutato o ritirato. Ogni decisione viene registrata individualmente con
lo stato precedente, lo stato risultante e chi l'ha presa.

## Campi chiave

- **Stato**: in attesa, accettato, rifiutato o ritirato. Sono consentite solo transizioni valide da
  ogni stato — la schermata non permette di applicare una decisione illegale (ad esempio, accettare
  qualcosa già rifiutato).
- **Importa da CSV**: carica un file di partecipanti; il sistema valida il contenuto e mostra
  un'anteprima riga per riga prima di confermare. Nessuna riga con errore viene importata finché il
  file non viene corretto e ritentato.
- **Iscritti che necessitano di un'abbreviazione**: un partecipante in collisione su ogni etichetta
  breve derivata automaticamente viene registrato senza averne una impostata, e altrimenti è
  invisibile — questa sezione elenca quei partecipanti e ti permette di impostarne una direttamente.
  Un valore già usato da un altro partecipante del torneo viene rifiutato sul momento, indicando il
  conflitto; un partecipante risolto scompare dall'elenco.
- **Revisione in blocco**: applica la stessa decisione a più iscrizioni contemporaneamente; ognuna
  rimane comunque registrata separatamente, non come un unico evento aggregato.

## Cosa NON fa questa schermata

Non modifica i risultati delle partite né il tabellone — riguarda esclusivamente chi partecipa,
prima che il torneo inizi.
