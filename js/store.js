/* ── Store: Firestore-backed, with ledgers (one per person/budget) ──
   Firestore layout:
     ledgers/{lid}                      { name, owner (uid), ownerEmail, members: [emails], createdAt }
     ledgers/{lid}/data/settings        the budget's funds, bills, accounts, rules
     ledgers/{lid}/data/state           { weekStart, lastClosed, weekCount }
     ledgers/{lid}/data/accounts        { entries: [...] }  month-end check-ins
     ledgers/{lid}/income/{YYYY-MM}     { month, entries: [...] }  tips, paychecks, other income
     ledgers/{lid}/purchases/{YYYY-MM}  { month, entries: [...] }
     ledgers/{lid}/weeks/{id}           one record per closed week
     ledgers/{lid}/pushTokens/{token}   { email, tz, createdAt }  for the daily nudge
*/
'use strict';

const store = {
  fs: null, mode: 'loading',
  ledgers: [],            // all ledgers this user can see
  ledgerId: null, ledger: null,
  data: { settings:null, state:null, income:{}, purchases:{}, weeks:{}, acct:null },
  listeners: new Set(), unsubs: [], ledgerUnsub: null,
  onChange(f){ this.listeners.add(f); },
  emit(){ this.listeners.forEach(f=>f()); },

  init(){
    this.fs = firebase.firestore();
    try { this.fs.enablePersistence({ synchronizeTabs:true }).catch(()=>{}); } catch(e){}
  },

  /* ── Ledgers ─────────────────────────────── */
  watchLedgers(email){
    if (this.ledgerUnsub) this.ledgerUnsub();
    this.ledgerUnsub = this.fs.collection('ledgers').where('members','array-contains', email).onSnapshot(q => {
      this.ledgers = q.docs.map(d => ({ id:d.id, ...d.data() })).sort((a,b)=> (a.createdAt||'') < (b.createdAt||'') ? -1 : 1);
      if (this.ledgers.length === 0) { this.mode = 'no-ledger'; this.emit(); return; }
      const remembered = localStorage.getItem(APP_NAME.toLowerCase()+'-ledger');
      const pick = this.ledgers.find(l=>l.id===this.ledgerId) || this.ledgers.find(l=>l.id===remembered) || this.ledgers[0];
      if (pick.id !== this.ledgerId) this.select(pick.id); else { this.ledger = pick; this.emit(); }
    }, e => { console.error(e); toast('Could not load your budgets — check your connection'); });
  },
  async createLedger(name, email, uid){
    const ref = await this.fs.collection('ledgers').add({ name: name || 'My budget', owner: uid, ownerEmail: email, members:[email], createdAt: new Date().toISOString() });
    this.select(ref.id);
    return ref.id;
  },
  async renameLedger(name){ await this.fs.doc(`ledgers/${this.ledgerId}`).update({ name }); },
  async setMembers(members){ await this.fs.doc(`ledgers/${this.ledgerId}`).update({ members }); },
  async deleteLedger(){
    const lid = this.ledgerId;
    const cols = ['data','income','purchases','weeks','pushTokens'];
    for (const c of cols) { const q = await this.fs.collection(`ledgers/${lid}/${c}`).get(); for (const d of q.docs) await d.ref.delete(); }
    await this.fs.doc(`ledgers/${lid}`).delete();
    this.ledgerId = null;
  },
  select(id){
    this.unsubs.forEach(u=>u()); this.unsubs = [];
    this.ledgerId = id; this.ledger = this.ledgers.find(l=>l.id===id) || null;
    this.data = { settings:null, state:null, income:{}, purchases:{}, weeks:{}, acct:null };
    this.mode = 'loading';
    try { localStorage.setItem(APP_NAME.toLowerCase()+'-ledger', id); } catch(e){}
    this.emit();
    const base = `ledgers/${id}`;
    const ready = { settings:false, state:false, acct:false, income:false, purchases:false, weeks:false };
    const check = () => { if (Object.values(ready).every(Boolean)) { this.mode = 'shared'; this.emit(); } };
    const onErr = e => { console.error(e); toast('Sync problem — some data may be stale'); };
    const doc = (path, key, rk) => this.unsubs.push(this.fs.doc(`${base}/${path}`).onSnapshot(s => { this.data[key] = s.exists ? s.data() : null; ready[rk]=true; check(); }, onErr));
    doc('data/settings','settings','settings'); doc('data/state','state','state'); doc('data/accounts','acct','acct');
    const coll = (name) => this.unsubs.push(this.fs.collection(`${base}/${name}`).onSnapshot(q => {
      const o = {}; q.docs.forEach(d => { o[d.id] = d.data(); }); this.data[name] = o; ready[name]=true; check(); }, onErr));
    coll('income'); coll('purchases'); coll('weeks');
  },
  isOwner(){ return this.ledger && Auth.uid() === this.ledger.owner; },

  /* ── Paths (kept from the single-file version) ── */
  path(p){
    const map = { 'settings/main':'data/settings', 'state/current':'data/state', 'history/accounts':'data/accounts' };
    return `ledgers/${this.ledgerId}/${map[p] || p}`;
  },
  async write(path, body){
    try { await this.fs.doc(this.path(path)).set(body); }
    catch(e){ console.error(e); toast(e.code==='permission-denied' ? 'You don’t have access to this budget' : 'Could not save — try again'); throw e; }
  },
  async remove(path){ await this.fs.doc(this.path(path)).delete(); },

  /* ── Accessors ─────────────────────────────── */
  get settings(){ return this.data.settings; },
  get state(){ return this.data.state || { weekStart: null }; },
  allTips(){ return Object.values(this.data.income).flatMap(d => d.entries||[]); },   // every kind of income
  allPurchases(){ return Object.values(this.data.purchases).flatMap(d => d.entries||[]); },
  weeks(){ return Object.values(this.data.weeks).sort((a,b)=>a.closedAt<b.closedAt?-1:1); },

  /* ── Mutations ─────────────────────────────── */
  async saveSettings(s){ await this.write('settings/main', s); },
  async saveState(st){ await this.write('state/current', st); },
  coll(kind){ return kind==='tips' ? 'income' : kind; },
  async addEntry(kind, entry){
    kind = this.coll(kind); const k = monthKey(entry.date); const doc = this.data[kind][k] || { month:k, entries:[] };
    await this.write(`${kind}/${k}`, { month:k, entries:[...doc.entries, { ...entry, by: Auth.email() }] });
  },
  async updateEntry(kind, id, patch){
    kind = this.coll(kind);
    for (const [k, doc] of Object.entries(this.data[kind])) {
      const i = (doc.entries||[]).findIndex(e=>e.id===id);
      if (i>=0) { const entries = doc.entries.slice(); entries[i] = {...entries[i], ...patch}; await this.write(`${kind}/${k}`, {month:k, entries}); return; }
    }
  },
  async deleteEntry(kind, id){
    kind = this.coll(kind);
    for (const [k, doc] of Object.entries(this.data[kind])) {
      if ((doc.entries||[]).some(e=>e.id===id)) { await this.write(`${kind}/${k}`, {month:k, entries:doc.entries.filter(e=>e.id!==id)}); return; }
    }
  },
  saveLocal(){}, // kept for API compatibility with the settings screen
};
