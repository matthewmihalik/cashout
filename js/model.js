/* ── Model: pure functions (same rules as the original Apps Script) ── */
const Model = {
  /** Entries in the current open week: from state.weekStart (ISO datetime) to now. */
  inWeek(entries, state){
    const start = state.weekStart || '1970-01-01T00:00:00';
    return entries.filter(e => (e.ts || e.date+'T12:00:00') >= start);
  },
  weekStartDate(state){ return state.weekStart ? state.weekStart.slice(0,10) : null; },

  /** Weekly set-aside for one bill, by its period. Monthly uses the budget's method (÷4 or ×12÷52). */
  billWeekly(s, b){
    const a = +b.amount||0; const p = b.period || 'month';
    if (p === 'week') return a;
    if (p === 'year') return a/52;
    return s.billsMethod === 'annual' ? a*12/52 : a/4;
  },
  billsWeekly(s){ return sum(s.bills, b=>this.billWeekly(s, b)); },
  /** A bill's monthly equivalent (for the Bills tab totals). */
  billMonthly(b){ const a = +b.amount||0; const p = b.period || 'month'; return p==='week' ? a*52/12 : p==='year' ? a/12 : a; },

  /** Everything the home screen and the close-week screen need. */
  compute(s, state, tips, purchases){
    const wTips = this.inWeek(tips, state);
    const wPur  = this.inWeek(purchases, state);
    const weeklyTips = sum(wTips, t=>t.total);
    const spentByFund = {};
    wPur.forEach(p => { spentByFund[p.category] = (spentByFund[p.category]||0) + (+p.amount||0); });
    const weeklySpent = sum(wPur, p=>p.amount);
    const billsSet = this.billsWeekly(s);

    // Weekly funds: a fixed $ amount, or a % of this week's income
    const funds = s.weeklyFunds.map(f => {
      const budget = (f.mode === 'pct') ? weeklyTips * ((+f.budget||0)/100) : (+f.budget||0);
      const spent = spentByFund[f.id] || 0;
      return { ...f, budget, spent, remaining: budget - spent, leftover: Math.max(0, budget - spent), over: Math.max(0, spent - budget) };
    });
    const totalWeeklyBudget = sum(funds, f=>f.budget);
    const unspent = sum(funds, f=>f.leftover);
    const totalOverdraft = sum(funds, f=>f.over);

    // Long-term funds: fixed $ each week comes off the top (like a bill); % funds split what's left
    const fixedTotal = sum(s.permFunds.filter(f=>f.mode==='fixed'), f=>f.amount);
    const totalNeeded = billsSet + fixedTotal + totalWeeklyBudget;
    const directRemainder = Math.max(0, weeklyTips - totalNeeded);
    const shortfall = Math.max(0, totalNeeded - weeklyTips);
    const toPerm = directRemainder + unspent;

    const transfers = s.permFunds.map(f => {
      const fixed = f.mode === 'fixed';
      const pct = fixed ? 0 : (+f.pct||0)/100;
      const total = fixed ? (+f.amount||0) : toPerm*pct;
      const linked = !!f.linkTo;                       // contribution to another budget: passes through, no balance here
      return { ...f, fixed, pct, fromRemainder: fixed?0:directRemainder*pct, fromUnspent: fixed?0:unspent*pct, total, linked,
               after: linked ? (+f.balance||0) : (+f.balance||0) + total };
    });
    const totalTransferred = sum(transfers, t=>t.total);
    const contributions = transfers.filter(t=>t.linked && t.total>0);

    // Overdraft: cover overspend from configured funds in order (default General Savings → Emergency)
    const overdraft = { total: totalOverdraft, draws: [], uncovered: 0 };
    let remaining = totalOverdraft;
    for (const fid of (s.overdraftFrom||[])) {
      if (remaining <= 0) break;
      const t = transfers.find(x=>x.id===fid); if (!t || t.linked) continue;
      const take = Math.min(Math.max(0, t.after), remaining);
      if (take > 0) { overdraft.draws.push({ id:fid, name:t.name, emoji:t.emoji, amount:take }); t.after -= take; remaining -= take; }
    }
    overdraft.uncovered = remaining;

    // Account-level deposits (a fund maps to one real account)
    const accounts = s.accounts.map(a => {
      const parts = transfers.filter(t=>t.account===a.id && !t.linked);
      const deposit = sum(parts, p=>p.total);
      return { ...a, parts, deposit, after: (+a.balance||0) + deposit,
        splits: (a.split||[]).filter(x=>+x.pct>0).map(x=>({ ...x, amount: deposit * (+x.pct/100) })) };
    });

    const pctTotal = sum(s.permFunds.filter(f=>f.mode!=='fixed'), f=>f.pct);
    return { weeklyTips, weeklySpent, wTips, wPur, funds, billsSet, fixedTotal, totalWeeklyBudget, totalNeeded, unspent, directRemainder,
             shortfall, toPerm, transfers, totalTransferred, contributions, overdraft, accounts, pctTotal };
  },

  /** Bill due status relative to today. Returns daysUntil (negative = overdue) using the original ±2-day rollover rule. */
  billDays(bill, today=new Date()){
    const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const day = Math.min(+bill.dueDay||1, 28);
    let due = new Date(t.getFullYear(), t.getMonth(), day);
    let diff = Math.round((due - t)/86400000);
    if (diff < -2) { due = new Date(t.getFullYear(), t.getMonth()+1, day); diff = Math.round((due - t)/86400000); }
    return diff;
  },
  billPaid(bill, mk=monthKey(todayISO())){ return bill.paidMonth === mk; },

  /** Apply a closed week: returns {settings, state, weekRecord}. Pure. */
  closeWeek(s, state, tips, purchases, nowISO){
    const c = this.compute(s, state, tips, purchases);
    const settings = JSON.parse(JSON.stringify(s));
    settings.permFunds.forEach(f => {
      const t = c.transfers.find(x=>x.id===f.id);
      f.balance = round2(t ? t.after : f.balance);   // includes transfer and any overdraft draw
    });
    // Account balances become the expected balance once you make the deposit; the monthly
    // check-in compares your real balance against this, so "earned" is true interest/returns.
    settings.accounts.forEach(a => {
      const x = c.accounts.find(y=>y.id===a.id);
      if (x) a.balance = round2(x.after);
    });
    const record = {
      id: nowISO.slice(0,10).replace(/-/g,'') + '-' + nowISO.slice(11,16).replace(':',''),
      closedAt: nowISO, weekStart: state.weekStart || null,
      tips: round2(c.weeklyTips), spent: round2(c.weeklySpent), billsSet: round2(c.billsSet), weeklyBudget: round2(c.totalWeeklyBudget),
      unspent: round2(c.unspent), directRemainder: round2(c.directRemainder), toPerm: round2(c.totalTransferred), shortfall: round2(c.shortfall),
      overdraft: round2(c.overdraft.total), overdraftDraws: c.overdraft.draws.map(d=>({id:d.id, amount:round2(d.amount)})), uncovered: round2(c.overdraft.uncovered),
      transfers: c.transfers.map(t=>({ id:t.id, name:t.name, emoji:t.emoji, amount:round2(t.total), fixed:!!t.fixed, linkTo:t.linkTo||null })),
      contributions: c.contributions.map(t=>({ id:t.id, name:t.name, emoji:t.emoji, amount:round2(t.total), linkTo:t.linkTo })),
      balances: settings.permFunds.map(f=>({ id:f.id, balance:f.balance })),
      funds: c.funds.map(f=>({ id:f.id, name:f.name, budget:round2(f.budget), spent:round2(f.spent) })),
      accounts: c.accounts.map(a=>({ id:a.id, name:a.name, institution:a.institution, deposit:round2(a.deposit), before:round2(a.balance), after:round2(a.after),
                                     splits:a.splits.map(x=>({name:x.name, pct:x.pct, amount:round2(x.amount)})) })),
      shifts: c.wTips.length, tipsOnly: round2(sum(c.wTips.filter(t=>(t.type||'tips')==='tips'), t=>t.total)),
    };
    const newState = { ...state, weekStart: nowISO, lastClosed: nowISO, weekCount: (state.weekCount||0)+1 };
    return { settings, state: newState, record, computed: c };
  },
};
