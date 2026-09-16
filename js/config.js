/* ============================================================
   Cashout — configuration
   The only file you need to edit. See README.md for where each
   value comes from.
   ============================================================ */

// The app's name, shown in the header, sign-in screen and notifications.
const APP_NAME = 'Cashout';

// 1) Firebase web app config — Firebase console → Project settings → Your apps → SDK setup (Config).
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyBE9y-gaTlmf2mKOp7zfksP-C_-qqbcdV8",
  authDomain:        "cashout-e46ea.firebaseapp.com",
  projectId:         "cashout-e46ea",
  storageBucket:     "cashout-e46ea.firebasestorage.app",
  messagingSenderId: "191247519989",
  appId:             "1:191247519989:web:99fa353f09c83564bd75bc",
};

// 2) Web Push certificate key pair — Firebase console → Project settings → Cloud Messaging → Web configuration.
//    Leave as "" to disable push notifications (in-app reminder banners still work).
const VAPID_PUBLIC_KEY = "";

// Optional: restrict sign-ups to these email domains (e.g. ["gmail.com"]). Empty = anyone can create an account,
// but they only ever see a ledger they were invited to (or a brand-new empty one of their own).
const ALLOWED_EMAIL_DOMAINS = [];
