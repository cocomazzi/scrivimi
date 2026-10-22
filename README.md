# Scrivimi! — Italiano in famiglia

Applicazione gratuita per praticare l'italiano in conversazioni con la famiglia italiana.

## Funzioni
- Conversazioni per atti comunicativi, con risposte salvate nel browser
- Grammatica per livelli ERK/CEFR, espressioni e connettivi
- Quaderno italiano–olandese ed esportazione TSV
- Sessioni da 15, 20 o 30 minuti con timer e contatore parole
- Attività «Descrivi un'immagine» con fotografie da Wikimedia Commons
- Registrazione audio previa autorizzazione del microfono

## Uso
Apri `index.html` in un browser oppure visita il sito GitHub Pages una volta attivato.

## Privacy e dati
Le risposte e il quaderno sono conservati localmente nel browser (localStorage). È disponibile un account con email e password (o link email), con caricamento e salvataggio cloud automatici di risposte e quaderno. Senza connessione le modifiche restano sul dispositivo e vengono ritentate al ritorno online. Il timer resta locale. Vedi [autenticazione e configurazione Supabase](AUTHENTICATION.md). Salva periodicamente una copia dei dati. Le registrazioni audio vanno scaricate per conservarle.

## Fotografie
La pagina utilizza fotografie ospitate da Wikimedia Commons. Per attribuzioni e licenze, usa il link «Fonte e licenza» mostrato per ogni fotografia. Per un futuro funzionamento offline puoi aggiungere copie autorizzate nella cartella `images/` (nomi `01.webp`, `02.webp`, ecc.).

## Pubblicazione su GitHub Pages
In **Settings → Pages → Build and deployment**, scegli **Deploy from a branch**, branch **main**, cartella **/(root)**, poi **Save**. Il sito sarà disponibile a `https://cocomazzi.github.io/scrivimi/` quando il deployment sarà completato.

Il servizio è attualmente gratuito.
