/* ── Ledgers: one budget per person, switchable, shareable ── */
'use strict';

const Ledgers = {
  renderChip(){
    let chip = $('#ledgerChip');
    if (!chip) { chip = document.createElement('button'); chip.id = 'ledgerChip'; chip.className = 'chip'; chip.style.cssText = 'margin-left:auto;max-width:46vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'; chip.onclick = () => this.openSwitcher(); $('.topbar .brand').after(chip); }
    const many = store.ledgers.length > 1;
    chip.hidden = !store.ledger;
    chip.innerHTML = store.ledger ? `${esc(store.ledger.name)} ${many ? '▾' : ''}` : '';
  },
  openSwitcher(){
    Sheet.open(`
      <h2>Budgets</h2><p class="lead">Each budget is its own ledger — separate funds, bills and history. Switch, or start one for someone else.</p>
      <div class="card list">${store.ledgers.map(l => `<div class="item" role="button" tabindex="0" onclick="Sheet.close();store.select('${l.id}');App.go('home')">
        <div><div class="t">${esc(l.name)} ${l.id===store.ledgerId?'<span class="pill pink">Open</span>':''}</div><div class="s">${l.members.length===1?'just you':l.members.length+' people'} · ${l.owner===Auth.uid()?'yours':'shared by '+esc(l.ownerEmail||'')}</div></div>
        <div class="amt">›</div></div>`).join('')}</div>
      <div class="sheet-actions" style="margin-top:14px"><button class="btn ghost" onclick="Sheet.close()">Close</button><button class="btn primary" onclick="Ledgers.create()">${ICON.plus} New budget</button></div>`);
  },
  renderFirstRun(){
    const first = (Auth.name()||'').split(' ')[0] || 'My';
    $('#view-setup').innerHTML = `
      <div style="padding-top:8px">
        <div class="hero-copy"><h2>Start a budget</h2><p>Give it a name — usually the person it belongs to. You can make more later for friends or students, and share any of them by email.</p></div>
        <form class="card" style="margin-top:16px" onsubmit="event.preventDefault();Ledgers.createFromForm()">
          <div class="field"><label for="newLedgerName">Budget name</label><input class="input" id="newLedgerName" value="${esc(first)}’s budget" required></div>
          <button class="btn primary block" type="submit">Create budget</button>
        </form>
        <p class="hint" style="margin-top:14px">Were you invited to someone’s budget? Make sure you signed in with the same email they used — it will show up here automatically.</p>
        <p class="hint" style="margin-top:6px">Signed in as ${esc(Auth.email())} · <button class="link" style="background:none;color:var(--muted);text-decoration:underline" onclick="Auth.signOut()">Sign out</button></p>
      </div>`;
  },
  async createFromForm(){ const name = $('#newLedgerName').value.trim(); if (!name) return; await store.createLedger(name, Auth.email(), Auth.uid()); App.draft = null; App.setupStep = 0; App.go('home'); },
  create(){
    Sheet.open(`<h2>New budget</h2><p class="lead">A fresh ledger with its own settings. Name it after the person it’s for.</p>
      <form onsubmit="event.preventDefault();Ledgers.createFromSheet()"><div class="field"><label for="sheetLedgerName">Name</label><input class="input" id="sheetLedgerName" placeholder="e.g. Jordan’s budget" required></div>
      <div class="sheet-actions"><button type="button" class="btn ghost" onclick="Sheet.close()">Cancel</button><button type="submit" class="btn primary">Create</button></div></form>`, () => setTimeout(()=>$('#sheetLedgerName')?.focus(), 80));
  },
  async createFromSheet(){ const name = $('#sheetLedgerName').value.trim(); if (!name) return; Sheet.close(); App.draft = null; App.dirty = false; App.setupStep = 0; await store.createLedger(name, Auth.email(), Auth.uid()); App.go('home'); toast(`${name} created — set it up below`); },
  async rename(){ const name = $('#ledgerName').value.trim(); if (!name) return; await store.renameLedger(name); toast('Renamed'); },
  async addMember(){
    const email = $('#inviteEmail').value.trim().toLowerCase(); if (!email) return;
    const members = [...new Set([...(store.ledger.members||[]), email])];
    try { await store.setMembers(members); toast(`Invited ${email}`); $('#inviteEmail').value=''; } catch(e){ toast('Only the owner can invite'); }
  },
  async removeMember(email){
    if (!confirm(`Remove ${email} from this budget?`)) return;
    await store.setMembers((store.ledger.members||[]).filter(m=>m!==email)); toast('Removed');
  },
  async remove(){
    if (!confirm(`Delete “${store.ledger.name}” and everything in it? This cannot be undone.`)) return;
    if (!confirm('Really delete? All tips, purchases and closed weeks in this budget will be gone for everyone.')) return;
    await store.deleteLedger(); App.draft = null; App.dirty = false; toast('Budget deleted');
  },
};

/* ── Theme ─────────────────────────────────── */
const Theme = {
  key: APP_NAME.toLowerCase()+'-theme',
  isDark(){ const t = document.documentElement.dataset.theme; return t ? t==='dark' : matchMedia('(prefers-color-scheme: dark)').matches; },
  apply(){ try { const t = localStorage.getItem(this.key); if (t) document.documentElement.dataset.theme = t; } catch(e){} $('#themeBtn').innerHTML = this.isDark() ? ICON.sun : ICON.moon; },
  toggle(){ const next = this.isDark() ? 'light' : 'dark'; document.documentElement.dataset.theme = next; try { localStorage.setItem(this.key, next); } catch(e){} this.apply(); },
};

/* ── Boot ──────────────────────────────────── */
(function boot(){
  document.title = APP_NAME; $('#brandName').textContent = APP_NAME; $('#authTitle').textContent = APP_NAME;
  Theme.apply();
  $('#themeBtn').onclick = () => Theme.toggle();
  $$('.tab[data-view]').forEach(t => t.onclick = () => { if (App.dirty && !confirm('Discard unsaved settings changes?')) return; App.dirty=false; App.draft=null; App.go(t.dataset.view); });
  $('#logTab').onclick = () => Log.open('tips');
  document.addEventListener('keydown', e => { if (e.key==='Enter' && e.target.matches('.fund,.item')) e.target.click(); });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});

  if (FIREBASE_CONFIG.apiKey === 'PASTE_ME') {
    $('#auth').hidden = false;
    $('#authMsg').innerHTML = '<b>Not configured yet.</b> Paste your Firebase config into <code>js/config.js</code> — see README.md, step 2.';
    $$('#auth button, #auth input').forEach(el => el.disabled = true);
    return;
  }
  firebase.initializeApp(FIREBASE_CONFIG);
  store.init();
  Auth.init(user => {
    if (!user) { $('#auth').hidden = false; $('#app').hidden = true; $('#tabbar').hidden = true; return; }
    $('#auth').hidden = true; $('#app').hidden = false;
    store.watchLedgers(Auth.email());
    Push.listen();
    App.render();
    Reminders.tick();
  });
})();
