(() => {
  'use strict';
  const {keys, equal, decode, merge} = window.ScrivimiSync;
  const ownerKey = 'scrivimi-data-owner-v1', metaPrefix = 'scrivimi-sync-v2-';
  const root = document.createElement('div');
  root.className = 'account-widget';
  root.innerHTML = `<button id="syncToggle" type="button" aria-expanded="false" aria-controls="syncPanel">☁ Account <span id="syncBadge"></span></button>
  <section id="syncPanel" hidden aria-label="Account Scrivimi">
    <b>Scrivimi! · Account</b><p id="syncIdentity"></p><p id="syncState" role="status" aria-live="polite">Verifica accesso…</p>
    <form id="syncForm"><label for="syncEmail">Email</label><input type="email" id="syncEmail" autocomplete="email" required>
    <label for="syncPassword">Password</label><input type="password" id="syncPassword" autocomplete="current-password">
    <button id="syncLogin" type="submit">Accedi</button><button id="syncSignup" type="button">Crea account</button>
    <button id="syncMagic" type="button">Accedi con un link email</button><button id="syncReset" type="button">Password dimenticata?</button><small>Hai già un account creato con un link? Accedi con il link, poi scegli «Imposta o cambia password».</small></form>
    <form id="syncPasswordForm" hidden><label for="syncNewPassword">Nuova password (almeno 8 caratteri)</label><input type="password" id="syncNewPassword" minlength="8" required autocomplete="new-password"><label for="syncConfirmPassword">Ripeti la nuova password</label><input type="password" id="syncConfirmPassword" minlength="8" required autocomplete="new-password"><button type="submit">Imposta password</button></form>
    <div id="syncConflict" hidden><p>La stessa risposta o il quaderno sono stati modificati in due copie. Scegli quale conservare; prima salveremo una copia di sicurezza di entrambe.</p><button id="syncUseRemote" type="button">Usa la copia online</button><button id="syncUseLocal" type="button">Usa la copia di questo dispositivo</button></div>
    <p><button id="syncRetry" type="button" hidden>Sincronizza ora</button><button id="syncSetPassword" type="button" hidden>Imposta o cambia password</button><button id="syncLogout" type="button" hidden>Esci da questo dispositivo</button><button id="syncExport" type="button">Scarica copia di sicurezza</button></p>
    <small>Risposte e quaderno si salvano automaticamente online quando hai effettuato l’accesso. Senza connessione restano sul dispositivo e verranno sincronizzati al ritorno online. Scarica separatamente le registrazioni audio.</small>
  </section>`;
  document.body.append(root);
  const el = id => root.querySelector('#' + id);
  let api, user = null, epoch = 0, running = false, queued = false, timer, authBusy = false, stopping = false, blocked = false;
  let recovery = new URLSearchParams(location.hash.slice(1)).get('type') === 'recovery';
  const snapshot = () => Object.fromEntries(keys.map(k => [k, localStorage.getItem(k)]).filter(([, v]) => v !== null));
  let observed = snapshot();
  const redirectTo = () => new URL('index.html', location.href).href.split(/[?#]/)[0];
  function status(message, badge = '') { el('syncState').textContent = message; el('syncBadge').textContent = badge; }
  function openPanel() { el('syncPanel').hidden = false; el('syncToggle').setAttribute('aria-expanded', 'true'); }
  el('syncToggle').onclick = () => { el('syncPanel').hidden = !el('syncPanel').hidden; el('syncToggle').setAttribute('aria-expanded', String(!el('syncPanel').hidden)); };
  function backup(payload = snapshot(), remote) {
    if (Object.keys(payload).length || remote) localStorage.setItem('scrivimi-backup-' + Date.now() + '-' + Math.random().toString(36).slice(2), JSON.stringify({owner: user?.id || localStorage.getItem(ownerKey), payload, ...(remote ? {remote} : {})}));
  }
  const metaKey = id => metaPrefix + id;
  function metadata(id) { const raw = localStorage.getItem(metaKey(id)); return raw ? JSON.parse(raw) : {base: {}}; }
  const current = (id, ticket) => user?.id === id && epoch === ticket && localStorage.getItem(ownerKey) === id;
  function show() {
    el('syncForm').hidden = !!user;
    ['syncRetry', 'syncSetPassword', 'syncLogout'].forEach(id => { el(id).hidden = !user; });
    el('syncIdentity').textContent = user ? 'Accesso: ' + (user.email || 'studente') : '';
    el('syncPasswordForm').hidden = !user || !recovery;
  }
  function refresh() { observed = snapshot(); window.dispatchEvent(new Event('scrivimi:data-restored')); }
  function apply(payload) {
    decode(payload);
    const before = snapshot();
    try { keys.forEach(k => localStorage.setItem(k, payload[k] ?? (k === keys[0] ? '[]' : '{}'))); }
    catch (e) { keys.forEach(k => { if (Object.hasOwn(before, k)) localStorage.setItem(k, before[k]); else localStorage.removeItem(k); }); throw e; }
    refresh();
  }
  function conflict(local, remote) {
    backup(local, remote); blocked = true; el('syncConflict').hidden = false; openPanel();
    status('Ci sono due versioni da confrontare. Il salvataggio online è in pausa; il tuo lavoro resta sul dispositivo.', '⚠');
  }
  function schedule(delay = 900) {
    if (!user || stopping) return;
    if (!blocked) status('Modifiche sul dispositivo. Salvataggio online in attesa…', '…');
    clearTimeout(timer); timer = setTimeout(() => synchronize(), delay);
  }
  async function synchronize(choice) {
    clearTimeout(timer);
    if (!user || stopping || (blocked && !choice)) return false;
    if (running) { queued = true; return false; }
    running = true;
    const id = user.id, ticket = epoch;
    let success = false;
    async function work() {
      // Read and compare on every write; never blindly upsert an entire workspace.
      for (let attempt = 0; attempt < 4; attempt++) {
        const {data: identity, error: authError} = await api.auth.getUser();
        if (authError || identity.user?.id !== id || !current(id, ticket)) throw new Error('auth');
        const {data: row, error} = await api.from('student_progress').select('payload').eq('user_id', id).maybeSingle();
        if (error) throw error;
        if (!current(id, ticket)) return;
        const remote = row ? row.payload : {};
        decode(remote);
        const local = snapshot(), base = metadata(id).base;
        decode(local); decode(base);
        const result = choice ? {payload: {...remote, ...Object.fromEntries(keys.map(k => [k, choice === 'remote' ? remote[k] ?? (k === keys[0] ? '[]' : '{}') : local[k] ?? (k === keys[0] ? '[]' : '{}')]))}, conflicts: []} : merge(base, local, remote);
        if (result.conflicts.length) { conflict(local, remote); return; }
        const merged = result.payload;
        if (choice) backup(local, remote);
        if (!equal(decode(merged), decode(remote)) || !row) {
          if (!navigator.onLine) throw new Error('offline');
          let response;
          if (row) response = await api.from('student_progress').update({payload: merged}).eq('user_id', id).eq('payload', JSON.stringify(remote)).select('user_id');
          else response = await api.from('student_progress').insert({user_id: id, payload: merged}).select('user_id');
          if (!current(id, ticket)) return;
          if (response.error?.code === '23505' || (!response.error && !response.data?.length)) continue;
          if (response.error) throw response.error;
        }
        if (!current(id, ticket)) return;
        // The student may have typed while the request was in flight.
        const latest = snapshot();
        const final = merge(local, latest, merged);
        if (final.conflicts.length) { conflict(latest, merged); return; }
        if (!equal(decode(latest), decode(final.payload))) { backup(latest); apply(final.payload); }
        localStorage.setItem(metaKey(id), JSON.stringify({base: merged}));
        observed = snapshot(); blocked = false; el('syncConflict').hidden = true;
        if (!equal(decode(observed), decode(merged))) { queued = true; status('Salvataggio delle ultime modifiche…', '…'); }
        else { status('✓ Tutte le modifiche sono salvate online.', '✓'); success = true; }
        return;
      }
      throw new Error('concurrent-write');
    }
    try {
      if (navigator.locks) await navigator.locks.request('scrivimi-cloud-sync', work);
      else await work();
    } catch {
      if (current(id, ticket)) status('Salvato sul dispositivo. Sincronizzazione online non riuscita: riproveremo automaticamente. Controlla la connessione.', '⚠');
    } finally {
      running = false;
      if (queued) { queued = false; if (user && !blocked) schedule(500); }
    }
    return success;
  }
  function reconcile(next, event) {
    if (event !== 'PASSWORD_RECOVERY' && (!next || (user && user.id !== next.id))) recovery = false;
    if (event === 'PASSWORD_RECOVERY') { recovery = true; openPanel(); }
    if (user && user.id === next?.id) { user = next; show(); return; }
    epoch++; blocked = false; el('syncConflict').hidden = true;
    const previous = localStorage.getItem(ownerKey), nextId = next?.id || null;
    if (previous && previous !== nextId) {
      backup(); localStorage.removeItem(metaKey(previous)); keys.forEach(k => localStorage.removeItem(k)); localStorage.removeItem(ownerKey); refresh();
    }
    user = next;
    if (nextId) stopping = false;
    if (nextId && !previous) localStorage.removeItem(metaKey(nextId));
    if (nextId) { localStorage.setItem(ownerKey, nextId); show(); schedule(0); }
    else { show(); status('Accedi per ritrovare automaticamente risposte e quaderno su tutti i dispositivi.'); }
  }
  async function authAction(action) {
    if (authBusy) return;
    authBusy = true; root.querySelectorAll('form button').forEach(b => { b.disabled = true; });
    try { await action(); }
    catch { status('Operazione non riuscita. Verifica email, password e connessione. Se necessario usa il link email o recupera la password.', '⚠'); }
    finally { authBusy = false; root.querySelectorAll('form button').forEach(b => { b.disabled = false; }); }
  }
  function credentials(needsPassword = false) {
    if (!el('syncEmail').reportValidity()) return null;
    const password = el('syncPassword').value;
    if (needsPassword && !password) { el('syncPassword').focus(); status('Inserisci la password oppure scegli il link email.'); return null; }
    return {email: el('syncEmail').value.trim(), password};
  }
  el('syncForm').onsubmit = event => {
    event.preventDefault(); authAction(async () => {
      const input = credentials(true); if (!input) return;
      const {data, error} = await api.auth.signInWithPassword(input);
      if (error) throw error;
      el('syncPassword').value = ''; reconcile(data.user, 'SIGNED_IN');
    });
  };
  el('syncSignup').onclick = () => authAction(async () => {
    const input = credentials(true); if (!input) return;
    if (input.password.length < 8) return status('Scegli una password di almeno 8 caratteri.');
    const {data, error} = await api.auth.signUp({...input, options: {emailRedirectTo: redirectTo()}});
    if (error) throw error;
    el('syncPassword').value = '';
    if (data.session) reconcile(data.user, 'SIGNED_IN');
    else status('Controlla la posta per confermare l’account. Se l’account esiste già, accedi o recupera la password.');
  });
  el('syncMagic').onclick = () => authAction(async () => {
    const input = credentials(); if (!input) return;
    const {error} = await api.auth.signInWithOtp({email: input.email, options: {emailRedirectTo: redirectTo()}});
    if (error) throw error; el('syncPassword').value = ''; status('Controlla posta e spam. Apri il link sul dispositivo su cui vuoi accedere.');
  });
  el('syncReset').onclick = () => authAction(async () => {
    const input = credentials(); if (!input) return;
    const {error} = await api.auth.resetPasswordForEmail(input.email, {redirectTo: redirectTo()});
    if (error) throw error; el('syncPassword').value = ''; status('Se l’indirizzo è associato a un account, riceverai un link per impostare una nuova password.');
  });
  el('syncSetPassword').onclick = () => { recovery = true; show(); el('syncNewPassword').focus(); };
  el('syncPasswordForm').onsubmit = event => {
    event.preventDefault(); authAction(async () => {
      if (!user || !el('syncPasswordForm').reportValidity()) return;
      const password = el('syncNewPassword').value;
      if (password !== el('syncConfirmPassword').value) return status('Le due password non coincidono.');
      const {error} = await api.auth.updateUser({password});
      if (error) throw error;
      el('syncNewPassword').value = ''; el('syncConfirmPassword').value = ''; recovery = false; show(); status('Password impostata. Puoi accedere con email e password anche dagli altri dispositivi.');
    });
  };
  el('syncRetry').onclick = () => synchronize();
  el('syncUseRemote').onclick = () => { if (confirm('Usare la copia online? Una copia di sicurezza di entrambe le versioni verrà conservata.')) synchronize('remote'); };
  el('syncUseLocal').onclick = () => { if (confirm('Sostituire la copia online con quella di questo dispositivo? Una copia di sicurezza di entrambe le versioni verrà conservata.')) synchronize('local'); };
  el('syncExport').onclick = () => {
    const backups = Object.fromEntries(Object.keys(localStorage).filter(k => k.startsWith('scrivimi-backup-')).map(k => [k, localStorage.getItem(k)]));
    const url = URL.createObjectURL(new Blob([JSON.stringify({payload: snapshot(), backups}, null, 2)], {type: 'application/json'}));
    const a = document.createElement('a'); a.href = url; a.download = 'scrivimi-backup.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  el('syncLogout').onclick = () => authAction(async () => {
    if (running) return status('Sincronizzazione in corso. Attendi qualche istante prima di uscire.', '…');
    const saved = await synchronize();
    if (!saved && !confirm('Alcuni dati non sono ancora online. Uscire comunque? Una copia locale resterà nella copia di sicurezza scaricabile.')) return;
    backup(); stopping = true; clearTimeout(timer);
    const {error} = await api.auth.signOut({scope: 'local'});
    if (error) { stopping = false; throw error; }
    reconcile(null, 'SIGNED_OUT');
  });
  function changed() {
    const latest = snapshot();
    if (!equal(latest, observed)) { observed = latest; schedule(); }
  }
  document.addEventListener('input', changed);
  document.addEventListener('click', () => setTimeout(changed, 0));
  // Also catch programmatic writes and storage events from other tabs.
  setInterval(changed, 1000);
  setInterval(() => { if (user && !blocked && !stopping) synchronize(); }, 15000);
  window.addEventListener('storage', event => {
    if (event.key === ownerKey && localStorage.getItem(ownerKey) !== user?.id) {
      epoch++; user = null; show(); status('Account cambiato in un’altra scheda. Ricarica la pagina per continuare.', '⚠');
    }
    if (keys.includes(event.key) || event.key === null) { refresh(); schedule(); }
  });
  window.addEventListener('online', () => schedule(0));
  window.addEventListener('focus', () => { if (user) schedule(0); });
  document.addEventListener('visibilitychange', () => { if (user) synchronize(); });
  window.addEventListener('beforeunload', event => {
    if (user && (!equal(decode(snapshot()), decode(metadata(user.id).base)) || running)) { event.preventDefault(); event.returnValue = ''; }
  });
  try {
    const key = window.PARLIAMO_SUPABASE_ANON_KEY || '';
    if (key.startsWith('sb_secret_')) throw new Error('Invalid browser key');
    if (key.split('.').length === 3 && JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role !== 'anon') throw new Error('Invalid browser key');
    api = window.supabase.createClient(window.PARLIAMO_SUPABASE_URL, key, {auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: true}});
    let authEvents = 0;
    api.auth.onAuthStateChange((event, session) => {
      authEvents++;
      setTimeout(() => { try { reconcile(session?.user || null, event); } catch { epoch++; user = null; show(); status('Spazio locale insufficiente o dati non validi. Scarica una copia di sicurezza.', '⚠'); } }, 0);
    });
    const initialEvents = authEvents;
    api.auth.getSession().then(({data, error}) => { if (error) throw error; if (authEvents === initialEvents) reconcile(data.session?.user || null, 'INITIAL_SESSION'); }).catch(() => status('Impossibile verificare l’accesso. Riprova quando sei online.', '⚠'));
  } catch {
    status('Account non disponibile. Puoi continuare a lavorare sul dispositivo.', '⚠');
    root.querySelectorAll('form button').forEach(b => { b.disabled = true; });
  }
})();
