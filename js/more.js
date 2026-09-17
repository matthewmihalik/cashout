/* ── INSIGHTS ─────────────────────────────── */
const Insights = {
  range: 'month',
  render(){
    const { s, c } = App.ctx(); if (!s) return;
    const income = store.allTips(); const tips = income.filter(t=>(t.type||'tips')==='tips'); const purchases = store.allPurchases(); const weeks = store.weeks();
    const mk = monthKey(todayISO());
    const mTips = income.filter(t=>monthKey(t.date)===mk); const mShifts = mTips.filter(t=>(t.type||'tips')==='tips'); const mPur = purchases.filter(p=>monthKey(p.date)===mk);
    const avgShift = tips.length ? sum(tips,t=>t.total)/tips.length : 0;
    // by day of week (avg per shift)
    const byDow = DOW.map((d,i)=>{ const xs = tips.filter(t=>parseISO(t.date).getDay()===i); return { d, n: xs.length, avg: xs.length? sum(xs,t=>t.total)/xs.length : 0 }; });
    const best = byDow.filter(x=>x.n).sort((a,b)=>b.avg-a.avg)[0];
    // last 12 weeks series
    const series = weeks.slice(-11).map(w=>({ label: fmtDate(w.closedAt.slice(0,10),{month:'numeric',day:'numeric'}), v:w.tips, spent:w.spent, saved:w.toPerm }));
    series.push({ label:'now', v:c.weeklyTips, spent:c.weeklySpent, saved:c.toPerm, open:true });
    // spending by category
    const pool = this.range==='week' ? c.wPur : this.range==='month' ? mPur : purchases;
    const byCat = {}; pool.forEach(p=>{ byCat[p.category]=(byCat[p.category]||0)+(+p.amount||0); });
    const cats = Object.entries(byCat).sort((a,b)=>b[1]-a[1]); const catMax = cats[0]?.[1]||1; const catTotal = sum(cats,x=>x[1]);
    // savings growth
    const growth = weeks.map(w=>({ label:w.closedAt.slice(0,10), v: sum(w.balances, b=>b.balance) }));
    // months table
    const months = {}; income.forEach(t=>{ const k=monthKey(t.date); months[k]=months[k]||{tips:0,spent:0,shifts:0}; months[k].tips+=t.total; months[k].shifts++; });
    purchases.forEach(p=>{ const k=monthKey(p.date); months[k]=months[k]||{tips:0,spent:0,shifts:0}; months[k].spent+=+p.amount||0; });
    const monthRows = Object.entries(months).sort((a,b)=>a[0]<b[0]?1:-1);
    const acctHist = (store.data.acct?.entries||[]).slice().reverse();

    $('#view-insights').innerHTML = `
      <div class="tiles">
        <div class="tile"><div class="k">Income this month</div><div class="v num pos">${fmtK(sum(mTips,t=>t.total))}</div><div class="d">${fmtK(sum(mShifts,t=>t.total))} tips · ${mShifts.length} shift${mShifts.length===1?'':'s'}</div></div>
        <div class="tile"><div class="k">Avg per shift</div><div class="v num">${fmtK(avgShift)}</div><div class="d">all time · ${tips.length} shifts</div></div>
        <div class="tile"><div class="k">Best night</div><div class="v">${best?best.d:'—'}</div><div class="d">${best?fmt(best.avg,{cents:false})+' avg':'log a few shifts'}</div></div>
      </div>

      <div class="section"><div class="card">
        <div class="chart-title"><h3>Weekly income</h3><span>last ${series.length} week${series.length===1?'':'s'} · striped = in progress</span></div>
        ${Charts.bars(series, { color:'var(--pink)', fmt:v=>fmt(v,{cents:false}) })}
      </div></div>

      <div class="section"><div class="card">
        <div class="chart-title"><h3>Average tips by night</h3><span>per shift worked</span></div>
        ${tips.length ? Charts.bars(byDow.map(x=>({label:x.d, v:x.avg, sub:x.n+' shift'+(x.n===1?'':'s')})), { color:'var(--pink)', fmt:v=>fmt(v,{cents:false}), showZero:true }) : '<div class="empty">Log shifts to see which nights pay best.</div>'}
      </div></div>

      <div class="section"><div class="card">
        <div class="chart-title"><h3>Spending by category</h3>
          <div class="chips" style="gap:4px">${['week','month','all'].map(r=>`<button class="chip ${this.range===r?'brass active':''}" style="padding:4px 9px;font-size:12px" onclick="Insights.range='${r}';Insights.render()">${r==='week'?'This week':r==='month'?'This month':'All'}</button>`).join('')}</div></div>
        ${cats.length ? cats.map(([id,v])=>`<div class="hbar"><span class="n">${esc(catLabel(s,id))}</span><div class="tr"><span style="width:${(v/catMax*100).toFixed(1)}%"></span></div><span class="v num">${fmt(v,{cents:false})}</span></div>`).join('')
          + `<div class="kv total" style="margin-top:6px"><span class="k">Total</span><span class="v num">${fmt(catTotal)}</span></div>` : '<div class="empty">No purchases in this range.</div>'}
      </div></div>

      <div class="section"><div class="card">
        <div class="chart-title"><h3>Long-term savings</h3><span>total across funds at each close</span></div>
        ${growth.length>=2 ? Charts.line(growth, { color:'var(--lilac)', fmt:v=>fmt(v,{cents:false}) }) : `<div class="empty"><b>${fmt(sum(s.permFunds,f=>f.balance))} saved so far</b>Growth appears after two closed weeks.</div>`}
      </div></div>

      <div class="section">
        <div class="section-head"><h2>By month</h2></div>
        <div class="card list">${monthRows.length ? monthRows.map(([k,m])=>`<div class="item"><div><div class="t">${parseISO(k+'-01').toLocaleDateString('en-US',{month:'long',year:'numeric'})}</div><div class="s">${m.shifts} entries · spent ${fmt(m.spent,{cents:false})}</div></div><div><div class="amt num pos">${fmt(m.tips,{cents:false})}</div><div class="s num" style="text-align:right">net ${fmt(m.tips-m.spent,{cents:false})}</div></div></div>`).join('') : '<div class="empty">Months fill in as you log.</div>'}</div>
      </div>

      ${acctHist.length?`<div class="section"><div class="section-head"><h2>Account check-ins</h2></div>
        <div class="card list">${acctHist.map(e=>`<div class="item"><div><div class="t">${parseISO(e.month+'-01').toLocaleDateString('en-US',{month:'long',year:'numeric'})}</div><div class="s">${e.accounts.map(a=>`${esc(a.name)} ${fmt(a.earned,{plus:true,cents:false})}`).join(' · ')}</div></div><div class="amt num ${e.total>=0?'pos':'neg'}">${fmt(e.total,{plus:true})}</div></div>`).join('')}</div></div>`:''}

      <div class="section">
        <div class="section-head"><h2>Closed weeks</h2></div>
        <div class="card list">${weeks.length ? weeks.slice().reverse().slice(0,12).map(w=>`<div class="item"><div><div class="t">Week ending ${fmtDate(w.closedAt.slice(0,10))}</div><div class="s">${w.shifts} shifts · spent ${fmt(w.spent,{cents:false})}${w.overdraft>0?` · <span class="neg">overdraft ${fmt(w.overdraft,{cents:false})}</span>`:''}</div></div><div><div class="amt num pos">${fmt(w.tips,{cents:false})}</div><div class="s num" style="text-align:right;color:var(--lilac)">saved ${fmt(w.toPerm,{cents:false})}</div></div></div>`).join('') : '<div class="empty">Your first closed week will appear here.</div>'}</div>
      </div>`;
    Charts.bindTips($('#view-insights'));
  },
};

/* ── Charts (inline SVG) ──────────────────── */
const Charts = {
  bars(data, o={}){
    const W=520, H=190, padL=44, padR=8, padT=14, padB=28;
    const max = Math.max(1, ...data.map(d=>d.v)) * 1.12;
    const iw = (W-padL-padR)/data.length; const bw = Math.min(40, iw*0.62);
    const y = v => padT + (H-padT-padB) * (1 - v/max);
    const ticks = this.ticks(max, 4);
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Bar chart">
      <defs><pattern id="stripe" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="${o.color}" opacity=".35"/><rect width="3" height="6" fill="${o.color}"/></pattern></defs>
      <g class="grid">${ticks.map(t=>`<line x1="${padL}" x2="${W-padR}" y1="${y(t)}" y2="${y(t)}"/><text class="mono" x="${padL-6}" y="${y(t)+3.5}" text-anchor="end">${o.fmt?fmtK(t):t}</text>`).join('')}</g>
      <line class="axis" x1="${padL}" x2="${W-padR}" y1="${y(0)}" y2="${y(0)}"/>
      ${data.map((d,i)=>{ const x = padL + iw*i + (iw-bw)/2; const h = Math.max(d.v>0?3:0, y(0)-y(d.v));
        return `<g class="hit" data-tip="${esc(d.label)} · ${esc(o.fmt?o.fmt(d.v):d.v)}${d.sub?' · '+esc(d.sub):''}${d.spent!=null?' · spent '+fmt(d.spent,{cents:false}):''}">
          <rect x="${padL+iw*i}" y="${padT}" width="${iw}" height="${H-padT-padB}" fill="transparent"/>
          <rect x="${x}" y="${y(0)-h}" width="${bw}" height="${h}" rx="3" fill="${d.open?'url(#stripe)':o.color}"/>
          ${(i===data.length-1 || d.v===Math.max(...data.map(z=>z.v))) && d.v>0 ? `<text class="val mono" x="${x+bw/2}" y="${y(d.v)-5}" text-anchor="middle">${fmtK(d.v)}</text>`:''}
          <text class="lbl" x="${x+bw/2}" y="${H-8}" text-anchor="middle">${esc(d.label)}</text></g>`; }).join('')}
    </svg>`;
  },
  line(data, o={}){
    const W=520, H=190, padL=48, padR=14, padT=16, padB=28;
    const vals = data.map(d=>d.v); const lo = Math.min(...vals), hi = Math.max(...vals);
    const span = Math.max(hi - lo, hi*0.1, 1); const min = Math.max(0, lo - span*0.35); const max = hi + span*0.25;
    const x = i => padL + (W-padL-padR) * (data.length===1?0.5:i/(data.length-1));
    const y = v => padT + (H-padT-padB) * (1 - (v-min)/(max-min));
    const ticks = this.ticks(max, 5).filter(t=>t>=min);
    const path = data.map((d,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${y(d.v).toFixed(1)}`).join(' ');
    const area = path + ` L${x(data.length-1).toFixed(1)},${y(min)} L${x(0).toFixed(1)},${y(min)} Z`;
    const step = Math.ceil(data.length/6);
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Line chart">
      <defs><linearGradient id="lg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${o.color}" stop-opacity=".35"/><stop offset="1" stop-color="${o.color}" stop-opacity="0"/></linearGradient></defs>
      <g class="grid">${ticks.map(t=>`<line x1="${padL}" x2="${W-padR}" y1="${y(t)}" y2="${y(t)}"/><text class="mono" x="${padL-6}" y="${y(t)+3.5}" text-anchor="end">${fmtK(t)}</text>`).join('')}</g>
      <path d="${area}" fill="url(#lg)"/><path d="${path}" fill="none" stroke="${o.color}" stroke-width="2" stroke-linejoin="round"/>
      ${data.map((d,i)=>`<g class="hit" data-tip="${fmtDate(d.label)} · ${esc(o.fmt?o.fmt(d.v):d.v)}"><rect x="${x(i)-(W-padL-padR)/data.length/2}" y="${padT}" width="${(W-padL-padR)/data.length}" height="${H-padT-padB}" fill="transparent"/>
        <circle cx="${x(i)}" cy="${y(d.v)}" r="${i===data.length-1?5:3.5}" fill="${o.color}" stroke="var(--surface)" stroke-width="2"/>
        ${i%step===0||i===data.length-1?`<text class="lbl" x="${x(i)}" y="${H-8}" text-anchor="${i===data.length-1?'end':i===0?'start':'middle'}">${fmtDate(d.label,{month:'numeric',day:'numeric'})}</text>`:''}</g>`).join('')}
      <text class="val mono" x="${x(data.length-1)}" y="${y(data[data.length-1].v)-10}" text-anchor="end">${fmtK(data[data.length-1].v)}</text>
    </svg>`;
  },
  ticks(max, n){ const raw = max/n; const mag = Math.pow(10, Math.floor(Math.log10(raw))); const nice = [1,2,2.5,5,10].map(m=>m*mag).find(m=>m>=raw)||mag; const out=[]; for (let v=0; v<=max; v+=nice) out.push(v); return out; },
  bindTips(root){
    const tip = $('#tip');
    root.onpointermove = e => { const h = e.target.closest('.hit'); if (!h) { tip.classList.remove('show'); return; } tip.textContent = h.dataset.tip; tip.classList.add('show');
      const r = tip.getBoundingClientRect(); tip.style.left = Math.min(window.innerWidth - r.width - 8, Math.max(8, e.clientX - r.width/2)) + 'px'; tip.style.top = (e.clientY - r.height - 14) + 'px'; };
    root.onpointerleave = () => tip.classList.remove('show');
  },
};

/* ── SETTINGS (editor shared with Setup) ───── */
const Editors = {
  get(d, path){ return path.split('.').reduce((o,k)=>o?.[k], d); },
  set(d, path, v){ const ks = path.split('.'); const last = ks.pop(); const o = ks.reduce((o,k)=>o[k], d); o[last] = v; },
  del(){ return `<button type="button" class="del" title="Remove">${ICON.trash}</button>`; },
  permFunds(d){
    const pctFunds = d.permFunds.filter(f=>f.mode!=='fixed'); const pct = sum(pctFunds, f=>f.pct);
    const others = (store.ledgers||[]).filter(l=>l.id!==store.ledgerId);
    const dest = f => `<select class="input" data-bind="permFunds.${d.permFunds.indexOf(f)}.dest" aria-label="Where it goes">
        <option value="">Where it goes…</option>
        <optgroup label="Real accounts">${d.accounts.map(a=>`<option value="acct:${a.id}" ${!f.linkTo&&f.account===a.id?'selected':''}>${esc(a.institution)} ${esc(a.name)}</option>`).join('')}</optgroup>
        ${others.length?`<optgroup label="Another budget (contribution)">${others.map(l=>`<option value="link:${l.id}" ${f.linkTo===l.id?'selected':''}>→ ${esc(l.name)}</option>`).join('')}</optgroup>`:''}
      </select>`;
    return `<div class="card" id="sec-perm">
      ${d.permFunds.map((f,i)=>`<div class="edit-row" data-list="permFunds" data-i="${i}">
        <input class="input emoji" data-bind="permFunds.${i}.emoji" value="${esc(f.emoji)}" aria-label="Icon" maxlength="4">
        <div class="cols"><input class="input" data-bind="permFunds.${i}.name" value="${esc(f.name)}" placeholder="Fund name" aria-label="Fund name">
          <div class="cols two">
            ${f.mode==='fixed'
              ? `<div class="money"><input class="input num" type="number" step="0.01" min="0" data-bind="permFunds.${i}.amount" value="${f.amount||0}" placeholder="Amount" aria-label="Amount each week" style="padding-left:28px"></div>`
              : `<div style="position:relative"><input class="input num" type="number" step="1" min="0" max="100" data-bind="permFunds.${i}.pct" value="${f.pct}" placeholder="%" aria-label="Percent of leftovers" style="padding-right:24px"><span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);color:var(--muted);font-size:13px">%</span></div>`}
            <select class="input" data-bind="permFunds.${i}.mode" aria-label="How it's measured"><option value="pct" ${f.mode!=='fixed'?'selected':''}>of leftovers</option><option value="fixed" ${f.mode==='fixed'?'selected':''}>each week</option></select>
          </div>
          ${f.linkTo ? `${dest(f)}<div class="hint">Posts to that budget as income when you close your week.</div>`
                     : `<div class="cols two">${dest(f)}<div class="money"><input class="input num" type="number" step="0.01" data-bind="permFunds.${i}.balance" value="${f.balance}" placeholder="Balance" aria-label="Balance" style="padding-left:28px"></div></div>`}
          </div>
        ${this.del()}</div>`).join('')}
      <div class="pct-sum ${Math.abs(pct-100)<0.01||!pctFunds.length?'ok':'bad'}" id="pctSum">${!pctFunds.length ? 'No percentage funds — leftovers will have nowhere to go.' : Math.abs(pct-100)<0.01 ? 'Percentages total 100% ✓' : `Percentages total ${round2(pct)}% — they need to add up to 100%`}</div>
      <button type="button" class="btn sm ghost" style="margin-top:10px" data-add="permFunds">${ICON.plus} Add fund</button>
    </div>`;
  },
  weeklyFunds(d){
    return `<div class="card" id="sec-weekly">
      ${d.weeklyFunds.map((f,i)=>`<div class="edit-row" data-list="weeklyFunds" data-i="${i}">
        <input class="input emoji" data-bind="weeklyFunds.${i}.emoji" value="${esc(f.emoji)}" aria-label="Icon" maxlength="4">
        <div class="cols"><input class="input" data-bind="weeklyFunds.${i}.name" value="${esc(f.name)}" placeholder="Fund" aria-label="Fund name">
          <div class="cols two">
            ${f.mode==='pct'
              ? `<div style="position:relative"><input class="input num" type="number" step="1" min="0" max="100" data-bind="weeklyFunds.${i}.budget" value="${f.budget}" placeholder="%" aria-label="Percent of income" style="padding-right:24px"><span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);color:var(--muted);font-size:13px">%</span></div>`
              : `<div class="money"><input class="input num" type="number" step="1" min="0" data-bind="weeklyFunds.${i}.budget" value="${f.budget}" placeholder="per week" aria-label="Weekly budget" style="padding-left:28px"></div>`}
            <select class="input" data-bind="weeklyFunds.${i}.mode" aria-label="How it's measured"><option value="fixed" ${f.mode!=='pct'?'selected':''}>$ per week</option><option value="pct" ${f.mode==='pct'?'selected':''}>% of income</option></select>
          </div></div>
        ${this.del()}</div>`).join('')}
      <div class="pct-sum">Fixed budgets total <b class="num" id="weeklySum">${fmt(sum(d.weeklyFunds.filter(f=>f.mode!=='pct'),f=>f.budget))}</b>${d.weeklyFunds.some(f=>f.mode==='pct')?` + ${round2(sum(d.weeklyFunds.filter(f=>f.mode==='pct'),f=>f.budget))}% of income`:''} per week</div>
      <button type="button" class="btn sm ghost" style="margin-top:10px" data-add="weeklyFunds">${ICON.plus} Add weekly fund</button>
    </div>`;
  },
  bills(d){
    return `<div class="card" id="sec-bills">
      ${d.bills.map((b,i)=>`<div class="edit-row" data-list="bills" data-i="${i}">
        <input class="input emoji" data-bind="bills.${i}.emoji" value="${esc(b.emoji||'')}" aria-label="Icon" maxlength="4">
        <div class="cols"><input class="input" data-bind="bills.${i}.name" value="${esc(b.name)}" placeholder="Bill" aria-label="Bill name">
          <div class="cols ${(b.period||'month')==='month'?'three':'two'}"><div class="money"><input class="input num" type="number" step="0.01" data-bind="bills.${i}.amount" value="${b.amount}" placeholder="Amount" aria-label="Amount" style="padding-left:28px"></div>
          <select class="input" data-bind="bills.${i}.period" aria-label="How often"><option value="month" ${(b.period||'month')==='month'?'selected':''}>per month</option><option value="week" ${b.period==='week'?'selected':''}>per week</option><option value="year" ${b.period==='year'?'selected':''}>per year</option></select>
          ${(b.period||'month')==='month' ? `<select class="input" data-bind="bills.${i}.dueDay" aria-label="Due day">${Array.from({length:28},(_,k)=>k+1).map(dd=>`<option value="${dd}" ${+b.dueDay===dd?'selected':''}>Due ${ordinal(dd)}</option>`).join('')}</select>` : ''}</div></div>
        ${this.del()}</div>`).join('')}
      <div class="pct-sum">About <b class="num" id="billsSum">${fmt(sum(d.bills,b=>Model.billMonthly(b)))}</b> a month · set aside <b class="num" id="billsWeekly">${fmt(Model.billsWeekly(d))}</b> per week</div>
      <button type="button" class="btn sm ghost" style="margin-top:10px" data-add="bills">${ICON.plus} Add bill</button>
    </div>`;
  },
  accounts(d){
    return `<div class="card" id="sec-accounts">
      ${d.accounts.map((a,i)=>`<div class="edit-row" data-list="accounts" data-i="${i}" style="grid-template-columns:1fr auto">
        <div class="cols">
          <div class="cols two"><input class="input" data-bind="accounts.${i}.institution" value="${esc(a.institution)}" placeholder="Bank" aria-label="Institution"><input class="input" data-bind="accounts.${i}.name" value="${esc(a.name)}" placeholder="Account" aria-label="Account name"></div>
          <div class="cols two"><div class="money"><input class="input num" type="number" step="0.01" data-bind="accounts.${i}.balance" value="${a.balance}" placeholder="Balance" aria-label="Current balance" style="padding-left:28px"></div>
            <select class="input" data-bind="accounts.${i}.earningsTo" aria-label="Interest goes to"><option value="">Interest → (none)</option>${d.permFunds.map(f=>`<option value="${f.id}" ${a.earningsTo===f.id?'selected':''}>Interest → ${esc(f.name)}</option>`).join('')}</select></div>
          <div class="hint">Deposit split (optional) — how each deposit is divided inside this account</div>
          ${(a.split||[]).map((x,j)=>`<div class="cols two" style="grid-template-columns:1fr 90px"><input class="input" data-bind="accounts.${i}.split.${j}.name" value="${esc(x.name)}" placeholder="e.g. Domestic" aria-label="Split name"><div style="position:relative"><input class="input num" type="number" data-bind="accounts.${i}.split.${j}.pct" value="${x.pct}" aria-label="Split percent" style="padding-right:24px"><span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);color:var(--muted);font-size:13px">%</span></div></div>`).join('')}
          <button type="button" class="btn sm ghost" data-addsplit="${i}" style="justify-self:start">${ICON.plus} Split</button>
        </div>
        ${this.del()}</div>`).join('')}
      <button type="button" class="btn sm ghost" style="margin-top:10px" data-add="accounts">${ICON.plus} Add account</button>
    </div>`;
  },
  rules(d){
    const fundOpts = (sel) => `<option value="">— none —</option>` + d.permFunds.map(f=>`<option value="${f.id}" ${sel===f.id?'selected':''}>${esc(f.emoji)} ${esc(f.name)}</option>`).join('');
    return `<div class="card" id="sec-rules">
      <div class="field"><label>Bills set-aside each week</label><select class="input" data-bind="billsMethod"><option value="quarter" ${d.billsMethod!=='annual'?'selected':''}>Monthly bills ÷ 4 (original rule)</option><option value="annual" ${d.billsMethod==='annual'?'selected':''}>Monthly bills × 12 ÷ 52 (exact)</option></select></div>
      <div class="field"><label>When weekly funds go over budget, cover it from</label>
        <div class="grid2"><select class="input" data-bind="overdraftFrom.0">${fundOpts(d.overdraftFrom?.[0])}</select><select class="input" data-bind="overdraftFrom.1">${fundOpts(d.overdraftFrom?.[1])}</select></div>
        <div class="hint">First fund first, then the second if it runs out.</div></div>
      <div class="grid2">
        <div class="field"><label>Close-week day</label><select class="input" data-bind="closeDay">${DOW.map((x,i)=>`<option value="${i}" ${(d.closeDay??0)===i?'selected':''}>${x}</option>`).join('')}</select></div>
        <div class="field"><label>Daily log reminder</label><select class="input" data-bind="remindHour">${Array.from({length:24},(_,h)=>`<option value="${h}" ${(d.remindHour??21)===h?'selected':''}>${h%12||12}${h<12?'am':'pm'}</option>`).join('')}</select></div>
      </div>
      <label class="checkrow" style="border:0;padding:4px 0 14px"><input type="checkbox" data-bind="remindEnabled" ${d.remindEnabled!==false?'checked':''}><div>Daily shift reminder<div class="d">Turn off for a shared or joint budget that isn’t fed by shifts.</div></div></label>
      <div class="field" style="margin:0"><label>Payment methods</label><input class="input" data-bind="payMethods" value="${esc((d.payMethods||[]).join(', '))}" placeholder="Debit, Credit, Cash"><div class="hint">Comma-separated.</div></div>
    </div>`;
  },
  /** Wire a container so inputs edit `d` in place; calls onChange after each edit. */
  wire(root, d, onChange){
    root.oninput = ev => {
      const b = ev.target.dataset.bind; if (!b) return;
      let v = ev.target.value;
      if (ev.target.type==='number') v = v==='' ? 0 : +v;
      if (ev.target.type==='checkbox') v = ev.target.checked;
      if (b==='payMethods') v = v.split(',').map(x=>x.trim()).filter(Boolean);
      if (b==='closeDay' || b==='remindHour' || b.endsWith('.dueDay')) v = +v;
      if (b.startsWith('overdraftFrom')) { d.overdraftFrom = d.overdraftFrom||[]; }
      if (b.endsWith('.dest')) {                       // destination dropdown: real account or another budget
        const f = this.get(d, b.replace(/\.dest$/,''));
        if (String(v).startsWith('link:')) { f.linkTo = v.slice(5); f.account = ''; } else { f.linkTo = ''; f.account = String(v).replace(/^acct:/,''); }
        onChange(true); return;
      }
      this.set(d, b, v);
      if (b.endsWith('.mode') || b.endsWith('.period')) { onChange(true); return; }   // changes which inputs are shown
      // live sums (no re-render, so focus is kept)
      const pctEl = $('#pctSum', root); if (pctEl) { const p = sum(d.permFunds.filter(f=>f.mode!=='fixed'),f=>f.pct); pctEl.className = 'pct-sum ' + (Math.abs(p-100)<0.01?'ok':'bad'); pctEl.textContent = Math.abs(p-100)<0.01 ? 'Percentages total 100% ✓' : `Percentages total ${round2(p)}% — they need to add up to 100%`; }
      const ws = $('#weeklySum', root); if (ws) ws.textContent = fmt(sum(d.weeklyFunds.filter(f=>f.mode!=='pct'),f=>f.budget));
      const bs = $('#billsSum', root); if (bs) { bs.textContent = fmt(sum(d.bills,b=>Model.billMonthly(b))); $('#billsWeekly',root).textContent = fmt(Model.billsWeekly(d)); }
      onChange(false);
    };
    root.onclick = ev => {
      const add = ev.target.closest('[data-add]'); const del = ev.target.closest('.del'); const sp = ev.target.closest('[data-addsplit]');
      if (add) { const k = add.dataset.add; const id = uid();
        if (k==='permFunds') d.permFunds.push({id, emoji:'💎', name:'', pct:0, mode:'pct', amount:0, balance:0, account:'', linkTo:''});
        if (k==='weeklyFunds') d.weeklyFunds.push({id, emoji:'🧺', name:'', budget:0, mode:'fixed'});
        if (k==='bills') d.bills.push({id, emoji:'🧾', name:'', amount:0, period:'month', dueDay:1});
        if (k==='accounts') d.accounts.push({id, name:'', institution:'', balance:0, earningsTo:'', split:[]});
        onChange(true); }
      else if (sp) { const a = d.accounts[+sp.dataset.addsplit]; a.split = a.split||[]; a.split.push({name:'', pct:0}); onChange(true); }
      else if (del) { const row = del.closest('.edit-row'); const list = row.dataset.list; const i = +row.dataset.i; const item = d[list][i];
        if (item.name && !confirm(`Remove ${item.name}?${list==='permFunds'&&item.balance?' Its balance will no longer be tracked.':''}`)) return;
        d[list].splice(i,1); onChange(true); }
    };
  },
};

const Settings = {
  render(){
    const s = store.settings; if (!s) return;
    if (!App.draft) App.draft = JSON.parse(JSON.stringify(s));
    const d = App.draft;
    $('#view-settings').innerHTML = `
      <div id="saveBar" style="position:sticky;top:64px;z-index:15;display:${App.dirty?'flex':'none'};gap:8px;align-items:center;background:var(--surface-3);border:1px solid var(--border-strong);border-radius:12px;padding:10px 12px;margin-bottom:12px;box-shadow:var(--shadow)">
        <span style="font-size:13.5px;font-weight:600;flex:1">Unsaved changes</span>
        <button class="btn sm ghost" onclick="Settings.discard()">Discard</button><button class="btn sm primary" onclick="Settings.save()">Save</button></div>
      <div class="section" style="margin-top:0"><div class="section-head"><h2>Long-term funds</h2><span class="link" style="color:var(--muted);font-weight:500">share · where it goes · balance</span></div>${Editors.permFunds(d)}</div>
      <div class="section"><div class="section-head"><h2>Weekly funds</h2><span class="link" style="color:var(--muted);font-weight:500">$ per week or % of income</span></div>${Editors.weeklyFunds(d)}</div>
      <div class="section"><div class="section-head"><h2>Monthly bills</h2></div>${Editors.bills(d)}</div>
      <div class="section"><div class="section-head"><h2>Accounts</h2><button class="link" style="background:none" onclick="Accounts.open()">Month-end check-in →</button></div>${Editors.accounts(d)}
        <p class="hint" style="margin-top:8px">Balances here are what the app expects after your deposits. At month end, enter your real balances and the difference (interest, market gains or losses) is added to the linked fund.</p></div>
      <div class="section"><div class="section-head"><h2>Rules</h2></div>${Editors.rules(d)}</div>
      ${store.ledger?.joint ? '' : `<div class="section"><div class="section-head"><h2>Joint budget</h2></div>${Joint.renderSettings()}</div>`}
      <div class="section"><div class="section-head"><h2>Appearance</h2></div>${Appearance.renderSection()}</div>
      <div class="section"><div class="section-head"><h2>Reminders on this device</h2></div>
        <div class="card"><p style="font-size:13.5px;color:var(--text-2)">A daily nudge at your reminder hour if nobody has logged tips to this budget yet that day — and a heads-up on close-week day. Works even when the app is closed.</p>
        <div id="notifRow" style="margin-top:10px"></div></div></div>
      <div class="section"><div class="section-head"><h2>This budget</h2></div>
        <div class="card">
          <div class="field"><label for="ledgerName">Name</label><div style="display:flex;gap:8px"><input class="input" id="ledgerName" value="${esc(store.ledger?.name||'')}" ${store.isOwner()?'':'disabled'}><button class="btn" onclick="Ledgers.rename()" ${store.isOwner()?'':'disabled'}>Save</button></div></div>
          <div class="subhead">People who can see and log to it</div>
          <div id="members">${(store.ledger?.members||[]).map(m=>`<div class="member"><span class="who">${esc(m)}${m===Auth.email()?'<span class="you">(you)</span>':''}${m===store.ledger?.ownerEmail?'<span class="you">owner</span>':''}</span>${store.isOwner()&&m!==store.ledger?.ownerEmail?`<button class="btn sm ghost" onclick="Ledgers.removeMember('${esc(m)}')">Remove</button>`:''}</div>`).join('')}</div>
          ${store.isOwner()?`<form style="display:flex;gap:8px;margin-top:12px" onsubmit="event.preventDefault();Ledgers.addMember()"><input class="input" type="email" id="inviteEmail" placeholder="friend@example.com" required><button class="btn primary" type="submit">Invite</button></form>
          <p class="hint" style="margin-top:8px">They sign in with that email (Google or password) and this budget appears in their list. Everyone invited sees the same numbers.</p>`:'<p class="hint" style="margin-top:8px">Only the owner can invite people or rename this budget.</p>'}
          <div class="kv" style="margin-top:12px"><span class="k">Income entries</span><span class="v num">${store.allTips().length}</span></div>
          <div class="kv"><span class="k">Purchases logged</span><span class="v num">${store.allPurchases().length}</span></div>
          <div class="kv"><span class="k">Weeks closed</span><span class="v num">${store.weeks().length}</span></div>
          <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="btn sm ghost" onclick="Settings.exportJson()">Copy backup (JSON)</button><button class="btn sm ghost" onclick="Ledgers.create()">${ICON.plus} New budget</button>${store.isOwner()?`<button class="btn sm danger" onclick="Ledgers.remove()">Delete this budget</button>`:''}</div>
        </div></div>
      <div class="status-line">${APP_NAME} · signed in as ${esc(Auth.email()||'')} · <button class="link" style="background:none;color:var(--muted);text-decoration:underline" onclick="Auth.signOut()">Sign out</button></div>`;
    Editors.wire($('#view-settings'), d, structural => { App.dirty = true; if (structural) this.render(); else $('#saveBar').style.display='flex'; });
    Push.renderRow($('#notifRow'));
    Appearance.wire($('#view-settings'));
  },
  refreshStatus(){},
  async save(){
    const d = App.draft; const p = sum(d.permFunds.filter(f=>f.mode!=='fixed'), f=>f.pct);
    if (Math.abs(p-100) > 0.01 && !confirm(`Fund percentages total ${round2(p)}%, not 100%. Save anyway?`)) return;
    d.permFunds.forEach(f=>{ f.pct=+f.pct||0; f.amount=round2(f.amount); f.balance=round2(f.balance); f.name=f.name.trim()||'Fund'; f.mode=f.mode==='fixed'?'fixed':'pct'; });
    d.weeklyFunds.forEach(f=>{ f.budget=round2(f.budget); f.name=f.name.trim()||'Fund'; });
    d.bills.forEach(b=>{ b.amount=round2(b.amount); b.name=b.name.trim()||'Bill'; b.dueDay=+b.dueDay||1; b.period=b.period||'month'; });
    d.accounts.forEach(a=>{ a.balance=round2(a.balance); a.split=(a.split||[]).filter(x=>x.name||+x.pct); });
    d.overdraftFrom = (d.overdraftFrom||[]).filter(Boolean);
    await store.saveSettings(d); App.dirty=false; App.draft=null; toast('Settings saved'); this.render();
  },
  discard(){ App.dirty=false; App.draft=null; this.render(); toast('Changes discarded'); },
  exportJson(){ const blob = JSON.stringify(store.data, null, 1); navigator.clipboard?.writeText(blob).then(()=>toast('Backup copied to clipboard'), ()=>toast('Could not copy')); },
};

/* ── Month-end account check-in ───────────── */
const Accounts = {
  open(){
    const s = store.settings; const mk = monthKey(todayISO());
    const done = (store.data.acct?.entries||[]).find(e=>e.month===mk);
    Sheet.open(`
      <h2>Month-end check-in</h2>
      <p class="lead">Enter each account’s real balance from your bank or brokerage. The difference from what the ledger expects is interest or market movement, and it’s added to the linked fund.</p>
      ${done?`<div class="notice pink" style="margin-bottom:12px">${ICON.check}<div><div class="t">Already checked in for ${parseISO(mk+'-01').toLocaleDateString('en-US',{month:'long'})}</div><div class="d">Doing it again will record another entry.</div></div></div>`:''}
      <form onsubmit="event.preventDefault();Accounts.submit()">
        ${s.accounts.map((a,i)=>{ const f = s.permFunds.find(x=>x.id===a.earningsTo); return `<div class="card" style="padding:12px 14px">
          <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><b>${esc(a.institution)} · ${esc(a.name)}</b><span class="num" style="color:var(--muted);font-size:13px">expected ${fmt(a.balance)}</span></div>
          <div class="money" style="margin-top:8px"><input class="input num" type="number" step="0.01" id="acct-${i}" placeholder="${(+a.balance||0).toFixed(2)}" inputmode="decimal" data-expected="${a.balance}"></div>
          <div class="hint" style="margin-top:6px;display:flex;justify-content:space-between"><span>${f?`Earnings → ${esc(f.emoji)} ${esc(f.name)}`:'No fund linked for earnings'}</span><span class="num" id="acct-earned-${i}"></span></div>
        </div>`; }).join('')}
        <div class="sheet-actions" style="margin-top:14px"><button type="button" class="btn ghost" onclick="Sheet.close()">Later</button><button type="submit" class="btn primary" id="acctBtn">Record balances</button></div>
      </form>`, sheet => { sheet.addEventListener('input', ev => { if (!ev.target.id.startsWith('acct-')) return; const i = ev.target.id.split('-')[1]; const v = ev.target.value; const el = $('#acct-earned-'+i); if (v==='') { el.textContent=''; return; } const e = +v - (+ev.target.dataset.expected||0); el.textContent = fmt(e,{plus:true}); el.className = 'num ' + (e>=0?'pos':'neg'); }); });
  },
  async submit(){
    const s2 = JSON.parse(JSON.stringify(store.settings)); const rows = []; let total = 0;
    s2.accounts.forEach((a,i) => { const v = $('#acct-'+i).value; if (v==='') return; const actual = round2(v); const earned = round2(actual - (+a.balance||0));
      rows.push({ id:a.id, name:`${a.institution} ${a.name}`.trim(), expected: round2(a.balance), actual, earned }); total += earned; a.balance = actual;
      const f = s2.permFunds.find(x=>x.id===a.earningsTo); if (f) f.balance = round2(f.balance + earned); });
    if (!rows.length) { toast('Enter at least one balance'); return; }
    $('#acctBtn').disabled = true;
    const hist = store.data.acct || { entries:[] };
    const entry = { month: monthKey(todayISO()), at: new Date().toISOString(), accounts: rows, total: round2(total) };
    try { await store.write('history/accounts', { entries: [...hist.entries, entry] }); await store.saveSettings(s2); } catch(e){ $('#acctBtn').disabled=false; return; }
    Sheet.close(); toast(`Recorded · ${fmt(total,{plus:true})} in earnings this month`);
  },
};

/* ── Reminders (device notifications while the page is open) ── */
const Reminders = {
  renderRow(el){
    if (!el) return;
    if (!('Notification' in window)) { el.innerHTML = '<span class="hint">This browser doesn’t support notifications. The in-app reminder banners still work.</span>'; return; }
    const p = Notification.permission;
    el.innerHTML = p==='granted' ? `<span class="pill good">${ICON.check} Reminders on for this device</span>`
      : p==='denied' ? '<span class="hint">Notifications are blocked for this site in your browser settings. Banners on the Home screen still remind you.</span>'
      : `<button class="btn sm primary" onclick="Reminders.enable()">Turn on reminders</button>`;
  },
  async enable(){ try { await Notification.requestPermission(); } catch(e){} this.renderRow($('#notifRow')); this.tick(); },
  lastKey: null,
  tick(){
    const s = store.settings; if (!s || s.remindEnabled===false || !('Notification' in window) || Notification.permission!=='granted') return;
    const now = new Date(); const key = todayISO()+'-'+now.getHours();
    if (now.getHours() !== (s.remindHour??21) || this.lastKey === key) return;
    this.lastKey = key;
    const logged = store.allTips().some(t=>t.date===todayISO() && (t.type||'tips')==='tips');
    if (!logged) new Notification(APP_NAME, { body: now.getDay()===(s.closeDay??0) ? 'Log today’s tips, then close the week for your transfer checklist.' : 'Worked today? Log your tips while the numbers are fresh.' });
  },
};
setInterval(()=>Reminders.tick(), 60000);

/* ── SETUP (first run) ────────────────────── */
const Setup = {
  steps: ['welcome','perm','weekly','bills','accounts','done'],
  render(){
    if (!App.draft) { App.draft = DEFAULTS(); if (store.settings) Object.assign(App.draft, store.settings); }
    const d = App.draft; const i = App.setupStep; const step = this.steps[i];
    const bar = `<div class="steps">${this.steps.slice(1,-1).map((_,k)=>`<i class="${k < i ? 'on':''}"></i>`).join('')}</div>`;
    const nav = (nextLabel='Continue') => `<div class="sheet-actions" style="margin-top:18px">${i>0?`<button class="btn ghost" onclick="Setup.go(${i-1})">Back</button>`:''}<button class="btn primary" onclick="Setup.go(${i+1})">${nextLabel}</button></div>`;
    let body = '';
    if (step==='welcome') body = `
      <div class="hero-copy"><h2>Count out. Cash out. Every week.</h2>
      <p>Cashout runs the same system as your spreadsheet — just faster, on your phone, and shareable. Log every shift, paycheck and purchase; on close-week day it works out what to move where.</p></div>
      <div class="flow">
        <div class="st"><i style="background:var(--surface-3)">1</i><div><b>Bills come first</b><span>A quarter of your monthly bills is set aside from each week’s income — tips, paychecks, anything.</span></div></div>
        <div class="st"><i style="background:var(--brass-soft);color:var(--brass)">2</i><div><b>Weekly funds get filled</b><span>Groceries, eating out, fun — each has a weekly budget you spend from.</span></div></div>
        <div class="st"><i style="background:var(--lilac-soft);color:var(--lilac)">3</i><div><b>Everything left goes long-term</b><span>Leftover tips plus anything unspent are split by percentage across Roth, travel, emergency and the rest.</span></div></div>
      </div>
      <p class="hint">Takes about three minutes. You’ll enter today’s balances so the ledger starts where you are.</p>
      ${nav('Set up my ledger')}`;
    if (step==='perm') body = `${bar}<div class="hero-copy"><h2>Long-term funds</h2><p>Each fund takes either a share of what’s left over or a fixed amount every week. Percentages must add up to 100. A fund can also point at another budget — that’s how a joint budget gets fed.</p></div><div style="margin-top:14px">${Editors.permFunds(d)}</div>${nav()}`;
    if (step==='weekly') body = `${bar}<div class="hero-copy"><h2>Weekly spending funds</h2><p>How much you give yourself for each category — a set amount, or a percentage of the week’s income. Unspent money rolls into long-term funds at close.</p></div><div style="margin-top:14px">${Editors.weeklyFunds(d)}</div>${nav()}`;
    if (step==='bills') body = `${bar}<div class="hero-copy"><h2>Monthly bills</h2><p>These set the weekly amount held back from tips, and you’ll get reminders before due dates.</p></div><div style="margin-top:14px">${Editors.bills(d)}</div>${nav()}`;
    if (step==='accounts') body = `${bar}<div class="hero-copy"><h2>Real accounts</h2><p>Where the long-term money actually lives. Each week’s checklist tells you exactly how much to deposit into each one.</p></div><div style="margin-top:14px">${Editors.accounts(d)}</div>${nav('Finish')}`;
    if (step==='done') {
      const c = Model.compute(d, {weekStart:null}, [], []);
      body = `<div class="hero-copy"><h2>Ready to log.</h2><p>Here’s a typical week with these settings:</p></div>
        <div class="card" style="margin-top:14px;padding:12px 14px">
          <div class="kv"><span class="k">Bills set aside each week</span><span class="v num">${fmt(c.billsSet)}</span></div>${c.fixedTotal>0?`<div class="kv"><span class="k">Fixed weekly fund deposits</span><span class="v num">${fmt(c.fixedTotal)}</span></div>`:''}
          <div class="kv"><span class="k">Weekly funds to fill</span><span class="v num">${fmt(c.totalWeeklyBudget)}</span></div>
          <div class="kv total"><span class="k">Tips needed to break even</span><span class="v num">${fmt(c.totalNeeded)}</span></div>
          <div class="kv"><span class="k">Long-term balances today</span><span class="v num">${fmt(sum(d.permFunds,f=>f.balance))}</span></div>
        </div>
        ${Math.abs(c.pctTotal-100)>0.01?`<div class="notice warn" style="margin-top:10px">${ICON.alert}<div><div class="t">Percentages total ${round2(c.pctTotal)}%</div><div class="d">You can fix this in Settings any time.</div></div></div>`:''}
        <div class="sheet-actions" style="margin-top:18px"><button class="btn ghost" onclick="Setup.go(${i-1})">Back</button><button class="btn primary" onclick="Setup.finish()">Open my ledger</button></div>`;
    }
    $('#view-setup').innerHTML = `<div style="padding-top:8px">${body}</div>`;
    Editors.wire($('#view-setup'), d, structural => { if (structural) this.render(); });
  },
  go(i){ App.setupStep = Math.max(0, Math.min(this.steps.length-1, i)); window.scrollTo({top:0}); this.render(); },
  async finish(){
    const d = App.draft; d.setupDone = true; d.createdAt = new Date().toISOString();
    if (store.ledger?.joint) d.remindEnabled = false;   // a joint budget isn’t fed by shifts
    d.permFunds.forEach(f=>{ f.pct=+f.pct||0; f.amount=round2(f.amount); f.balance=round2(f.balance); f.mode=f.mode==='fixed'?'fixed':'pct'; }); d.bills.forEach(b=>{ b.period=b.period||'month'; }); d.accounts.forEach(a=>{ a.balance=round2(a.balance); a.split=(a.split||[]).filter(x=>x.name||+x.pct); });
    try { await store.saveSettings(d); if (!store.state.weekStart) await store.saveState({ weekStart: new Date().toISOString().replace(/Z$/,''), weekCount:0 }); } catch(e){ return; }
    App.draft = null; App.dirty = false; App.go('home'); toast('Welcome to your ledger');
  },
};

