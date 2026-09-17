/* End-to-end smoke test in headless Chromium with the mock Firebase: sign in → create budget → setup → log → close week → insights. */
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path'); const http = require('http');
const root = path.join(__dirname, '..');

// serve the repo, swapping the real Firebase SDK for the mock and giving config a fake key
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const file = path.join(root, p);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  let body = fs.readFileSync(file);
  if (p === '/index.html') body = Buffer.from(body.toString().replace(/<script src="https:\/\/www\.gstatic\.com[^>]*><\/script>\s*/g, '').replace('<script src="js/config.js">', '<script src="test/mock-firebase.js"></script><script src="js/config.js">'));
  if (p === '/js/config.js') body = Buffer.from(body.toString().replace('apiKey:            "PASTE_ME"', 'apiKey: "test"').replace('const VAPID_PUBLIC_KEY = ""', 'const VAPID_PUBLIC_KEY = "x"'));
  const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.webmanifest':'application/manifest+json' };
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(body);
}).listen(0);

(async () => {
  const port = server.address().port; const base = `http://127.0.0.1:${port}/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2, colorScheme: process.argv[2] === 'light' ? 'light' : 'dark' });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => { errors.push(e.message); console.log('PAGE ERROR', e.message); });
  page.on('console', m => { if (m.type()==='error' && !/fonts|ERR_|favicon/.test(m.text())) console.log('CONSOLE', m.text()); });
  const shots = path.join(__dirname, 'shots'); fs.mkdirSync(shots, { recursive: true });
  const tag = process.argv[2] === 'light' ? '-light' : '';
  const shot = (n, full=true) => page.screenshot({ path: `${shots}/${n}${tag}.png`, fullPage: full });

  await page.goto(base); await page.waitForTimeout(300);
  await shot('01-signin', false);
  await page.click('#googleBtn'); await page.waitForTimeout(400);
  await shot('02-first-budget', false);
  await page.fill('#newLedgerName', 'Matt’s budget'); await page.click('#view-setup button[type=submit]'); await page.waitForTimeout(400);
  await shot('03-setup-welcome');
  // fill the setup via the draft (same as typing into every field)
  await page.evaluate(() => {
    const d = App.draft;
    [['roth',40],['travel',20],['emerg',15],['gen',15],['home',5],['health',5]].forEach(([id,p]) => d.permFunds.find(f=>f.id===id).pct = p);
    const bal = {roth:4180, travel:920, emerg:1500, gen:640, home:210, health:180}; d.permFunds.forEach(f => f.balance = bal[f.id]);
    const wb = {groc:90, eat:45, fun:40, cloth:20, pets:25, self:15, gift:10, gas:50, other:15}; d.weeklyFunds.forEach(f => f.budget = wb[f.id]);
    const ba = {car:310, rent:1150, phone:65, util:120, net:70, ins:140}; d.bills.forEach(b => b.amount = ba[b.id]);
    d.accounts[0].balance = 4180; d.accounts[1].balance = 920; d.accounts[2].balance = 2530;
    Setup.go(1);
  });
  await page.waitForTimeout(200); await shot('04-setup-funds');
  await page.evaluate(() => Setup.go(5)); await page.waitForTimeout(200); await shot('05-setup-done');
  await page.evaluate(() => Setup.finish()); await page.waitForTimeout(500);
  // log a shift and purchases through the real forms
  await page.click('#logTab'); await page.waitForTimeout(200);
  await page.fill('#f-cash', '84'); await page.fill('#f-card', '212'); await page.fill('#f-notes', 'Monday football');
  await shot('06-log-tips', false);
  await page.click('#logSubmit'); await page.waitForTimeout(400);
  await page.evaluate(() => Log.open('purchase')); await page.waitForTimeout(200);
  await page.fill('#f-amt', '62.40'); await page.click('[data-cat="groc"]'); await page.fill('#f-merchant', 'Trader Joe’s');
  await shot('07-log-purchase', false);
  await page.click('#logSubmit'); await page.waitForTimeout(400);
  for (const [amt, cat, m] of [['41.10','gas','Shell'],['14.85','eat','Chipotle'],['46.20','fun','Target'],['31.99','pets','Chewy']]) {
    await page.evaluate(() => Log.open('purchase')); await page.waitForTimeout(120);
    await page.fill('#f-amt', amt); await page.click(`[data-cat="${cat}"]`); await page.fill('#f-merchant', m); await page.click('#logSubmit'); await page.waitForTimeout(250);
  }
  await page.evaluate(() => Log.open('tips')); await page.fill('#f-cash', '61'); await page.fill('#f-card', '147'); await page.click('#logSubmit'); await page.waitForTimeout(300);
  // a paycheck through the income type dropdown
  await page.evaluate(() => Log.open('tips')); await page.selectOption('#f-type', 'wage'); await page.fill('#f-income', '312.40'); await page.fill('#f-source', 'Bistro payroll'); await shot('06b-log-paycheck', false); await page.click('#logSubmit'); await page.waitForTimeout(300);
  await shot('08-home');
  await page.evaluate(() => Close.open()); await page.waitForTimeout(200); await shot('09-close-preview', false);
  await page.click('#closeBtn'); await page.waitForTimeout(500); await shot('10-close-result', false);
  await page.evaluate(() => Sheet.close()); await page.evaluate(() => App.go('insights')); await page.waitForTimeout(300); await shot('11-insights');
  await page.evaluate(() => App.go('bills')); await page.waitForTimeout(200); await shot('12-bills');
  await page.evaluate(() => App.go('settings')); await page.waitForTimeout(200); await shot('13-settings');
  await page.click('[data-preset="Mint"]'); await page.waitForTimeout(150); await page.evaluate(() => App.go('home')); await page.waitForTimeout(250); await shot('13b-home-mint');
  await page.evaluate(() => { Appearance.set(null); App.go('settings'); }); await page.waitForTimeout(200);
  // invite + second budget + switcher
  await page.fill('#inviteEmail', 'partner@example.com'); await page.click('#view-settings form button[type=submit]'); await page.waitForTimeout(300);
  await page.evaluate(() => Ledgers.create()); await page.fill('#sheetLedgerName', 'Jordan’s budget'); await page.click('#sheet form button[type=submit]'); await page.waitForTimeout(500);
  await page.evaluate(() => Ledgers.openSwitcher()); await page.waitForTimeout(200); await shot('14-switcher', false);
  // link a fund in Matt's budget to Jordan's (as a stand-in joint budget), close Matt's week, expect income in Jordan's
  await page.evaluate(() => { Sheet.close(); const m = store.ledgers.find(l=>l.name.startsWith('Matt')); store.select(m.id); });
  await page.waitForTimeout(400); await page.evaluate(() => App.go('settings')); await page.waitForTimeout(300);
  await page.evaluate(() => { const j = store.ledgers.find(l=>l.name.startsWith('Jordan')); App.draft.permFunds.push({ id:'joint', emoji:'🏠', name:'Joint', pct:0, mode:'fixed', amount:75, balance:0, account:'', linkTo:j.id }); App.dirty = true; Settings.render(); });
  await page.waitForTimeout(200); await shot('15-settings-modes');
  await page.evaluate(() => Settings.save()); await page.waitForTimeout(400);
  await page.evaluate(() => Log.open('tips')); await page.fill('#f-cash', '100'); await page.fill('#f-card', '300'); await page.click('#logSubmit'); await page.waitForTimeout(300);
  await page.evaluate(() => Close.open()); await page.waitForTimeout(200); await shot('16-close-with-contribution', false);
  await page.click('#closeBtn'); await page.waitForTimeout(600); await shot('17-close-result-contribution', false);
  await page.evaluate(() => { Sheet.close(); const j = store.ledgers.find(l=>l.name.startsWith('Jordan')); store.select(j.id); }); await page.waitForTimeout(500);
  const jointIncome = await page.evaluate(() => store.allTips().map(e=>[e.type, e.total, e.source]));
  console.log('joint income:', JSON.stringify(jointIncome));

  // sanity: state after close
  const state = await page.evaluate(() => ({ ledgers: store.ledgers.map(l=>[l.name, l.members]), weeks: Object.keys(window.__mock.docs).filter(k=>k.includes('/weeks/')).length, income: store.allTips().map(e=>[e.type,e.total]),
    rothAfter: Object.values(window.__mock.docs).find(d=>d && d.permFunds && d.permFunds[0].balance !== 4180)?.permFunds?.find(f=>f.id==='roth')?.balance }));
  console.log(JSON.stringify(state));
  console.log(errors.length ? `${errors.length} page error(s)` : 'no page errors');
  await browser.close(); server.close();
  process.exit(errors.length ? 1 : 0);
})();
