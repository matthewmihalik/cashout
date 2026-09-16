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


/* ── Appearance: per-device accent colors. The whole neutral palette is derived from the accent's hue. ── */
const Appearance = {
  key: APP_NAME.toLowerCase()+'-accent',
  presets: [
    { name:'Pink',     primary:'#FF6FB5', secondary:'#FFB3DB', spend:'#F5B547' },
    { name:'Coral',    primary:'#FF7A59', secondary:'#FFC4A8', spend:'#F5D547' },
    { name:'Lavender', primary:'#B48CFF', secondary:'#DCCBFF', spend:'#F5B547' },
    { name:'Sky',      primary:'#5AB4FF', secondary:'#B3DCFF', spend:'#F5B547' },
    { name:'Mint',     primary:'#4CD3A1', secondary:'#A8F0D3', spend:'#F5B547' },
    { name:'Gold',     primary:'#F5B547', secondary:'#FFE0A3', spend:'#FF7A59' },
    { name:'Cherry',   primary:'#FF4D6D', secondary:'#FFB0BF', spend:'#F5B547' },
    { name:'Slate',    primary:'#8FA8C8', secondary:'#C9D6E8', spend:'#F5B547' },
  ],
  get(){ try { return JSON.parse(localStorage.getItem(this.key)) || null; } catch(e){ return null; } },
  set(v){ try { if (v) localStorage.setItem(this.key, JSON.stringify(v)); else localStorage.removeItem(this.key); } catch(e){} this.apply(); },
  hexToHsl(hex){ const m = hex.replace('#',''); const r=parseInt(m.slice(0,2),16)/255, g=parseInt(m.slice(2,4),16)/255, b=parseInt(m.slice(4,6),16)/255;
    const max=Math.max(r,g,b), min=Math.min(r,g,b); let h=0,s=0; const l=(max+min)/2;
    if (max!==min){ const d=max-min; s=l>.5?d/(2-max-min):d/(max+min); h = max===r ? (g-b)/d+(g<b?6:0) : max===g ? (b-r)/d+2 : (r-g)/d+4; h*=60; }
    return { h, s:s*100, l:l*100 }; },
  rgba(hex, a){ const m = hex.replace('#',''); return `rgba(${parseInt(m.slice(0,2),16)},${parseInt(m.slice(2,4),16)},${parseInt(m.slice(4,6),16)},${a})`; },
  hsl(h,s,l){ return `hsl(${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%)`; },
  /** Ensure the accent reads on the given ground: darken for light mode, lighten for dark mode. */
  fit(hex, dark){ const c = this.hexToHsl(hex); if (dark) return c.l < 45 ? this.hsl(c.h, c.s, 60) : hex; return c.l > 52 ? this.hsl(c.h, Math.min(100, c.s+10), 40) : hex; },
  apply(){
    const root = document.documentElement; const v = this.get();
    const names = ['--bg','--surface','--surface-2','--surface-3','--border','--border-strong','--text','--text-2','--muted','--faint','--pink','--pink-ink','--pink-soft','--pink-glow','--brass','--brass-ink','--brass-soft','--lilac','--lilac-soft','--grid','--axis','--shadow'];
    if (!v) { names.forEach(n => root.style.removeProperty(n)); this.meta(); return; }
    const dark = Theme.isDark(); const { h } = this.hexToHsl(v.primary);
    const t = {};
    if (dark) {
      Object.assign(t, { '--bg':this.hsl(h,28,8), '--surface':this.hsl(h,24,12), '--surface-2':this.hsl(h,22,15), '--surface-3':this.hsl(h,20,20),
        '--border':this.hsl(h,20,24), '--border-strong':this.hsl(h,18,30), '--text':this.hsl(h,40,96), '--text-2':this.hsl(h,25,82), '--muted':this.hsl(h,15,62), '--faint':this.hsl(h,12,43),
        '--grid':this.hsl(h,20,17), '--axis':this.hsl(h,18,30), '--shadow':'0 10px 30px rgba(0,0,0,.45)' });
    } else {
      Object.assign(t, { '--bg':this.hsl(h,100,98), '--surface':'#FFFFFF', '--surface-2':this.hsl(h,70,95), '--surface-3':this.hsl(h,60,91),
        '--border':this.hsl(h,55,88), '--border-strong':this.hsl(h,45,80), '--text':this.hsl(h,45,15), '--text-2':this.hsl(h,30,32), '--muted':this.hsl(h,18,50), '--faint':this.hsl(h,25,70),
        '--grid':this.hsl(h,60,94), '--axis':this.hsl(h,45,80), '--shadow':`0 10px 30px ${this.rgba(v.primary,.12)}` });
    }
    const p = this.fit(v.primary, dark), s = this.fit(v.secondary || v.primary, dark), b = this.fit(v.spend || '#F5B547', dark);
    const pl = this.hexToHsl(v.primary);
    Object.assign(t, { '--pink':p, '--pink-ink': dark ? this.hsl(pl.h,60,12) : '#FFFFFF', '--pink-soft':this.rgba(v.primary, dark?.16:.10), '--pink-glow':this.rgba(v.primary, dark?.40:.28),
      '--lilac':s, '--lilac-soft':this.rgba(v.secondary || v.primary, dark?.16:.12), '--brass':b, '--brass-ink': dark ? '#2A1B05' : '#FFFFFF', '--brass-soft':this.rgba(v.spend || '#F5B547', dark?.15:.12) });
    Object.entries(t).forEach(([k,val]) => root.style.setProperty(k, val));
    this.meta();
  },
  meta(){ const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(); $$('meta[name="theme-color"]').forEach(m => m.setAttribute('content', bg)); },
  renderSection(){
    const v = this.get() || this.presets[0]; const cur = JSON.stringify(v);
    return `<div class="card">
      <div class="subhead">Presets</div>
      <div class="chips" id="accentPresets">${this.presets.map(p => `<button type="button" class="chip ${JSON.stringify(p)===cur?'active':''}" data-preset="${esc(p.name)}" style="display:inline-flex;align-items:center;gap:7px"><i style="width:14px;height:14px;border-radius:50%;background:${p.primary};box-shadow:inset 0 0 0 2px ${p.secondary}"></i>${esc(p.name)}</button>`).join('')}</div>
      <div class="subhead">Custom</div>
      <div class="grid3">
        <label class="field" style="margin:0"><span class="hint" style="font-weight:600;text-transform:uppercase;letter-spacing:.06em;font-size:11px;color:var(--muted)">Accent</span><input type="color" id="accPrimary" value="${v.primary}" style="width:100%;height:42px;border:1px solid var(--border);border-radius:10px;background:var(--surface-2);padding:4px"></label>
        <label class="field" style="margin:0"><span class="hint" style="font-weight:600;text-transform:uppercase;letter-spacing:.06em;font-size:11px;color:var(--muted)">Long-term</span><input type="color" id="accSecondary" value="${v.secondary}" style="width:100%;height:42px;border:1px solid var(--border);border-radius:10px;background:var(--surface-2);padding:4px"></label>
        <label class="field" style="margin:0"><span class="hint" style="font-weight:600;text-transform:uppercase;letter-spacing:.06em;font-size:11px;color:var(--muted)">Spending</span><input type="color" id="accSpend" value="${v.spend}" style="width:100%;height:42px;border:1px solid var(--border);border-radius:10px;background:var(--surface-2);padding:4px"></label>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px;align-items:center;flex-wrap:wrap"><button type="button" class="btn sm ghost" onclick="Appearance.set(null);Settings.render()">Reset to default</button><span class="hint">Colors are saved on this device only — everyone picks their own.</span></div>
    </div>`;
  },
  wire(root){
    const presets = $('#accentPresets', root); if (!presets) return;
    presets.onclick = ev => { const b = ev.target.closest('[data-preset]'); if (!b) return; const p = this.presets.find(x=>x.name===b.dataset.preset); this.set({ primary:p.primary, secondary:p.secondary, spend:p.spend }); $$('[data-preset]', presets).forEach(x=>x.classList.toggle('active', x===b)); $('#accPrimary').value=p.primary; $('#accSecondary').value=p.secondary; $('#accSpend').value=p.spend; };
    ['accPrimary','accSecondary','accSpend'].forEach(id => { const el = $('#'+id, root); if (el) el.oninput = () => { this.set({ primary:$('#accPrimary').value, secondary:$('#accSecondary').value, spend:$('#accSpend').value }); $$('[data-preset]', presets).forEach(x=>x.classList.remove('active')); }; });
  },
};

/* ── Theme ─────────────────────────────────── */
const Theme = {
  key: APP_NAME.toLowerCase()+'-theme',
  isDark(){ const t = document.documentElement.dataset.theme; return t ? t==='dark' : matchMedia('(prefers-color-scheme: dark)').matches; },
  apply(){ try { const t = localStorage.getItem(this.key); if (t) document.documentElement.dataset.theme = t; } catch(e){} $('#themeBtn').innerHTML = this.isDark() ? ICON.sun : ICON.moon; Appearance.apply(); },
  toggle(){ const next = this.isDark() ? 'light' : 'dark'; document.documentElement.dataset.theme = next; try { localStorage.setItem(this.key, next); } catch(e){} this.apply(); },
};

/* ── Boot ──────────────────────────────────── */
(function boot(){
 try {
  document.title = APP_NAME; $('#brandName').textContent = APP_NAME; $('#authTitle').textContent = APP_NAME;
  Theme.apply();
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => Theme.apply()); } catch(e){}
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
    try {
      if (!user) { $('#auth').hidden = false; $('#app').hidden = true; $('#tabbar').hidden = true; if ($('#authMsg').textContent === 'Connecting…') $('#authMsg').textContent = ''; return; }
      $('#auth').hidden = true; $('#app').hidden = false;
      store.watchLedgers(Auth.email());
      Push.listen();
      App.render();
      Reminders.tick();
    } catch(e) { console.error(e); window.__bootShow && window.__bootShow('After sign-in: ' + (e.stack || e.message)); }
  });
 } catch(e) { console.error(e); window.__bootShow && window.__bootShow('Startup: ' + (e.stack || e.message)); }
})();
