/* ── Push notifications (Firebase Cloud Messaging) ──
   The page registers a device token; the GitHub Actions workflow in
   .github/workflows/daily-nudge.yml sends the actual notifications. */
'use strict';

const Push = {
  supported(){ return !!(VAPID_PUBLIC_KEY && 'serviceWorker' in navigator && 'Notification' in window && firebase.messaging?.isSupported?.()); },
  standaloneIOS(){ return /iphone|ipad/i.test(navigator.userAgent) && !window.navigator.standalone; },

  renderRow(el){
    if (!el) return;
    if (!VAPID_PUBLIC_KEY) { el.innerHTML = '<span class="hint">Push isn’t configured yet (add a VAPID key in js/config.js). In-app reminder banners still work.</span>'; return; }
    if (this.standaloneIOS()) { el.innerHTML = '<span class="hint">On iPhone, notifications work once the app is on your Home Screen: tap Share → “Add to Home Screen”, then open it from there and come back here.</span>'; return; }
    if (!this.supported()) { el.innerHTML = '<span class="hint">This browser doesn’t support push notifications. In-app reminder banners still work.</span>'; return; }
    const p = Notification.permission;
    const on = localStorage.getItem('cashout-push') === '1';
    el.innerHTML = p==='denied' ? '<span class="hint">Notifications are blocked for this site in your browser settings.</span>'
      : (p==='granted' && on) ? `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="pill good">${ICON.check} Daily nudge on for this device</span><button class="btn sm ghost" onclick="Push.disable()">Turn off</button></div>`
      : `<button class="btn sm primary" onclick="Push.enable()">Turn on daily nudge</button>`;
  },
  async enable(){
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { this.renderRow($('#notifRow')); return; }
      const reg = await navigator.serviceWorker.ready;
      const token = await firebase.messaging().getToken({ vapidKey: VAPID_PUBLIC_KEY, serviceWorkerRegistration: reg });
      if (!token) throw new Error('no token');
      await firebase.firestore().doc(`pushTokens/${token}`).set({ email: Auth.email(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone, ua: navigator.userAgent.slice(0,80), createdAt: new Date().toISOString() });
      localStorage.setItem('cashout-push', '1'); localStorage.setItem('cashout-push-token', token);
      toast('Daily nudge is on');
    } catch(e){ console.error(e); toast('Could not turn on notifications'); }
    this.renderRow($('#notifRow'));
  },
  async disable(){
    try { const t = localStorage.getItem('cashout-push-token'); if (t) { await firebase.firestore().doc(`pushTokens/${t}`).delete(); await firebase.messaging().deleteToken().catch(()=>{}); } } catch(e){}
    localStorage.removeItem('cashout-push'); localStorage.removeItem('cashout-push-token'); toast('Daily nudge is off'); this.renderRow($('#notifRow'));
  },
  /* Foreground messages (app is open): show as a toast instead of a system notification */
  listen(){ if (!this.supported()) return; try { firebase.messaging().onMessage(p => toast(p.notification?.body || 'Reminder')); } catch(e){} },
};
