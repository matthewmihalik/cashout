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
        <div><div class="t">${esc(l.name)} ${l.id===store.ledgerId?'<span class="pill pink">Open</span>':''}</div><div class="s">${l.joint?'joint · ':''}${l.members.length===1?'just you':l.members.length+' people'} · ${(l.owner===Auth.uid()||(l.admins||[]).includes(Auth.email()))?'yours':'shared by '+esc(l.ownerEmail||'')}</div></div>
        <div class="amt">›</div></div>`).join('')}</div>
      ${Joint.pendingForMe().map(i=>`<div class="notice pink" style="margin-top:10px">${ICON.spark}<div><div class="t">Invitation: “${esc(i.name)}”</div><div class="d">from ${esc(i.fromName||i.fromEmail)}</div></div><button class="btn sm go" onclick="Joint.review('${i.id}')">Review</button></div>`).join('')}
      <div class="sheet-actions" style="margin-top:14px"><button class="btn ghost" onclick="Sheet.close()">Close</button><button class="btn" onclick="Joint.start()">Joint budget</button><button class="btn primary" onclick="Ledgers.create()">${ICON.plus} New budget</button></div>`);
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
        ${Joint.pendingForMe().map(i=>`<div class="notice pink" style="margin-top:14px">${ICON.spark}<div><div class="t">${esc(i.fromName||i.fromEmail)} invited you to “${esc(i.name)}”</div><div class="d">A joint budget — you can accept now and make your own budget later.</div></div><button class="btn sm go" onclick="Joint.review('${i.id}')">Review</button></div>`).join('')}
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



/* ── Joint budgets: invite → accept → the joint ledger is created and both personal budgets get a contribution fund ── */
const Joint = {
  contribFields(prefix, def={mode:'fixed', value:100}){
    return `<div class="grid2">
      <div class="field"><label for="${prefix}Val">Your contribution</label>
        <div class="money" id="${prefix}Money" ${def.mode==='pct'?'hidden':''}><input class="input num" type="number" step="1" min="0" id="${prefix}Val" value="${def.mode==='pct'?'':def.value}" placeholder="0"></div>
        <div style="position:relative" id="${prefix}Pct" ${def.mode==='pct'?'':'hidden'}><input class="input num" type="number" step="1" min="0" max="100" id="${prefix}ValPct" value="${def.mode==='pct'?def.value:''}" placeholder="0"><span style="position:absolute;right:12px;top:50%;transform:translateY(-50%);color:var(--muted)">%</span></div></div>
      <div class="field"><label for="${prefix}Mode">Measured as</label><select class="input" id="${prefix}Mode"><option value="fixed" ${def.mode!=='pct'?'selected':''}>$ each week</option><option value="pct" ${def.mode==='pct'?'selected':''}>% of leftovers</option></select></div>
    </div>`;
  },
  wireContrib(sheet, prefix){ $('#'+prefix+'Mode', sheet).onchange = ev => { const pct = ev.target.value==='pct'; $('#'+prefix+'Money').hidden = pct; $('#'+prefix+'Pct').hidden = !pct; }; },
  readContrib(prefix){ const mode = $('#'+prefix+'Mode').value; const value = round2(mode==='pct' ? $('#'+prefix+'ValPct').value : $('#'+prefix+'Val').value); return { mode, value }; },
  fund(name, linkTo, c, tag){ return { id: uid(), emoji:'🏠', name, pct: c.mode==='pct' ? c.value : 0, mode: c.mode, amount: c.mode==='fixed' ? c.value : 0, balance:0, account:'', linkTo, tag }; },

  /* Step 1 — sender */
  start(){
    Sheet.open(`
      <h2>Start a joint budget</h2>
      <p class="lead">It won’t exist until they accept. When they do, you’ll both be owners, and each of your personal budgets gets a fund that sends money into it every week.</p>
      <form onsubmit="event.preventDefault();Joint.send()">
        <div class="field"><label for="jName">Name</label><input class="input" id="jName" value="Joint" required></div>
        <div class="field"><label for="jEmail">Who with</label><input class="input" type="email" id="jEmail" placeholder="partner@example.com" required autocomplete="off"></div>
        ${this.contribFields('jC')}
        <p class="hint">This comes out of <b>${esc(store.ledger?.name||'this budget')}</b> when you close its week. They’ll set their own amount when they accept.</p>
        <div class="sheet-actions" style="margin-top:14px"><button type="button" class="btn ghost" onclick="Sheet.close()">Cancel</button><button type="submit" class="btn primary" id="jSend">Send invitation</button></div>
      </form>`, sheet => { this.wireContrib(sheet, 'jC'); setTimeout(()=>$('#jEmail')?.focus(), 80); });
  },
  async send(){
    const name = $('#jName').value.trim(); const toEmail = $('#jEmail').value.trim().toLowerCase(); const c = this.readContrib('jC');
    if (!name || !toEmail) return;
    if (toEmail === Auth.email()) { toast('That’s your own email'); return; }
    if (store.invites.some(i => i.status==='pending' && i.toEmail===toEmail && i.fromEmail===Auth.email())) { toast('You already have an invitation out to them'); return; }
    $('#jSend').disabled = true;
    try {
      await store.createInvite({ kind:'joint', name, fromEmail: Auth.email(), fromUid: Auth.uid(), fromName: Auth.name(), fromLedger: store.ledgerId, fromLedgerName: store.ledger?.name||'', toEmail, contribution: c });
      Sheet.close(); toast(`Invitation sent to ${toEmail}`); App.render();
    } catch(e){ console.error(e); $('#jSend').disabled = false; toast('Could not send — try again'); }
  },
  async cancel(id){ if (!confirm('Cancel this invitation?')) return; await store.deleteInvite(id); toast('Invitation cancelled'); },

  /* Step 2 — recipient */
  pendingForMe(){ return store.invites.filter(i => i.status==='pending' && i.toEmail===Auth.email()); },
  pendingFromMe(){ return store.invites.filter(i => i.status==='pending' && i.fromEmail===Auth.email()); },
  review(id){
    const inv = store.invites.find(i=>i.id===id); if (!inv) return;
    const mine = store.ledgers.filter(l => !l.joint);
    const cDesc = inv.contribution?.mode==='pct' ? `${inv.contribution.value}% of their leftovers` : `${fmt(inv.contribution?.value||0)} each week`;
    Sheet.open(`
      <h2>Joint budget invitation</h2>
      <p class="lead"><b>${esc(inv.fromName||inv.fromEmail)}</b> wants to start <b>“${esc(inv.name)}”</b> with you. They’ll put in ${cDesc} from ${esc(inv.fromLedgerName||'their budget')}. Accepting creates the budget with both of you as owners.</p>
      <form onsubmit="event.preventDefault();Joint.accept('${inv.id}')">
        ${mine.length ? `<div class="field"><label for="jFrom">Contribute from</label><select class="input" id="jFrom">${mine.map(l=>`<option value="${l.id}" ${l.id===store.ledgerId?'selected':''}>${esc(l.name)}</option>`).join('')}</select></div>` : `<p class="hint">You don’t have a personal budget yet — you can add your contribution later from Settings.</p>`}
        ${mine.length ? this.contribFields('aC', inv.contribution||{mode:'fixed',value:100}) : ''}
        <div class="sheet-actions" style="margin-top:14px"><button type="button" class="btn danger" onclick="Joint.decline('${inv.id}')">Decline</button><button type="submit" class="btn primary" id="jAccept">Accept & create</button></div>
      </form>`, sheet => { if (mine.length) this.wireContrib(sheet, 'aC'); });
  },
  async decline(id){ if (!confirm('Decline this invitation? Nothing will be created.')) return; await store.updateInvite(id, { status:'declined', respondedAt:new Date().toISOString() }); Sheet.close(); toast('Declined'); },
  async accept(id){
    const inv = store.invites.find(i=>i.id===id); if (!inv) return;
    const btn = $('#jAccept'); btn.disabled = true;
    try {
      const lid = await store.createJointLedger(inv.name, inv, Auth.email(), Auth.uid());
      const fromSel = $('#jFrom');
      if (fromSel) { const c = this.readContrib('aC'); if (c.value > 0) await store.addContributionFund(fromSel.value, this.fund(inv.name, lid, c, inv.id+':to')); }
      await store.updateInvite(id, { status:'accepted', ledgerId: lid, respondedAt: new Date().toISOString(), toName: Auth.name() });
      Sheet.close(); toast(`“${inv.name}” created — set it up`);
      App.draft = null; App.dirty = false; App.setupStep = 0;
      store.select(lid); App.go('home');
    } catch(e){ console.error(e); btn.disabled = false; toast('Could not create the joint budget'); }
  },

  /* Step 3 — sender's app finishes the link when it sees the acceptance */
  linking: false,
  async onInvitesChanged(){
    if (this.linking) return;
    const done = store.invites.filter(i => i.status==='accepted' && i.fromEmail===Auth.email() && i.ledgerId && !i.linked);
    for (const inv of done) {
      this.linking = true;
      try {
        const c = inv.contribution || {mode:'fixed', value:0};
        if (c.value > 0 && inv.fromLedger) await store.addContributionFund(inv.fromLedger, this.fund(inv.name, inv.ledgerId, c, inv.id+':from'));
        await store.updateInvite(inv.id, { linked: true });
        toast(`${inv.toName||inv.toEmail} accepted — “${inv.name}” is ready`);
      } catch(e){ console.error(e); }
      this.linking = false;
    }
    const declined = store.invites.filter(i => i.status==='declined' && i.fromEmail===Auth.email() && !i.seen);
    for (const inv of declined) { try { await store.updateInvite(inv.id, { seen:true }); toast(`${inv.toEmail} declined “${inv.name}”`); } catch(e){} }
  },
  renderSettings(){
    const out = this.pendingFromMe().filter(i=>i.fromLedger===store.ledgerId);
    return `<div class="card">
      <p style="font-size:13.5px;color:var(--text-2)">A joint budget is a full budget of its own, fed by a weekly contribution from each of your personal budgets. Invite someone; it’s created the moment they accept.</p>
      ${out.map(i=>`<div class="member" style="margin-top:10px"><span class="who">Waiting for <b>${esc(i.toEmail)}</b> to accept “${esc(i.name)}”</span><button class="btn sm ghost" onclick="Joint.cancel('${i.id}')">Cancel</button></div>`).join('')}
      <button class="btn primary" style="margin-top:12px" onclick="Joint.start()">${ICON.plus} Start a joint budget</button>
    </div>`;
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
      store.watchInvites(Auth.email());
      Push.listen();
      App.render();
      Reminders.tick();
    } catch(e) { console.error(e); window.__bootShow && window.__bootShow('After sign-in: ' + (e.stack || e.message)); }
  });
 } catch(e) { console.error(e); window.__bootShow && window.__bootShow('Startup: ' + (e.stack || e.message)); }
})();
