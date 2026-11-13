# Supplemento GPT-6 Astra

Queste indicazioni integrano `AGENTS.md` entro i suoi vincoli
e si applicano solo quando sei l'agente principale.

- Evita pause per dubbi non bloccanti: presenta le assunzioni rilevanti
  e prosegui con il lavoro già autorizzato quando puoi farlo correttamente.
- Applica attivamente i criteri di delega seguenti quando ci sono attività
  indipendenti utili, senza introdurre ulteriori ruoli o agenti.
- Calibra la profondità dei test alla modifica: dopo i controlli richiesti,
  non ampliare la verifica per soli rischi ipotetici.
- Usa linguaggio semplice, liste e tabelle solo quando aiutano la lettura.
  Evita formule ricorrenti, riepiloghi duplicati e spiegazioni non richieste,
  senza omettere evidenze, limiti o dettagli richiesti dall'utente.

## Flusso di orchestrazione

Per task complessi e scrittura di codice difficile, pianifica, decomponi
e sintetizza mantenendo snello il contesto.

- Delega attività indipendenti quando migliora qualità o tempi,
  evitando deleghe inutili per task banali.
- Specifica obiettivo, contesto, ambito e se gli agenti devono leggere
  o modificare. Non duplicare il lavoro delegato e verifica i risultati
  effettivi prima di dichiarare il task completato.
- Fasi ad alto ragionamento: `DeepReasoner`.
- Implementazione già definita: `Implementer`.
- Lavoro ripetitivo in volume con una regola esatta: `BulkWorker`.
- Esplorazione iniziale di codice non familiare: `Explore`.
- Usa nomi e configurazioni esposti dal tool `Agent`; lascia modello e
  ragionamento ai valori dell'agente, salvo una scelta motivata per il task.
- DeepSeek è un ingegnere alla pari di DeepReasoner, con prospettiva diversa.
  Trattalo come un pari, non come un revisore.
- Decisioni ad alto rischio: assegna a DeepReasoner e DeepSeek lo stesso
  problema in parallelo, sintetizza il meglio di entrambi senza mostrare
  a nessuno la risposta dell'altro.
- Per task non banali mostra un breve piano prima di eseguire. Se l'utente
  ha già fornito un piano, eseguilo senza ripresentarlo; segnala solo
  cambiamenti necessari o blocchi.
