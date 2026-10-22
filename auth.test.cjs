/* Browser integration with simulated Supabase only. Set PLAYWRIGHT_MODULE if needed. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
let pw;
try { pw = require('playwright'); } catch { pw = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/esper/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'); }
const {keys, equal} = require('./cloud-sync-core.js');
const notesKey = keys[1];
const payload = text => ({[keys[0]]:'[]', [notesKey]:JSON.stringify({'0':[text]}), [keys[2]]:'{}'});
const rows = new Map([['student', payload('risposta originale')]]);
let writes = 0, fail = false, race = false, lag = 0, calls = [];
const pause = ms => new Promise(r => setTimeout(r, ms));
(async () => {
const browser = await pw.chromium.launch({headless:true, channel:'msedge'});
try {
  async function device(loggedIn = true) {
    const context = await browser.newContext();
    await context.exposeBinding('__testApi', async (_source, args) => {
      calls.push(args);
      if (args.op === 'auth') return {};
      if (fail) return {error:{message:'private backend details'}};
      if (lag) await pause(lag);
      const row = rows.get(args.id);
      if (args.op === 'select') return {data: row ? {payload:structuredClone(row)} : null};
      if (args.op === 'insert') {
        if (row) return {error:{code:'23505'}};
        rows.set(args.id, structuredClone(args.payload)); writes++;
      } else if (args.op === 'update') {
        if (race) { race = false; rows.set(args.id, payload('modifica simultanea')); return {data:[]}; }
        if (!equal(row, JSON.parse(args.expected))) return {data:[]};
        rows.set(args.id, structuredClone(args.payload)); writes++;
      }
      return {data:[{user_id:args.id}]};
    });
    await context.addInitScript(({loggedIn}) => {
      let current = loggedIn ? {id:'student',email:'student@example.test'} : null;
      window.testAuthEvent = (event, user) => { current = user; window.authCallback(event, user ? {user} : null); };
      window.supabase = {createClient:() => ({
        auth:{
          getSession:async()=>({data:{session:current ? {user:current} : null}}),
          getUser:async()=>({data:{user:current}}),
          onAuthStateChange:cb=>{window.authCallback=cb;},
          signInWithPassword:async input=>{await window.__testApi({op:'auth',method:'password',...input});current={id:'student',email:input.email};window.authCallback('SIGNED_IN',{user:current});return {data:{user:current}};},
          signInWithOtp:async input=>window.__testApi({op:'auth',method:'magic',...input}),
          signUp:async input=>{await window.__testApi({op:'auth',method:'signup',...input});return {data:{session:null}};},
          resetPasswordForEmail:async(email,options)=>window.__testApi({op:'auth',method:'reset',email,options}),
          updateUser:async input=>window.__testApi({op:'auth',method:'updatePassword',...input}),
          signOut:async input=>{await window.__testApi({op:'auth',method:'logout',...input});current=null;window.authCallback('SIGNED_OUT',null);return {};}
        },
        from:() => {
          let op='select', payload, id, expected;
          const q = {
            select:()=>q,
            eq:(key,value)=>{if(key==='user_id')id=value;else expected=value;return q;},
            update:input=>{op='update';payload=input.payload;return q;},
            insert:input=>{op='insert';payload=input.payload;id=input.user_id;return q;},
            maybeSingle:()=>window.__testApi({op,id}),
            then:(resolve,reject)=>window.__testApi({op,id,payload,expected}).then(resolve,reject)
          };return q;
        }
      })};
    }, {loggedIn});
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'test.local') return url.hostname === 'cdn.jsdelivr.net' ? route.fulfill({contentType:'application/javascript',body:''}) : route.abort();
      const name = decodeURIComponent(url.pathname).slice(1) || 'index.html';
      const file = path.resolve(__dirname, name);
      if (!file.startsWith(__dirname + path.sep) || !fs.existsSync(file)) return route.abort();
      const type = name.endsWith('.js') ? 'application/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.json') ? 'application/json' : 'text/html';
      return route.fulfill({contentType:type,body:fs.readFileSync(file)});
    });
    const page = await context.newPage();
    const errors = [];page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.accept());
    await page.goto('https://test.local/index.html');
    await page.locator('#startModalSkip').click();
    return {context,page,errors};
  }
  async function saved(page) { await page.waitForFunction(()=>document.querySelector('#syncState').textContent.includes('Tutte le modifiche'),{},{timeout:20000}); }
  const a = await device();
  await saved(a.page);
  assert.equal(await a.page.locator('[data-answer="0"]').inputValue(),'risposta originale');
  assert.equal(writes,0,'automatic load must not overwrite existing cloud');
  await a.page.locator('[data-answer="0"]').fill('scritta sul dispositivo A');
  await saved(a.page);
  assert.equal(JSON.parse(rows.get('student')[notesKey])['0'][0],'scritta sul dispositivo A');
  const b = await device(); await saved(b.page);
  assert.equal(await b.page.locator('[data-answer="0"]').inputValue(),'scritta sul dispositivo A');
  // Different answers merge and update the app's live in-memory model.
  await a.page.locator('[data-answer="1"]').fill('seconda risposta su A'); await saved(a.page);
  await b.page.locator('[data-answer="2"]').fill('terza risposta su B'); await saved(b.page);
  assert.equal(await b.page.locator('[data-answer="1"]').inputValue(),'seconda risposta su A');
  assert.equal(JSON.parse(rows.get('student')[notesKey])['0'][2],'terza risposta su B');
  // Offline edits remain local, then retry when online returns.
  fail = true;
  await b.page.locator('[data-answer="2"]').fill('modifica offline');
  await b.page.waitForFunction(()=>document.querySelector('#syncState').textContent.includes('non riuscita'));
  assert.equal(await b.page.locator('[data-answer="2"]').inputValue(),'modifica offline');
  assert(!(await b.page.locator('#syncState').textContent()).includes('private'));
  fail = false; await b.page.evaluate(()=>window.dispatchEvent(new Event('online'))); await saved(b.page);
  assert.equal(JSON.parse(rows.get('student')[notesKey])['0'][2],'modifica offline');
  // Changes typed during a delayed request must be saved as well.
  lag = 180;
  await b.page.locator('[data-answer="3"]').fill('prima battuta');
  await b.page.waitForFunction(()=>document.querySelector('#syncState').textContent.includes('attesa'));
  await pause(1000);
  await b.page.locator('[data-answer="3"]').fill('testo finale durante richiesta');
  lag = 0; await saved(b.page);
  assert.equal(JSON.parse(rows.get('student')[notesKey])['0'][3],'testo finale durante richiesta');
  // Race between SELECT and UPDATE must never overwrite another writer.
  race = true;
  await b.page.locator('[data-answer="0"]').fill('mia versione in conflitto');
  await b.page.waitForFunction(()=>!document.querySelector('#syncConflict').hidden);
  assert.equal(JSON.parse(rows.get('student')[notesKey])['0'][0],'modifica simultanea');
  assert.equal(await b.page.locator('[data-answer="0"]').inputValue(),'mia versione in conflitto');
  await b.page.locator('#syncUseRemote').click(); await saved(b.page);
  assert.equal(await b.page.locator('[data-answer="0"]').inputValue(),'modifica simultanea');
  assert(await b.page.evaluate(()=>Object.keys(localStorage).some(k=>k.startsWith('scrivimi-backup-'))));
  // Real app handlers use restored notes, not the stale pre-login object.
  await b.page.locator('[data-answer="1"]').fill('dopo ripristino'); await saved(b.page);
  assert.equal(JSON.parse(rows.get('student')[notesKey])['0'][0],'modifica simultanea');
  await a.context.close(); // Keep remaining scenarios isolated from periodic refresh on A.
  // Password setup and logout preserve the same account's online work.
  if(await b.page.locator('#syncPanel').isHidden())await b.page.locator('#syncToggle').click();
  await b.page.locator('#syncSetPassword').click();
  await b.page.locator('#syncNewPassword').fill('test-password-only');
  await b.page.locator('#syncConfirmPassword').fill('test-password-only');
  await b.page.locator('#syncPasswordForm button').click();
  await b.page.waitForFunction(()=>document.querySelector('#syncState').textContent.includes('Password impostata'));
  assert.equal(await b.page.locator('#syncNewPassword').inputValue(),'');
  await b.page.locator('#syncLogout').click();
  await b.page.waitForFunction(()=>!document.querySelector('#syncForm').hidden);
  assert.equal(await b.page.locator('[data-answer="0"]').inputValue(),'');
  assert(calls.some(c=>c.method==='logout' && c.scope==='local'));
  await b.page.locator('#syncEmail').fill('student@example.test');
  await b.page.locator('#syncPassword').fill('test-password-only');
  await b.page.locator('#syncLogin').click(); await saved(b.page);
  assert.equal(await b.page.locator('[data-answer="0"]').inputValue(),'modifica simultanea','relogin must restore, not upload empty workspace');
  await b.context.close();
  const guest = await device(false);
  await guest.page.locator('#syncToggle').click();
  await guest.page.locator('#syncEmail').fill('student@example.test');
  await guest.page.locator('#syncMagic').click();
  await guest.page.waitForFunction(()=>document.querySelector('#syncState').textContent.includes('Controlla posta'));
  assert(calls.some(c=>c.method==='magic' && c.options.emailRedirectTo==='https://test.local/index.html'));
  await guest.page.locator('#syncPassword').fill('test-registration-only');
  await guest.page.locator('#syncSignup').click();
  await guest.page.waitForFunction(()=>document.querySelector('#syncState').textContent.includes('confermare'));
  assert.equal(await guest.page.locator('#syncPassword').inputValue(),'');
  await guest.page.locator('#syncReset').click();
  await guest.page.waitForFunction(()=>document.querySelector('#syncState').textContent.includes('associato a un account'));
  await guest.page.evaluate(()=>window.testAuthEvent('PASSWORD_RECOVERY',{id:'student',email:'student@example.test'}));
  await guest.page.waitForFunction(()=>!document.querySelector('#syncPasswordForm').hidden);
  await saved(guest.page);
  // Account switch archives the first account, clears memory, then loads the second.
  rows.set('other',payload('risposta altro account'));
  await guest.page.evaluate(()=>window.testAuthEvent('SIGNED_IN',{id:'other',email:'other@example.test'}));
  await saved(guest.page);
  assert.equal(await guest.page.locator('[data-answer="0"]').inputValue(),'risposta altro account');
  assert.equal(JSON.parse(rows.get('student')[notesKey])['0'][0],'modifica simultanea');
  assert.deepEqual(a.errors,[]);assert.deepEqual(b.errors,[]);assert.deepEqual(guest.errors,[]);
  // Mobile account panel stays inside viewport.
  await guest.page.setViewportSize({width:375,height:812});
  const box=await guest.page.locator('#syncPanel').boundingBox();
  assert(box.x >= 0 && box.x + box.width <= 375);
  await guest.page.screenshot({path:path.resolve(__dirname,'..','auth-mobile.png'),fullPage:false});
  await guest.context.close();
  console.log('PASS: actual app hydration, automatic save and load across devices, independent edits, offline retry, atomic race detection, conflict resolution, password login/setup/recovery, logout/relogin, account isolation, mobile layout.');
} finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
