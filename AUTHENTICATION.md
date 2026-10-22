# Account e sincronizzazione Scrivimi! — 22 ottobre 2026

## Comportamento attuale

Accesso con email e password, creazione account, link email alternativo e recupero password. Gli account creati in precedenza con un link conservano lo stesso identificativo e tutti i dati: accedere con il link, aprire Account → Imposta o cambia password, confermare la nuova password. Da quel momento usare la stessa email e password su qualsiasi dispositivo. La password non viene scritta in localStorage né nel repository.

Dopo l'accesso risposte alle conversazioni, descrizioni delle immagini e quaderno si caricano e si salvano automaticamente. Le modifiche vengono accodate dopo circa 900 ms; nuovi tentativi avvengono al ritorno online, al ritorno sulla pagina e ogni 15 secondi mentre l'account è connesso. Il pulsante Account mostra ✓ quando la sincronizzazione è completata e ⚠ se occorre attenzione. Non chiudere la pagina prima di ✓ per avere certezza che le ultime modifiche siano online. Se la pagina viene chiusa offline, le modifiche locali e la base di confronto restano per il successivo accesso.

Il timer resta locale: una sessione in corso su un dispositivo non deve partire su un altro. Eventuali vecchi dati del timer presenti nel payload cloud vengono preservati ma non applicati. Audio, preferenze di navigazione e lingua della guida non vengono sincronizzati. Scaricare le registrazioni audio separatamente.

## Conservazione dei dati e conflitti

Si mantiene public.student_progress e il formato payload già esistente. Non sono richieste nuove colonne, migrazioni, funzioni SQL o cancellazioni dei dati.

Prima di ogni salvataggio viene letta la copia cloud. Confrontando copia locale, copia cloud e ultima base comune, l'app unisce modifiche a risposte diverse (anche a domande diverse della stessa conversazione). Per il quaderno, modifiche concorrenti diverse richiedono una scelta: non si ricreano parole eliminate in silenzio.

La scrittura aggiorna la riga solo se il payload del database coincide ancora con quello appena letto: update con filtri su user_id e sull'intero payload JSONB. Se la riga è cambiata nel frattempo, nessuna riga viene aggiornata e il confronto viene ripetuto. Se la riga non esiste, insert: una collisione sul vincolo UNIQUE viene riletta. Non si usa più un upsert cieco. Le chiavi payload sconosciute vengono conservate.

Se la stessa risposta è stata modificata in entrambe le copie, la sincronizzazione si ferma e presenta due scelte: copia online o copia del dispositivo. Entrambe vengono archiviate localmente prima della scelta. La scelta sostituisce l'intera area di lavoro sincronizzata con la versione indicata; non è un editor che combina manualmente le due frasi. Le modifiche durante una richiesta vengono conservate e rimesse in coda, oppure presentate come conflitto se necessario.

Su un nuovo dispositivo vuoto prevale automaticamente la copia cloud. Il lavoro ospite esistente viene confrontato con il cloud: parti compatibili sono unite, parti in conflitto richiedono una scelta. Nessun import distruttivo automatico del lavoro ospite.

Uscita: si tenta prima la sincronizzazione, quindi si archivia una copia locale e si svuota l'area visibile; le sessioni sugli altri dispositivi restano attive. In caso di errore si chiede se uscire comunque. Al cambio account vengono azzerati anche gli oggetti in memoria della piattaforma, senza interrompere le registrazioni con un ricaricamento della pagina. Ogni account ha la propria base di confronto; al nuovo accesso dopo un'uscita si ricaricano i dati senza interpretare l'area svuotata come una cancellazione da inviare al cloud.

I backup sono in localStorage con prefisso scrivimi-backup-. Account → Scarica copia di sicurezza esporta dati e backup senza includere token o password. Per recupero assistito, esportare prima una copia, individuare il backup tramite owner e timestamp nel nome e ripristinare soltanto le chiavi payload dell'account corretto. Su computer condivisi usare un profilo browser personale: il logout non elimina i backup locali. Se lo spazio locale è esaurito, il ripristino/cambio account viene interrotto prima di eliminare il lavoro senza backup.

## Configurazione Supabase Dashboard

Le impostazioni effettive, le policy RLS e il recapito email in produzione non sono accessibili da questo checkout. L'utente ha confermato il funzionamento del link email e del salvataggio cloud su un account di prova. Prima della pubblicazione controllare:

1. **Authentication → Sign In / Providers → Email**: provider attivo. Il provider Email supporta anche password; non serve un provider separato. Consentire nuove iscrizioni se si vuole abilitare Crea account. Conservare la conferma email per i nuovi account. Gli account esistenti via link possono impostare la propria password dall'app.
2. **Authentication → URL Configuration**: Site URL = URL effettivo del sito. Se si usa ancora GitHub Pages: `https://cocomazzi.github.io/scrivimi/`. Aggiungere l'esatto `https://cocomazzi.github.io/scrivimi/index.html` tra Redirect URLs, più gli equivalenti di eventuali domini diversi e localhost usati. Accesso conferma e recupero password ritornano a index.html. Servire via HTTPS o localhost, non file://.
3. **Authentication → Email Templates**: template Confirm signup, Magic Link e Reset Password devono includere il collegamento di conferma generato da Supabase, normalmente `{{ .ConfirmationURL }}`. Il flusso di recupero deve arrivare all'app con l'evento PASSWORD_RECOVERY. Non usare un template di solo codice OTP senza il link.
4. **Authentication → Email / SMTP, Rate Limits e Password Security**: verificare recapito agli indirizzi degli studenti, mittente e limiti. UI richiede almeno 8 caratteri per nuove password; se la policy Dashboard è più forte, rispettarla anche nel collaudo. Se si attiva una protezione CAPTCHA, aggiungere anche la relativa UI e il token prima di pubblicare: il flusso attuale non include CAPTCHA.
5. **Database → Tables → public.student_progress**: `user_id uuid` con primary key o UNIQUE, `payload jsonb NOT NULL`. L'uguaglianza JSONB è necessaria per il confronto atomico. Eventuali altre colonne NOT NULL devono avere default compatibili. Non modificare né ricreare una tabella esistente senza esaminarla.
6. **Database → Policies**: RLS attiva; authenticated può SELECT, INSERT, UPDATE esclusivamente dove auth.uid() = user_id. UPDATE deve avere sia USING sia WITH CHECK e richiede anche SELECT. Controllare tutte le policy preesistenti: le policy permissive si combinano con OR. Nessuna policy deve consentire letture/scritture anonime o di altri account. Non serve DELETE.
7. **Settings → API Keys**: supabase-config.js deve contenere soltanto URL e chiave publishable/anon del medesimo progetto. Non inserire mai secret o service_role nel browser. Il nome PARLIAMO_SUPABASE_ANON_KEY è mantenuto per compatibilità; la chiave attuale è publishable.

Query di sola lettura nel SQL Editor, senza contenuti degli studenti:

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns where table_schema='public' and table_name='student_progress';
select relrowsecurity from pg_class where oid=to_regclass('public.student_progress');
select policyname, roles, cmd, qual, with_check from pg_policies
where schemaname='public' and tablename='student_progress';
select constraint_name, constraint_type from information_schema.table_constraints
where table_schema='public' and table_name='student_progress';
```

Schema di riferimento **solo se la tabella non esiste**; non eseguirlo su una tabella già popolata:

```sql
create table public.student_progress (
  user_id uuid primary key references auth.users(id),
  payload jsonb not null default '{}'::jsonb
);
alter table public.student_progress enable row level security;
grant select, insert, update on public.student_progress to authenticated;
create policy "student reads own progress" on public.student_progress
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "student inserts own progress" on public.student_progress
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "student updates own progress" on public.student_progress
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
```

## Verifica

Test senza collegamento a Supabase reale:

- `node sync-core.test.cjs`: regole di fusione, cancellazioni, primo accesso, conflitti, compatibilità e validazione.
- `node auth.test.cjs`: browser Edge e Supabase simulato, pagine vere dell'app, due dispositivi, salvataggio e caricamento automatici, risposta in memoria dopo ripristino, errori/retry, conflitto tra lettura e aggiornamento, password, uscita/nuovo accesso, cambio account e disposizione mobile. Richiede Playwright (`PLAYWRIGHT_MODULE` può indicare il percorso del modulo).

Dopo la pubblicazione, usare esclusivamente account di prova per verificare: account esistente via link → imposta password → accesso con password da B → ritrova le risposte senza Carica; modifica A → ✓ → ritorna su B → ritrova l'aggiornamento; offline → modifica → online → ✓; modifica simultanea della stessa risposta → scelta esplicita; uscita/nuovo accesso; password dimenticata → email → nuova password → accesso. Testare anche una nuova registrazione e conferma email.

Verificare direttamente l'API con token di prova: un account B non deve leggere né aggiornare user_id di A e anon non deve accedere. Il filtro frontend non sostituisce RLS. I test simulati non confermano le policy del progetto reale. Le richieste API in produzione e i dati degli studenti non vengono usati dai test.

Fonti ufficiali:
- https://supabase.com/docs/reference/javascript/auth-signinwithpassword
- https://supabase.com/docs/reference/javascript/auth-signup
- https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail
- https://supabase.com/docs/reference/javascript/auth-updateuser
- https://supabase.com/docs/guides/auth/redirect-urls
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/reference/javascript/update
