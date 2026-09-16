/* ── App state & routing ───────────────────── */
const App = {
  view: 'home', draft: null, dirty: false, setupStep: 0,
  ctx(){ const s = store.settings; const c = s ? Model.compute(s, store.state, store.allTips(), store.allPurchases()) : null; return { s, c }; },
  go(view){
    this.view = view;
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-'+view));
    $$('.tab[data-view]').forEach(t => t.classList.toggle('active', t.dataset.view === view));
    window.scrollTo({top:0});
    this.render();
  },
  render(){
    const s = store.settings;
    $('#todayLabel').textContent = new Date().toLocaleDateString('en-US',{weekday:'short', month:'short', day:'numeric'});
    Ledgers.renderChip();
    if (store.mode === 'loading') { $('#tabbar').hidden = true; $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-home')); $('#view-home').innerHTML = '<div class="empty" style="padding:60px 0"><b>Opening your budget…</b></div>'; return; }
    if (store.mode === 'no-ledger') { $('#tabbar').hidden = true; $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-setup')); Ledgers.renderFirstRun(); return; }
    if (!s || !s.setupDone) {
      $('#tabbar').hidden = true;
      $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-setup'));
      Setup.render(); return;
    }
    $('#tabbar').hidden = false;
    if (this.view === 'home') Home.render();
    else if (this.view === 'insights') Insights.render();
    else if (this.view === 'bills') Bills.render();
    else if (this.view === 'settings') Settings.render();
  },
};
store.onChange(() => { if (!App.dirty) App.render(); else Settings.refreshStatus?.(); });

/* ── Sheet (bottom modal) ─────────────────── */
const Sheet = {
  open(html, onOpen){
    const old = $('#sheet'); const el = old.cloneNode(false); old.replaceWith(el);   // fresh node: no stale listeners
    el.innerHTML = '<div class="grab"></div>' + html; $('#sheetBg').classList.add('open'); document.body.style.overflow='hidden'; onOpen && onOpen(el);
  },
  close(){ $('#sheetBg').classList.remove('open'); document.body.style.overflow=''; $('#sheet').innerHTML=''; },
};
$('#sheetBg').addEventListener('click', e => { if (e.target === $('#sheetBg')) Sheet.close(); });
document.addEventListener('keydown', e => { if (e.key==='Escape') Sheet.close(); });

/* ── Shared renderers ─────────────────────── */
const fundIcon = (f, extra='') => `<div class="ico ${extra}">${esc(f.emoji||'•')}</div>`;
const findFund = (s, id) => s.weeklyFunds.find(f=>f.id===id) || s.permFunds.find(f=>f.id===id) || s.bills.find(f=>f.id===id);
const catLabel = (s, id) => { const f = findFund(s, id); return f ? `${f.emoji||''} ${f.name}`.trim() : id; };
const incomeLabel = e => (e.type||'tips')==='tips' ? 'Shift tips' : e.type==='wage' ? 'Paycheck' : 'Other income';
const catKind = (s, id) => s.weeklyFunds.some(f=>f.id===id) ? 'weekly' : s.permFunds.some(f=>f.id===id) ? 'perm' : 'bill';

function notices(s, c){
  const out = [];
  const now = new Date(); const mk = monthKey(todayISO());
  if (Math.abs(c.pctTotal - 100) > 0.01) out.push({ cls:'warn', icon:ICON.alert, t:`Fund percentages add up to ${round2(c.pctTotal)}%`, d:'They need to total 100% so every leftover dollar has a home.', go:['Fix', "App.go('settings')"] });
  const due = s.bills.filter(b => +b.amount>0 && !Model.billPaid(b, mk)).map(b=>({b, d:Model.billDays(b, now)})).filter(x=>x.d<=5).sort((a,b)=>a.d-b.d);
  if (due.length) {
    const worst = due[0].d;
    out.push({ cls: worst<=0?'crit':'warn', icon:ICON.bell, t: due.length===1 ? `${due[0].b.name} ${dueWord(due[0].d)}` : `${due.length} bills due soon`,
      d: due.map(x=>`${x.b.name} ${fmt(x.b.amount)} · ${dueWord(x.d)}`).join('  ·  '), go:['Bills', "App.go('bills')"] });
  }
  const ws = store.state.weekStart ? new Date(store.state.weekStart) : null;
  const daysOpen = ws ? Math.floor((now - ws)/86400000) : null;
  if (now.getDay() === (s.closeDay??0) && (daysOpen===null || daysOpen>=1)) out.push({ cls:'lilac', icon:ICON.cal, t:'It’s close-week day', d:'Log any last tips and purchases, then close the week to get your transfer checklist.', go:['Close week', 'Close.open()'] });
  else if (daysOpen !== null && daysOpen >= 9) out.push({ cls:'lilac', icon:ICON.cal, t:`This week has been open ${daysOpen} days`, d:'Closing resets your weekly funds and moves leftovers to savings.', go:['Close week', 'Close.open()'] });
  const loggedToday = store.allTips().some(t=>t.date===todayISO() && (t.type||'tips')==='tips');
  if (!loggedToday && now.getHours() >= (s.remindHour??21) && s.tipsExpected!==false) out.push({ cls:'pink', icon:ICON.spark, t:'No shift logged today yet', d:'Worked tonight? Log your tips now while the numbers are fresh.', go:['Log income', "Log.open('tips')"] });
  const lastDay = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
  const acctDone = (store.data.acct?.entries||[]).some(e=>e.month===mk);
  if (now.getDate() >= lastDay-3 && !acctDone && s.accounts.length) out.push({ cls:'pink', icon:ICON.spark, t:'Month-end account check-in', d:'Enter your real account balances so interest and market returns show up in your funds.', go:['Check in', 'Accounts.open()'] });
  return out.map(n => `<div class="notice ${n.cls}">${n.icon}<div><div class="t">${esc(n.t)}</div><div class="d">${esc(n.d)}</div></div><button class="btn sm go" onclick="${n.go[1]}">${esc(n.go[0])}</button></div>`).join('');
}
const dueWord = d => d<0 ? `overdue ${-d}d` : d===0 ? 'due today' : d===1 ? 'due tomorrow' : `due in ${d} days`;

/* ── HOME ─────────────────────────────────── */
const Home = {
  render(){
    const { s, c } = App.ctx(); if (!s) return;
    const ws = Model.weekStartDate(store.state);
    const tips = c.weeklyTips;
    const parts = [
      { k:'Bills set aside', v:Math.min(tips, c.billsSet), color:'var(--faint)' },
      { k:'Weekly funds', v:Math.max(0, Math.min(tips - c.billsSet, c.totalWeeklyBudget)), color:'var(--brass)' },
      { k:'To savings', v:c.directRemainder, color:'var(--lilac)' },
    ];
    const meter = tips>0 ? parts.map(p=>`<span style="width:${(p.v/tips*100).toFixed(2)}%;background:${p.color}"></span>`).join('') : '';
    const recent = [...store.allTips().map(t=>({...t, kind:'tips'})), ...store.allPurchases().map(p=>({...p, kind:'purchases'}))]
      .sort((a,b)=> (b.ts||b.date) > (a.ts||a.date) ? 1 : -1).slice(0,6);

    $('#view-home').innerHTML = `
      <div class="stack">${notices(s, c)}</div>
      <div class="ledger" style="margin-top:${notices(s,c)?'12px':'0'}">
        <div class="eyebrow"><span>This week${ws?` · since ${fmtDate(ws,{month:'short',day:'numeric'})}`:''}</span><b>${c.wTips.filter(t=>(t.type||'tips')==='tips').length} shift${c.wTips.filter(t=>(t.type||'tips')==='tips').length===1?'':'s'}</b></div>
        <div class="big"><span class="amt num">${fmt(tips)}</span><span class="lbl">earned</span></div>
        <div class="meter">${meter}</div>
        <div class="meter-legend">${parts.map(p=>`<span><i style="background:${p.color}"></i>${p.k}</span>`).join('')}</div>
        <div class="rows">
          <div class="lrow"><span class="k"><i style="background:var(--faint)"></i>Bills set aside (${s.billsMethod==='annual'?'×12 ÷ 52':'÷ 4'})</span><span class="v num">${fmt(c.billsSet)}</span></div>
          <div class="lrow"><span class="k"><i style="background:var(--brass)"></i>Weekly funds filled</span><span class="v num">${fmt(c.totalWeeklyBudget)}</span></div>
          <div class="lrow"><span class="k"><i style="background:var(--brass)"></i>Spent so far</span><span class="v num">${fmt(c.weeklySpent)}</span></div>
          <div class="lrow"><span class="k"><i style="background:var(--lilac)"></i>Unspent from funds</span><span class="v num">${fmt(c.unspent)}</span></div>
          <div class="lrow total"><span class="k">Headed to savings on close</span><span class="v num ${c.toPerm>0?'pos':''}">${fmt(c.toPerm)}</span></div>
          ${c.shortfall>0?`<div class="lrow"><span class="k warnc">Short of bills + budgets</span><span class="v num warnc">−${fmt(c.shortfall)}</span></div>`:''}
          ${c.overdraft.total>0?`<div class="lrow"><span class="k neg">Overspent (covered from savings on close)</span><span class="v num neg">−${fmt(c.overdraft.total)}</span></div>`:''}
        </div>
        <div class="actions">
          <button class="btn primary" onclick="Log.open('tips')">${ICON.plus} Income</button>
          <button class="btn brass" onclick="Log.open('purchase')">${ICON.plus} Purchase</button>
          <button class="btn ghost" style="margin-left:auto" onclick="Close.open()">Close week →</button>
        </div>
      </div>

      <div class="section">
        <div class="section-head"><h2>Weekly funds</h2><span class="link num">${fmt(c.totalWeeklyBudget - c.weeklySpent)} left</span></div>
        <div class="card">${c.funds.length ? c.funds.map(f => {
          const pct = f.budget>0 ? Math.min(100, f.spent/f.budget*100) : (f.spent>0?100:0);
          const cls = f.spent>f.budget ? 'over' : pct>=80 ? 'hot' : '';
          return `<div class="fund" role="button" tabindex="0" onclick="Log.open('purchase',{category:'${f.id}'})">
            ${fundIcon(f)}
            <div><div class="name">${esc(f.name)}</div><div class="bar"><span class="${cls}" style="width:${pct}%"></span></div>
              <div class="sub num">${fmt(f.spent)} of ${fmt(f.budget)}</div></div>
            <div class="right"><div class="amt num ${f.remaining<0?'neg':''}">${fmt(f.remaining)}</div><div class="tiny">${f.remaining<0?'over':'left'}</div></div>
          </div>`; }).join('') : '<div class="empty"><b>No weekly funds yet</b>Add them in Settings.</div>'}</div>
      </div>

      <div class="section">
        <div class="section-head"><h2>Long-term funds</h2><span class="link num">${fmt(sum(s.permFunds,f=>f.balance))} total</span></div>
        <div class="card">${s.permFunds.map(f => { const t = c.transfers.find(x=>x.id===f.id); const acct = s.accounts.find(a=>a.id===f.account);
          return `<div class="fund">${fundIcon(f,'')}
            <div><div class="name">${esc(f.name)}</div><div class="sub">${esc(f.pct)}% of leftovers${acct?` · ${esc(acct.institution)} ${esc(acct.name)}`:''}</div></div>
            <div class="right"><div class="amt num">${fmt(f.balance)}</div><div class="tiny num" style="color:var(--lilac)">${t&&t.total>0?fmt(t.total,{plus:true})+' pending':''}</div></div>
          </div>`; }).join('')}</div>
      </div>

      <div class="section">
        <div class="section-head"><h2>Recent</h2><button class="link" style="background:none" onclick="Insights.render();App.go('insights')">All activity</button></div>
        <div class="card list">${recent.length ? recent.map(e => e.kind==='tips'
          ? `<div class="item" role="button" tabindex="0" onclick="Log.edit('tips','${e.id}')"><div><div class="t">${incomeLabel(e)} <span class="pill good">${esc(DOW[parseISO(e.date).getDay()])}</span></div><div class="s">${fmtDate(e.date)} · ${(e.type||'tips')==='tips' ? `cash ${fmt(e.cash)} · card ${fmt(e.card)}` : esc(e.source||'')}${e.notes?' · '+esc(e.notes):''}</div></div><div class="amt num pos">${fmt(e.total,{plus:true})}</div></div>`
          : `<div class="item" role="button" tabindex="0" onclick="Log.edit('purchases','${e.id}')"><div><div class="t">${esc(e.merchant||'Purchase')}</div><div class="s">${fmtDate(e.date)} · ${esc(catLabel(s,e.category))} · ${esc(e.payment||'')}</div></div><div class="amt num">−${fmt(e.amount)}</div></div>`
        ).join('') : '<div class="empty"><b>Nothing logged yet</b>Tap Log to record a shift or a purchase.</div>'}</div>
      </div>
      <div class="status-line">${esc(store.ledger?.name||'')} · ${(store.ledger?.members||[]).length===1 ? 'just you' : (store.ledger?.members||[]).length+' people'} · synced</div>`;
  },
};

/* ── LOG (tips / purchase) ─────────────────── */
const Log = {
  mode:'tips', editing:null,
  open(mode='tips', preset={}, editing=null){
    this.mode = mode; this.editing = editing;
    const s = store.settings;
    const e = editing || {};
    const itype = e.type || preset.type || 'tips';
    const tipsForm = `
      <div class="field"><label for="f-type">Type of income</label>
        <select class="input" id="f-type"><option value="tips" ${itype==='tips'?'selected':''}>Tips (cash + card)</option><option value="wage" ${itype==='wage'?'selected':''}>Paycheck / wages</option><option value="other" ${itype==='other'?'selected':''}>Other (Venmo, gift, side gig…)</option></select></div>
      <div id="f-tipsFields" ${itype==='tips'?'':'hidden'}>
        <div class="grid2">
          <div class="field"><label for="f-cash">Cash tips</label><div class="money"><input class="input num" id="f-cash" type="number" inputmode="decimal" step="0.01" min="0" placeholder="0" value="${e.cash??''}"></div></div>
          <div class="field"><label for="f-card">Card tips</label><div class="money"><input class="input num" id="f-card" type="number" inputmode="decimal" step="0.01" min="0" placeholder="0" value="${e.card??''}"></div></div>
        </div>
      </div>
      <div id="f-otherFields" ${itype==='tips'?'hidden':''}>
        <div class="grid2">
          <div class="field"><label for="f-income">Amount</label><div class="money"><input class="input num" id="f-income" type="number" inputmode="decimal" step="0.01" min="0" placeholder="0" value="${itype!=='tips'?(e.total??''):''}"></div></div>
          <div class="field"><label for="f-source">From</label><input class="input" id="f-source" type="text" placeholder="${itype==='wage'?'Employer':'Venmo, birthday…'}" value="${esc(e.source||'')}"></div>
        </div>
      </div>
      <div class="total-line"><span class="k" id="f-totalLabel">${itype==='tips'?'Shift total':'Income'}</span><span class="v num" id="f-total">${fmt(e.total||0)}</span></div>
      <div class="grid2">
        <div class="field"><label for="f-date">Date</label><input class="input" id="f-date" type="date" value="${e.date||todayISO()}"></div>
        <div class="field"><label for="f-notes">Note</label><input class="input" id="f-notes" type="text" placeholder="${itype==='tips'?'Busy night, event…':'Optional'}" value="${esc(e.notes||'')}"></div>
      </div>`;
    const recentMerchants = [...new Set(store.allPurchases().sort((a,b)=>(b.ts||'')>(a.ts||'')?1:-1).map(p=>p.merchant).filter(Boolean))].slice(0,6);
    const cat = e.category || preset.category || '';
    const { c } = App.ctx();
    const catBtn = (f, kind) => { const wf = c.funds.find(x=>x.id===f.id);
      return `<button type="button" class="cat ${kind} ${cat===f.id?'active':''}" data-cat="${f.id}"><span class="e">${esc(f.emoji||'•')}</span>${esc(f.name)}${wf?`<span class="left num">${fmt(wf.remaining,{cents:false})} left</span>`:''}</button>`; };
    const purchaseForm = `
      <div class="field"><label for="f-amt">Amount</label><div class="money"><input class="input num" id="f-amt" type="number" inputmode="decimal" step="0.01" min="0" placeholder="0.00" value="${e.amount??''}" style="font-size:26px"></div></div>
      <div class="field"><label>Category</label>
        <div class="catgrid" id="f-cats">${s.weeklyFunds.map(f=>catBtn(f,'')).join('')}</div>
        <details style="margin-top:8px" ${cat && catKind(s,cat)!=='weekly' ? 'open':''}><summary style="font-size:13px;color:var(--muted);cursor:pointer">From a long-term fund or a bill…</summary>
          <div class="catgrid" style="margin-top:8px">${s.permFunds.map(f=>catBtn(f,'perm')).join('')}${s.bills.map(f=>catBtn(f,'bill')).join('')}</div>
          <div class="hint" style="margin-top:6px">Spending from a long-term fund lowers that fund’s balance. Bills logged here are marked paid for the month.</div>
        </details>
        <input type="hidden" id="f-cat" value="${esc(cat)}">
      </div>
      <div class="field"><label for="f-merchant">Where</label><input class="input" id="f-merchant" type="text" placeholder="Trader Joe’s, Shell, Netflix…" value="${esc(e.merchant||'')}" autocomplete="off">
        ${recentMerchants.length?`<div class="chips" style="margin-top:8px">${recentMerchants.map(m=>`<button type="button" class="chip" data-merchant="${esc(m)}">${esc(m)}</button>`).join('')}</div>`:''}</div>
      <div class="field"><label>Paid with</label><div class="chips" id="f-pay">${s.payMethods.map((m,i)=>`<button type="button" class="chip ${ (e.payment||s.payMethods[0])===m?'active':''}" data-pay="${esc(m)}">${esc(m)}</button>`).join('')}</div></div>
      <div class="grid2">
        <div class="field"><label for="f-date">Date</label><input class="input" id="f-date" type="date" value="${e.date||todayISO()}"></div>
        <div class="field"><label for="f-notes">Note</label><input class="input" id="f-notes" type="text" placeholder="Optional" value="${esc(e.notes||'')}"></div>
      </div>`;
    Sheet.open(`
      ${editing ? `<h2>Edit ${mode==='tips'?'income':'purchase'}</h2><p class="lead">${fmtDate(e.date)}</p>` : `<div class="seg"><button type="button" class="${mode==='tips'?'active':''}" onclick="Log.open('tips')">Income</button><button type="button" class="${mode==='purchase'?'active':''}" onclick="Log.open('purchase')">Purchase</button></div>`}
      <form id="logForm" onsubmit="event.preventDefault();Log.submit()">
        ${mode==='tips' ? tipsForm : purchaseForm}
        <div class="sheet-actions">
          ${editing ? `<button type="button" class="btn danger" onclick="Log.remove()">${ICON.trash} Delete</button>`:''}
          <button type="submit" class="btn ${mode==='tips'?'primary':'brass'}" id="logSubmit">${editing?'Save changes':(mode==='tips'?'Log income':'Log purchase')}</button>
        </div>
      </form>`, sheet => {
        const liveTotal = () => { const t = $('#f-type')?.value; if (!t) return; $('#f-total').textContent = fmt(t==='tips' ? (+$('#f-cash').value||0)+(+$('#f-card').value||0) : (+$('#f-income').value||0)); };
        sheet.addEventListener('input', ev => { if (['f-cash','f-card','f-income'].includes(ev.target.id)) liveTotal(); });
        sheet.addEventListener('change', ev => { if (ev.target.id==='f-type') { const tips = ev.target.value==='tips'; $('#f-tipsFields').hidden = !tips; $('#f-otherFields').hidden = tips; $('#f-totalLabel').textContent = tips ? 'Shift total' : 'Income'; $('#f-source').placeholder = ev.target.value==='wage' ? 'Employer' : 'Venmo, birthday…'; liveTotal(); (tips ? $('#f-cash') : $('#f-income')).focus(); } });
        sheet.addEventListener('click', ev => {
          const cb = ev.target.closest('[data-cat]'); if (cb) { $$('.cat',sheet).forEach(x=>x.classList.remove('active')); cb.classList.add('active'); $('#f-cat').value = cb.dataset.cat; if (!$('#f-amt').value) $('#f-amt').focus(); }
          const pb = ev.target.closest('[data-pay]'); if (pb) { $$('[data-pay]',sheet).forEach(x=>x.classList.remove('active')); pb.classList.add('active'); }
          const mb = ev.target.closest('[data-merchant]'); if (mb) { $('#f-merchant').value = mb.dataset.merchant; }
        });
        const first = mode==='tips' ? ($('#f-type').value==='tips' ? $('#f-cash') : $('#f-income')) : $('#f-amt'); if (first && !editing) setTimeout(()=>first.focus(), 80);
      });
  },
  edit(kind, id){
    const e = (kind==='tips' ? store.allTips() : store.allPurchases()).find(x=>x.id===id); if (!e) return;
    this.open(kind==='tips'?'tips':'purchase', {}, e);
  },
  async submit(){
    const btn = $('#logSubmit'); btn.disabled = true;
    try {
      const date = $('#f-date').value || todayISO(); const notes = $('#f-notes').value.trim();
      const ts = this.editing?.ts && this.editing.date===date ? this.editing.ts : (date===todayISO() ? new Date().toISOString().replace(/Z$/,'') : date+'T12:00:00');
      if (this.mode==='tips') {
        const type = $('#f-type').value;
        let entry;
        if (type==='tips') {
          const cash = round2($('#f-cash').value), card = round2($('#f-card').value);
          if (cash+card <= 0) { toast('Enter at least one tip amount'); btn.disabled=false; return; }
          entry = { id: this.editing?.id || uid(), type, date, ts, cash, card, total: round2(cash+card), notes };
        } else {
          const amount = round2($('#f-income').value);
          if (amount <= 0) { toast('Enter an amount'); btn.disabled=false; return; }
          entry = { id: this.editing?.id || uid(), type, date, ts, cash:0, card:0, total: amount, source: $('#f-source').value.trim(), notes };
        }
        if (this.editing) await store.updateEntry('tips', entry.id, entry); else await store.addEntry('tips', entry);
        Sheet.close(); toast(`Logged ${fmt(entry.total)} ${type==='tips'?'in tips':type==='wage'?'paycheck':'income'}`);
      } else {
        const amount = round2($('#f-amt').value); const category = $('#f-cat').value; const merchant = $('#f-merchant').value.trim();
        const payment = $('.chip.active[data-pay]')?.dataset.pay || '';
        if (amount <= 0) { toast('Enter an amount'); btn.disabled=false; return; }
        if (!category) { toast('Pick a category'); btn.disabled=false; return; }
        const s = store.settings; const kind = catKind(s, category);
        const entry = { id: this.editing?.id || uid(), date, ts, amount, category, merchant, payment, notes };
        // Adjust long-term fund balance when spending from it (and undo the previous amount when editing)
        if (this.editing) { await store.updateEntry('purchases', entry.id, entry); } else { await store.addEntry('purchases', entry); }
        const s2 = JSON.parse(JSON.stringify(s)); let touched = false;
        const prev = this.editing;
        if (prev && catKind(s2, prev.category)==='perm') { const f = s2.permFunds.find(x=>x.id===prev.category); if (f) { f.balance = round2(f.balance + (+prev.amount||0)); touched = true; } }
        if (kind==='perm') { const f = s2.permFunds.find(x=>x.id===category); if (f) { f.balance = round2(f.balance - amount); touched = true; } }
        if (kind==='bill') { const b = s2.bills.find(x=>x.id===category); if (b && b.paidMonth !== monthKey(date)) { b.paidMonth = monthKey(date); touched = true; } }
        if (touched) await store.saveSettings(s2);
        Sheet.close(); toast(`${merchant||'Purchase'} · ${fmt(amount)} logged`);
      }
    } catch(e){ btn.disabled = false; }
  },
  async remove(){
    const e = this.editing; if (!e) return;
    if (!confirm('Delete this entry?')) return;
    const kind = this.mode==='tips' ? 'tips' : 'purchases';
    await store.deleteEntry(kind, e.id);
    if (kind==='purchases' && catKind(store.settings, e.category)==='perm') { const s2 = JSON.parse(JSON.stringify(store.settings)); const f = s2.permFunds.find(x=>x.id===e.category); if (f) { f.balance = round2(f.balance + (+e.amount||0)); await store.saveSettings(s2); } }
    Sheet.close(); toast('Deleted');
  },
};

/* ── CLOSE WEEK ───────────────────────────── */
const Close = {
  open(){
    const { s, c } = App.ctx();
    const rows = (k, v, cls='') => `<div class="kv ${cls}"><span class="k">${k}</span><span class="v num">${v}</span></div>`;
    Sheet.open(`
      <h2>Close the week</h2>
      <p class="lead">Here’s how this week’s ${fmt(c.weeklyTips)} in income gets divided. Closing records it, updates your fund balances, and starts a fresh week.</p>
      <div class="card" style="padding:12px 14px">
        ${rows('Income this week', fmt(c.weeklyTips))}
        ${rows('Bills set aside', '− '+fmt(c.billsSet))}
        ${rows('Weekly funds filled', '− '+fmt(c.totalWeeklyBudget))}
        ${rows('Left over from tips', fmt(c.directRemainder))}
        ${rows('Unspent in weekly funds', '+ '+fmt(c.unspent))}
        ${rows('To long-term funds', fmt(c.toPerm), 'total')}
      </div>
      ${c.shortfall>0 ? `<div class="notice warn" style="margin-top:10px">${ICON.alert}<div><div class="t">Income came in ${fmt(c.shortfall)} short</div><div class="d">Not enough to cover bills set-aside plus weekly budgets. Only unspent fund money moves to savings this week.</div></div></div>`:''}
      ${c.overdraft.total>0 ? `<div class="notice crit" style="margin-top:10px">${ICON.alert}<div><div class="t">Overspent by ${fmt(c.overdraft.total)}</div><div class="d">${c.overdraft.draws.map(d=>`${fmt(d.amount)} comes out of ${d.name}`).join('; ')}${c.overdraft.uncovered>0?`; ${fmt(c.overdraft.uncovered)} still uncovered`:''}.</div></div></div>`:''}
      <div class="subhead">Fund transfers</div>
      <div class="card" style="padding:12px 14px">${c.transfers.map(t=>`<div class="kv"><span class="k">${esc(t.emoji)} ${esc(t.name)} <span class="pill muted">${esc(t.pct)}%</span></span><span class="v num">${fmt(t.total,{plus:true})}</span></div>`).join('')}</div>
      <div class="sheet-actions" style="margin-top:14px">
        <button class="btn ghost" onclick="Sheet.close()">Not yet</button>
        <button class="btn lilac" id="closeBtn" onclick="Close.confirm()" ${c.wTips.length===0 && c.wPur.length===0 ? 'disabled':''}>Close week</button>
      </div>
      ${c.wTips.length===0 && c.wPur.length===0 ? '<p class="hint" style="text-align:center;margin-top:10px">Nothing has been logged this week yet.</p>':''}`);
  },
  async confirm(){
    const btn = $('#closeBtn'); btn.disabled = true;
    const s = store.settings;
    const nowISO = new Date().toISOString().replace(/Z$/,'');
    const r = Model.closeWeek(s, store.state, store.allTips(), store.allPurchases(), nowISO);
    try {
      await store.write(`weeks/${r.record.id}`, r.record);
      await store.saveSettings(r.settings);
      await store.saveState(r.state);
    } catch(e){ btn.disabled=false; return; }
    this.result(r);
  },
  result(r){
    const c = r.computed;
    const acc = c.accounts.filter(a=>a.deposit>0 || a.parts.length);
    Sheet.open(`
      <h2>Week closed</h2>
      <p class="lead">${fmt(c.weeklyTips)} earned · ${fmt(c.weeklySpent)} spent · <b class="pos">${fmt(c.totalTransferred)}</b> to long-term funds. Now make these deposits and tick them off.</p>
      <div class="subhead">Transfer checklist</div>
      ${acc.map((a,i)=>`<div class="card" style="padding:12px 14px">
        <label class="checkrow" style="border:0;padding:0 0 8px"><input type="checkbox" id="chk-${i}"><div><b>${esc(a.institution)} · ${esc(a.name)}</b><div class="d">Deposit <b class="num" style="color:var(--text)">${fmt(a.deposit)}</b> · balance ${fmt(a.balance)} → ${fmt(a.after)}</div></div></label>
        ${a.splits.length?a.splits.map(x=>`<div class="kv"><span class="k">↳ ${esc(x.name)} (${esc(x.pct)}%)</span><span class="v num">${fmt(x.amount)}</span></div>`).join(''):''}
        ${a.parts.length>1?a.parts.map(p=>`<div class="kv"><span class="k">${esc(p.emoji)} ${esc(p.name)}</span><span class="v num">${fmt(p.total,{plus:true})}</span></div>`).join(''):''}
      </div>`).join('') || '<div class="empty">No deposits this week.</div>'}
      ${c.overdraft.draws.length?`<div class="notice crit" style="margin-top:10px">${ICON.alert}<div><div class="t">Overdraft covered</div><div class="d">${c.overdraft.draws.map(d=>`${fmt(d.amount)} deducted from ${d.name}`).join('; ')}. Move that money back into checking if it isn’t already there.</div></div></div>`:''}
      <div class="subhead">New balances</div>
      <div class="card" style="padding:12px 14px">${r.settings.permFunds.map(f=>`<div class="kv"><span class="k">${esc(f.emoji)} ${esc(f.name)}</span><span class="v num">${fmt(f.balance)}</span></div>`).join('')}</div>
      <div class="sheet-actions" style="margin-top:14px"><button class="btn primary block" onclick="Sheet.close();App.go('home')">Done</button></div>`);
  },
};

/* ── BILLS ────────────────────────────────── */
const Bills = {
  render(){
    const { s, c } = App.ctx(); if (!s) return;
    const mk = monthKey(todayISO()); const now = new Date();
    const bills = s.bills.map(b=>({...b, days:Model.billDays(b, now), paid:Model.billPaid(b, mk)})).sort((a,b)=> (a.paid-b.paid) || (a.days-b.days));
    const paidTotal = sum(bills.filter(b=>b.paid), b=>b.amount);
    const monthly = sum(s.bills, b=>b.amount);
    $('#view-bills').innerHTML = `
      <div class="tiles">
        <div class="tile"><div class="k">Monthly bills</div><div class="v num">${fmtK(monthly)}</div><div class="d">${s.bills.length} bills</div></div>
        <div class="tile"><div class="k">Set aside / week</div><div class="v num">${fmtK(c.billsSet)}</div><div class="d">${s.billsMethod==='annual'?'× 12 ÷ 52':'÷ 4 each week'}</div></div>
        <div class="tile"><div class="k">Paid in ${now.toLocaleDateString('en-US',{month:'short'})}</div><div class="v num">${fmtK(paidTotal)}</div><div class="d">${fmtK(monthly-paidTotal)} to go</div></div>
      </div>
      <div class="section">
        <div class="section-head"><h2>${now.toLocaleDateString('en-US',{month:'long'})}</h2><button class="link" style="background:none" onclick="App.go('settings');setTimeout(()=>document.getElementById('sec-bills')?.scrollIntoView({behavior:'smooth'}),50)">Edit bills</button></div>
        <div class="card list">${bills.length ? bills.map(b=>`<div class="item">
          <div><div class="t">${esc(b.emoji||'')} ${esc(b.name)} ${b.paid?'<span class="pill good">Paid</span>': b.days<0?'<span class="pill crit">Overdue</span>': b.days<=5?'<span class="pill warn">Due soon</span>':''}</div>
            <div class="s">Due the ${ordinal(b.dueDay||1)}${b.paid?'':' · '+dueWord(b.days)}</div></div>
          <div><div class="amt num">${fmt(b.amount)}</div><div class="row-actions">${b.paid
            ? `<button class="btn sm ghost" onclick="Bills.toggle('${b.id}',false)">Undo</button>`
            : `<button class="btn sm primary" onclick="Bills.toggle('${b.id}',true)">Mark paid</button>`}</div></div>
        </div>`).join('') : '<div class="empty"><b>No bills yet</b>Add your monthly bills in Settings and they’ll show up here with due dates.</div>'}</div>
        <p class="hint" style="margin-top:10px">Bills reset to unpaid at the start of each month. Marking one paid here doesn’t change a weekly fund — the money was already set aside from your tips.</p>
      </div>`;
  },
  async toggle(id, paid){
    const s2 = JSON.parse(JSON.stringify(store.settings)); const b = s2.bills.find(x=>x.id===id); if (!b) return;
    b.paidMonth = paid ? monthKey(todayISO()) : null; await store.saveSettings(s2); toast(paid ? `${b.name} marked paid` : `${b.name} marked unpaid`);
  },
};
