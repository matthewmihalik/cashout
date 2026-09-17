// Checks the budget math against the rules in the original Apps Script closeWeek().
const fs = require('fs');
const utilsSrc = fs.readFileSync(__dirname + '/../js/util.js', 'utf8');
const utils = utilsSrc.replace("'use strict';",'');
const model = fs.readFileSync(__dirname + '/../js/model.js', 'utf8');
global.document = { querySelector: () => ({ textContent:'', classList:{add(){},remove(){}} }), querySelectorAll: () => [] };
global.window = {}; global.APP_NAME='Cashout';
const { Model, DEFAULTS } = new Function(utils + model + '\nreturn { Model, DEFAULTS };')();

let fails = 0;
const eq = (a, b, msg) => { const ok = Math.abs(a - b) < 0.005; if (!ok) fails++; console.log((ok ? 'ok  ' : 'FAIL') + ' ' + msg + (ok ? '' : `  (got ${a}, want ${b})`)); };

const s = DEFAULTS();
// original-sheet-style config: pct as % of leftovers
[['roth',40],['travel',20],['emerg',15],['gen',15],['home',5],['health',5]].forEach(([id,p]) => s.permFunds.find(f=>f.id===id).pct = p);
s.permFunds.forEach(f => f.balance = 100);
s.weeklyFunds.forEach(f => f.budget = 0);
s.weeklyFunds.find(f=>f.id==='groc').budget = 80;
s.weeklyFunds.find(f=>f.id==='eat').budget = 40;
s.weeklyFunds.find(f=>f.id==='fun').budget = 30;   // total 150
s.bills.forEach(b => b.amount = 0);
s.bills.find(b=>b.id==='rent').amount = 1200; s.bills.find(b=>b.id==='phone').amount = 80;  // 1280/4 = 320
s.accounts.find(a=>a.id==='cfcu').balance = 500;
s.accounts.find(a=>a.id==='fid-roth').balance = 1000;

const state = { weekStart: '2026-09-07T00:00:00' };
const tips = [
  { id:'a', date:'2026-09-08', ts:'2026-09-08T23:00:00', cash:120, card:180, total:300 },
  { id:'b', date:'2026-09-10', ts:'2026-09-10T23:00:00', cash:100, card:200, total:300 },
  { id:'old', date:'2026-09-01', ts:'2026-09-01T23:00:00', cash:999, card:0, total:999 }, // previous week — must be ignored
];
const purchases = [
  { id:'p1', date:'2026-09-09', ts:'2026-09-09T12:00:00', category:'groc', amount:50 },
  { id:'p2', date:'2026-09-09', ts:'2026-09-09T13:00:00', category:'eat',  amount:55 },   // over by 15
  { id:'p3', date:'2026-09-11', ts:'2026-09-11T13:00:00', category:'fun',  amount:10 },
];

const c = Model.compute(s, state, tips, purchases);
// Original: weeklyTips=600; billsSet=320; totalWeeklyBudget=150; totalNeeded=470
eq(c.weeklyTips, 600, 'weekly tips ignore entries before weekStart');
eq(c.billsSet, 320, 'bills set aside = monthly ÷ 4');
eq(c.totalWeeklyBudget, 150, 'weekly budgets total');
eq(c.directRemainder, 130, 'direct remainder = tips − (bills + budgets)');
// leftovers: groc 30, eat max(0,40-55)=0, fun 20 → 50
eq(c.unspent, 50, 'unspent = Σ max(0, budget − spent)');
eq(c.toPerm, 180, 'to permanent funds = remainder + unspent');
eq(c.transfers.find(t=>t.id==='roth').total, 72, 'roth gets 40% of 180');
eq(c.totalTransferred, 180, 'total transferred');
// Overdraft 15 comes from General Savings first (balance 100 + 27 transfer = 127 ≥ 15)
eq(c.overdraft.total, 15, 'overdraft = Σ max(0, spent − budget)');
eq(c.overdraft.draws[0].amount, 15, 'overdraft drawn from General Savings');
eq(c.overdraft.uncovered, 0, 'nothing uncovered');
// account roll-ups: CFCU = emerg 27 + gen 27 + home 9 + health 9 = 72 ; roth deposit 72 with 80/20 split
const cfcu = c.accounts.find(a=>a.id==='cfcu'); const roth = c.accounts.find(a=>a.id==='fid-roth');
eq(cfcu.deposit, 72, 'CFCU deposit sums its four funds');
eq(roth.splits[0].amount, 57.6, 'Roth domestic 80%');
eq(roth.splits[1].amount, 14.4, 'Roth international 20%');

const r = Model.closeWeek(s, state, tips, purchases, '2026-09-13T21:00:00');
eq(r.settings.permFunds.find(f=>f.id==='roth').balance, 172, 'roth balance after close');
eq(r.settings.permFunds.find(f=>f.id==='gen').balance, 100 + 27 - 15, 'general savings after transfer and overdraft draw');
eq(r.settings.accounts.find(a=>a.id==='cfcu').balance, 572, 'CFCU expected balance after deposit');
eq(r.record.toPerm, 180, 'week record saved');
console.log(r.state.weekStart === '2026-09-13T21:00:00' ? 'ok   new week starts at close time' : 'FAIL weekStart');

// Shortfall case: tips 400 < needed 470 → direct remainder 0, only unspent moves
const c2 = Model.compute(s, state, tips.slice(0,1).map(t=>({...t,total:400})), purchases);
eq(c2.directRemainder, 0, 'shortfall: remainder is 0');
eq(c2.shortfall, 70, 'shortfall amount');
eq(c2.toPerm, 50, 'shortfall: only unspent goes to perm funds');

// Overdraft larger than General Savings: spills into Emergency
const s3 = JSON.parse(JSON.stringify(s)); s3.permFunds.find(f=>f.id==='gen').balance = 0;
const big = [{ id:'x', date:'2026-09-09', ts:'2026-09-09T12:00:00', category:'eat', amount:200 }]; // over by 160
const c3 = Model.compute(s3, state, tips, big);
// unspent = 80+30 = 110 ; remainder 130 ; toPerm 240 ; gen gets 36 (15%) → after 36 ; emerg 100+36 = 136
eq(c3.overdraft.total, 160, 'big overdraft');
eq(c3.overdraft.draws[0].amount, 36, 'take all of General Savings first');
eq(c3.overdraft.draws[1].amount, 124, 'rest from Emergency');
eq(c3.overdraft.uncovered, 0, 'covered');

// Bill due-day rule (original ±2 day rollover)
const d = new Date(2026, 8, 15);
eq(Model.billDays({dueDay:20}, d), 5, 'bill due in 5 days');
eq(Model.billDays({dueDay:14}, d), -1, 'bill overdue by 1 day still shows this month');
eq(Model.billDays({dueDay:10}, d), 25, 'bill 5 days past rolls to next month');

// ── Amount modes ─────────────────────────────────────────────
const s4 = JSON.parse(JSON.stringify(s));
s4.permFunds.find(f=>f.id==='travel').mode = 'fixed'; s4.permFunds.find(f=>f.id==='travel').amount = 50;   // $50 off the top
s4.permFunds.find(f=>f.id==='roth').pct = 60;                                                           // pct funds: roth 60, emerg 15, gen 15, home 5, health 5 = 100
s4.weeklyFunds.find(f=>f.id==='fun').mode = 'pct'; s4.weeklyFunds.find(f=>f.id==='fun').budget = 5;   // 5% of income = $30
s4.bills.find(b=>b.id==='util').amount = 20; s4.bills.find(b=>b.id==='util').period = 'week';           // +$20/week
s4.bills.find(b=>b.id==='ins').amount = 520; s4.bills.find(b=>b.id==='ins').period = 'year';            // +$10/week
const c4 = Model.compute(s4, state, tips, purchases);
eq(c4.billsSet, 350, 'bills: monthly ÷4 + weekly + yearly ÷52');
eq(c4.fixedTotal, 50, 'fixed fund deposit counted');
eq(c4.funds.find(f=>f.id==='fun').budget, 30, 'pct weekly fund = 5% of $600');
// needed = 350 + 50 + (80+40+30) = 550 → remainder 50 ; unspent: groc 30, eat 0, fun 20 = 50 ; toPerm 100
eq(c4.directRemainder, 50, 'remainder after fixed deposits');
eq(c4.toPerm, 100, 'toPerm with modes');
eq(c4.transfers.find(t=>t.id==='travel').total, 50, 'fixed fund gets its fixed amount');
eq(c4.transfers.find(t=>t.id==='roth').total, 60, 'roth gets 60% of the 100');
eq(c4.pctTotal, 100, 'pct total counts only pct funds');

// ── Linked (contribution) fund ───────────────────────────────
const s5 = JSON.parse(JSON.stringify(s));
s5.permFunds.push({ id:'joint', emoji:'🏠', name:'Joint', pct:0, mode:'fixed', amount:120, balance:0, account:'', linkTo:'LEDGER_J' });
const c5 = Model.compute(s5, state, tips, purchases);
eq(c5.contributions.length, 1, 'one contribution to post');
eq(c5.contributions[0].total, 120, 'contribution amount');
eq(c5.transfers.find(t=>t.id==='joint').after, 0, 'linked fund keeps no balance');
eq(c5.directRemainder, 130-120, 'fixed contribution reduces remainder');
const r5 = Model.closeWeek(s5, state, tips, purchases, '2026-09-13T21:00:00');
eq(r5.settings.permFunds.find(f=>f.id==='joint').balance, 0, 'linked fund balance untouched after close');
console.log(r5.record.contributions[0].linkTo === 'LEDGER_J' ? 'ok   week record lists the contribution' : 'FAIL record contributions');

console.log(fails ? `\n${fails} FAILED` : '\nall checks passed');
process.exit(fails ? 1 : 0);
