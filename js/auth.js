/* ── Auth: Firebase Authentication (Google + email/password) ── */
'use strict';

const Auth = {
  user: null,
  uid(){ return this.user?.uid || null; },
  email(){ return (this.user?.email || '').toLowerCase(); },
  name(){ return this.user?.displayName || this.email(); },

  init(onUser){
    const auth = firebase.auth();
    auth.onAuthStateChanged(u => {
      this.user = u;
      if (u && ALLOWED_EMAIL_DOMAINS.length && !ALLOWED_EMAIL_DOMAINS.includes(this.email().split('@')[1])) {
        this.msg(`Only ${ALLOWED_EMAIL_DOMAINS.join(', ')} accounts can use this app.`); auth.signOut(); return;
      }
      onUser(u);
    });
    $('#googleBtn').onclick = async () => {
      this.msg('');
      try { await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()); }
      catch(e){ if (e.code==='auth/popup-blocked' || e.code==='auth/operation-not-supported-in-this-environment') auth.signInWithRedirect(new firebase.auth.GoogleAuthProvider()); else this.msg(this.friendly(e)); }
    };
    $('#emailForm').onsubmit = async ev => { ev.preventDefault(); this.msg('');
      try { await auth.signInWithEmailAndPassword($('#authEmail').value.trim(), $('#authPass').value); } catch(e){ this.msg(this.friendly(e)); } };
    $('#signUpBtn').onclick = async () => { this.msg('');
      const email = $('#authEmail').value.trim(), pass = $('#authPass').value;
      if (!email || pass.length < 6) { this.msg('Enter an email and a password of at least 6 characters.'); return; }
      try { await auth.createUserWithEmailAndPassword(email, pass); } catch(e){ this.msg(this.friendly(e)); } };
  },
  msg(t){ const el = $('#authMsg'); if (el) el.textContent = t; },
  friendly(e){
    const m = { 'auth/invalid-credential':'Wrong email or password.', 'auth/user-not-found':'No account with that email — tap “Create account”.', 'auth/wrong-password':'Wrong password.',
      'auth/email-already-in-use':'That email already has an account — sign in instead.', 'auth/invalid-email':'That doesn’t look like an email address.', 'auth/weak-password':'Use a longer password (6+ characters).',
      'auth/unauthorized-domain':'This site isn’t authorized in Firebase yet — add it under Authentication → Settings → Authorized domains.',
      'auth/configuration-not-found':'Firebase Auth isn’t set up yet — enable Google and Email sign-in in the Firebase console.' };
    return m[e.code] || e.message || 'Something went wrong.';
  },
  async signOut(){ await firebase.auth().signOut(); location.reload(); },
};
