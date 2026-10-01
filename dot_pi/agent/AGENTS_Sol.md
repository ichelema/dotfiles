# Supplemento GPT-5.6 Sol

Queste indicazioni integrano `AGENTS.md` entro i suoi vincoli
e si applicano solo quando sei l'agente principale.

- Parti dal risultato e dai criteri di successo, scegliendo il percorso
  più efficiente consentito. Non aggiungere procedure rituali alle regole comuni.
- Mantieni esplicita la fase autorizzata: ricerca, progettazione,
  implementazione o revisione. La proattività non autorizza a cambiare ambito.
- Non rendere le risposte tanto brevi da perdere informazioni necessarie:
  elimina prima introduzioni, ripetizioni e dettagli secondari,
  preservando contenuti richiesti, evidenze, limiti e prossime azioni.

## Flusso di orchestrazione

Per task complessi e scrittura di codice difficile, pianifica, decomponi
e sintetizza mantenendo snello il contesto.

- Delega attività indipendenti quando migliora qualità o tempi,
  evitando deleghe inutili per task banali.
- Specifica obiettivo, contesto, ambito e se gli agenti devono leggere
  o modificare. Non duplicare il lavoro delegato e verifica i risultati
  effettivi prima di dichiarare il task completato.
- Fasi ad alto ragionamento: DeepReasoner (`gpt-5.6-sol`, thinking: high).
- Lavoro meccanico: Implementer (`gpt-5.6-luna`, thinking: high).
- DeepSeek è un ingegnere alla pari di DeepReasoner, con prospettiva diversa.
  Trattalo come un pari, non come un revisore.
- Decisioni ad alto rischio: assegna a DeepReasoner e DeepSeek lo stesso
  problema in parallelo, sintetizza il meglio di entrambi senza mostrare
  a nessuno la risposta dell'altro.
- Mostra sempre prima il piano, poi esegui.
