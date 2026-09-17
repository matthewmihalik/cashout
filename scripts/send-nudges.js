/* Cashout — daily nudge sender.
   Runs hourly from GitHub Actions (see .github/workflows/daily-nudge.yml).
   For every registered device: if it's the budget's reminder hour in that device's
   time zone and nobody has logged tips to the budget today, send one push notification.
   Needs the FIREBASE_SERVICE_ACCOUNT secret (the JSON key of a service account). */
'use strict';
const admin = require('firebase-admin');

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
if (!sa.project_id) { console.error('FIREBASE_SERVICE_ACCOUNT secret is missing or not JSON'); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const APP_NAME = process.env.APP_NAME || 'Cashout';

const localParts = (tz, d = new Date()) => {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' });
  const p = Object.fromEntries(f.formatToParts(d).map(x => [x.type, x.value]));
  const dow = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(p.weekday);
  return { hour: +p.hour % 24, date: `${p.year}-${p.month}-${p.day}`, dow };
};

(async () => {
  const tokens = (await db.collection('pushTokens').get()).docs.map(d => ({ token: d.id, ...d.data() }));
  if (!tokens.length) { console.log('No devices registered.'); return; }
  const ledgers = (await db.collection('ledgers').get()).docs.map(d => ({ id: d.id, ...d.data() }));
  const settingsCache = {}, tipsCache = {};
  const getSettings = async lid => settingsCache[lid] ??= (await db.doc(`ledgers/${lid}/data/settings`).get()).data() || {};
  const loggedToday = async (lid, date) => {
    const key = lid + date; if (key in tipsCache) return tipsCache[key];
    const doc = (await db.doc(`ledgers/${lid}/income/${date.slice(0, 7)}`).get()).data();
    return tipsCache[key] = !!(doc && (doc.entries || []).some(e => e.date === date && (e.type || 'tips') === 'tips'));
  };

  let sent = 0, removed = 0;
  for (const t of tokens) {
    let tz = t.tz || 'America/New_York';
    try { Intl.DateTimeFormat('en-US', { timeZone: tz }); } catch { tz = 'America/New_York'; }
    const { hour, date, dow } = localParts(tz);
    const mine = ledgers.filter(l => (l.members || []).includes((t.email || '').toLowerCase()));
    let body = null, title = APP_NAME;
    for (const l of mine) {
      const s = await getSettings(l.id);
      if (!s.setupDone || s.remindEnabled === false || (s.remindHour ?? 21) !== hour) continue;
      if (await loggedToday(l.id, date)) continue;
      const closeDay = dow === (s.closeDay ?? 0);
      title = mine.length > 1 ? `${APP_NAME} · ${l.name}` : APP_NAME;
      body = closeDay ? 'Close-week day: log today’s tips, then close the week for your transfer checklist.'
                      : 'Worked today? Log your tips while the numbers are fresh.';
      break; // one nudge per device per hour
    }
    if (!body) continue;
    try {
      await admin.messaging().send({ token: t.token, notification: { title, body }, webpush: { fcmOptions: { link: process.env.APP_URL || '/' }, notification: { icon: 'icons/icon-192.png', tag: 'cashout-nudge' } } });
      sent++;
    } catch (e) {
      if (/not-registered|invalid-registration-token|invalid-argument/i.test(e.code || e.message)) { await db.doc(`pushTokens/${t.token}`).delete(); removed++; }
      else console.error('send failed', t.token.slice(0, 12), e.message);
    }
  }
  console.log(`Sent ${sent} nudge(s); removed ${removed} dead token(s); ${tokens.length} device(s) registered.`);
})().catch(e => { console.error(e); process.exit(1); });
