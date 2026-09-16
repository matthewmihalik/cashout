'use strict';
/* ── Utils ─────────────────────────────────── */
const $ = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const round2 = n => Math.round((+n || 0) * 100) / 100;
const fmt = (n, opts={}) => {
  const v = +n || 0;
  const abs = Math.abs(v).toLocaleString('en-US', {minimumFractionDigits: opts.cents===false?0:2, maximumFractionDigits: opts.cents===false?0:2});
  return (v < 0 ? '−$' : (opts.plus && v > 0 ? '+$' : '$')) + abs;
};
const fmtK = n => { const v=+n||0; return Math.abs(v)>=1000 ? (v<0?'−':'')+'$'+(Math.abs(v)/1000).toFixed(Math.abs(v)>=10000?0:1)+'k' : fmt(v,{cents:false}); };
const uid = () => Math.random().toString(36).slice(2,9) + Date.now().toString(36).slice(-3);
const pad = n => String(n).padStart(2,'0');
const todayISO = (d=new Date()) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const monthKey = iso => iso.slice(0,7);
const parseISO = iso => { const [y,m,d] = iso.split('-').map(Number); return new Date(y, m-1, d, 12); };
const fmtDate = (iso, o={weekday:'short', month:'short', day:'numeric'}) => parseISO(iso).toLocaleDateString('en-US', o);
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const ordinal = n => { const s=['th','st','nd','rd'], v=n%100; return n + (s[(v-20)%10]||s[v]||s[0]); };
const sum = (arr, f=x=>x) => arr.reduce((s,x)=>s+(+f(x)||0),0);
const toastEl = $('#toast'); let toastT;
function toast(msg){ toastEl.textContent = msg; toastEl.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(()=>toastEl.classList.remove('show'), 2600); }
const ICON = {
  check:'<svg viewBox="0 0 24 24"><path d="M5 12l5 5L20 7"/></svg>',
  bell:'<svg viewBox="0 0 24 24"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0"/></svg>',
  alert:'<svg viewBox="0 0 24 24"><path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>',
  cal:'<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>',
  trash:'<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>',
  plus:'<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  spark:'<svg viewBox="0 0 24 24"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/></svg>',
  sun:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
};

/* ── Defaults (seeded from the original sheet's structure; amounts are entered by the user) ── */
const DEFAULTS = () => ({
  version: 1,
  setupDone: false,
  billsMethod: 'quarter',       // 'quarter' = monthly bills ÷ 4 (original rule) | 'annual' = ×12 ÷ 52
  overdraftFrom: ['gen', 'emerg'],
  permFunds: [
    { id:'roth',   emoji:'🏦', name:'Roth IRA',         pct:0, balance:0, account:'fid-roth' },
    { id:'travel', emoji:'✈️', name:'Travel Fund',      pct:0, balance:0, account:'fid-travel' },
    { id:'emerg',  emoji:'🚨', name:'Emergency Fund',   pct:0, balance:0, account:'cfcu' },
    { id:'gen',    emoji:'💰', name:'General Savings',  pct:0, balance:0, account:'cfcu' },
    { id:'home',   emoji:'🔧', name:'Home / Repairs',   pct:0, balance:0, account:'cfcu' },
    { id:'health', emoji:'💊', name:'Health Reserve',   pct:0, balance:0, account:'cfcu' },
  ],
  weeklyFunds: [
    { id:'groc',  emoji:'🛒', name:'Groceries',       budget:0 },
    { id:'eat',   emoji:'🍔', name:'Eating Out',      budget:0 },
    { id:'fun',   emoji:'🎉', name:'Fun / Personal',  budget:0 },
    { id:'cloth', emoji:'👗', name:'Clothing',        budget:0 },
    { id:'pets',  emoji:'🐾', name:'Pets',            budget:0 },
    { id:'self',  emoji:'💆', name:'Self Care',       budget:0 },
    { id:'gift',  emoji:'🎁', name:'Gifts',           budget:0 },
    { id:'gas',   emoji:'🚗', name:'Gas / Transport', budget:0 },
    { id:'other', emoji:'📦', name:'Other',           budget:0 },
  ],
  bills: [
    { id:'car',   emoji:'🚗', name:'Car Payment',    amount:0, dueDay:1 },
    { id:'rent',  emoji:'🏠', name:'Rent / Housing', amount:0, dueDay:1 },
    { id:'phone', emoji:'📱', name:'Phone Bill',     amount:0, dueDay:15 },
    { id:'util',  emoji:'⚡', name:'Utilities',      amount:0, dueDay:20 },
    { id:'net',   emoji:'🌐', name:'Internet',       amount:0, dueDay:20 },
    { id:'ins',   emoji:'🛡️', name:'Insurance',      amount:0, dueDay:25 },
  ],
  accounts: [
    { id:'fid-roth',   name:'Roth IRA',    institution:'Fidelity', balance:0, earningsTo:'roth',   split:[{name:'Domestic',pct:80},{name:'International',pct:20}] },
    { id:'fid-travel', name:'Travel Fund', institution:'Fidelity', balance:0, earningsTo:'travel', split:[] },
    { id:'cfcu',       name:'Savings',     institution:'CFCU',     balance:0, earningsTo:'gen',    split:[] },
  ],
  payMethods: ['Debit', 'Credit', 'Cash', 'Apple Pay'],
  remindHour: 21,
  closeDay: 0, // Sunday
});

