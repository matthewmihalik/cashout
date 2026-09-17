# Cashout

A tip-based weekly budget that installs like an app. Log every shift, paycheck and purchase (income has a type: tips, paycheck, or other); on close-week day it works out how much goes to bills, how much fills your weekly spending funds, and how the rest splits across your long-term funds — then hands you a deposit checklist for each real account.

Everyone gets their own budget (a "ledger"); you can create several (for friends, students, a partner) and share any of them by email. It runs for free on GitHub Pages with a free Firebase project behind it.

## What's in the box

```
index.html               the app shell
css/app.css              styles (pink/plum theme, light + dark)
js/config.js             ← the only file you edit
js/util.js               helpers + default funds/bills
js/model.js              the budget math (bills ÷ 4, weekly funds, leftovers, overdraft, account roll-ups)
js/store.js              Firestore sync, one ledger per budget
js/views.js, js/more.js  screens: home, log, close week, bills, insights, settings, first-run setup
js/auth.js               sign in (Google or email/password)
js/push.js               daily nudge notifications
js/app.js                budget switcher, sharing, theme, boot
sw.js                    offline cache + background notifications
manifest.webmanifest     home-screen install
icons/                   app icons
firestore.rules          who can read/write what
scripts/send-nudges.js   the notification sender (run by GitHub Actions)
.github/workflows/       hourly schedule that runs it
test/                    offline smoke test (mock Firebase + Playwright)
```

## Setup (about 20 minutes, all free)

### 1. Put it on GitHub

1. Create a new repository on GitHub (public is fine — nothing secret lives in the code). Call it `cashout` or anything you like.
2. Upload every file and folder from this package (drag the whole folder onto the "uploading an existing file" page, or use `git`).
3. In the repo go to **Settings → Pages**, set **Source: Deploy from a branch**, branch `main`, folder `/ (root)`, and save.
4. In a minute or two your app is live at `https://<your-username>.github.io/<repo-name>/`. It will show a "not configured yet" message until step 2 is done.

### 2. Create the free Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → **Add project**. Name it anything. Turn Google Analytics off (not needed).
2. **Build → Authentication → Get started**. Under *Sign-in method* enable **Google** (pick a support email) and **Email/Password**.
3. Still in Authentication → **Settings → Authorized domains** → *Add domain* → `<your-username>.github.io`.
4. **Build → Firestore Database → Create database**. Pick a location near you, start in **production mode**.
5. In Firestore → **Rules**, replace everything with the contents of `firestore.rules` from this package and **Publish**.
6. **Project settings (gear icon) → General → Your apps → Web (`</>`)**. Register the app (any nickname, no hosting). Copy the `firebaseConfig` block it shows you.
7. Open `js/config.js` in your repo (GitHub's pencil icon works), paste those values into `FIREBASE_CONFIG`, and commit. Pages redeploys automatically.

Open the app, sign in with Google, name your budget, and walk through setup. That's the whole thing working. Your email is the owner of that budget; nobody else can see it until you invite them.

### 3. Install it on your phone

- **iPhone:** open the URL in Safari → Share → **Add to Home Screen**. Open it from the icon from now on (that's also what makes notifications possible on iOS).
- **Android:** Chrome will offer "Install app" in the menu, or a banner.

### 4. Daily nudge notifications (optional, free)

The app can't schedule a notification by itself when it's closed, so a tiny GitHub Actions job runs once an hour and sends one through Firebase Cloud Messaging to any device that turned reminders on — only if it's that budget's reminder hour and nobody has logged a shift's tips yet that day.

1. Firebase → **Project settings → Cloud Messaging → Web configuration → Web Push certificates → Generate key pair**. Copy the key.
2. Paste it into `VAPID_PUBLIC_KEY` in `js/config.js` and commit.
3. Firebase → **Project settings → Service accounts → Generate new private key**. This downloads a JSON file. Treat it like a password.
4. In your GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**. Name: `FIREBASE_SERVICE_ACCOUNT`. Value: paste the entire contents of that JSON file.
5. In the repo's **Actions** tab, enable workflows if GitHub asks, then open **Daily nudge → Run workflow** once to confirm it says `Sent 0 nudge(s)` with no errors.
6. In the app: **Settings → Reminders on this device → Turn on daily nudge**. Set the hour under **Rules → Daily log reminder**.

GitHub's free plan includes far more Actions minutes than this uses (roughly 20 minutes a month). If you ever want to stop, disable the workflow in the Actions tab.

### 5. Sharing a budget

Settings → **This budget** → type an email → **Invite**. When that person signs in with that same email (Google or a password account), your budget appears in their list and they log to the same numbers. Owners can remove people; anyone can create additional budgets of their own and switch between them from the chip at the top of the screen.

## Changing the name or colors

- Accent colors: in the app, **Settings → Appearance** — presets or custom pickers, saved per device. The defaults below only matter for the sign-in screen and anyone who hasn't picked.
- Name: `APP_NAME` in `js/config.js`, plus `name`/`short_name` in `manifest.webmanifest` and the `<title>` in `index.html`.
- Colors: the token block at the top of `css/app.css` (`--pink`, `--lilac`, `--brass`, and the light-mode copies further down).
- Default funds, bills and accounts for new budgets: `DEFAULTS()` in `js/util.js`.

## Joint budgets

Every budget is its own ledger. To feed a shared one: create it (e.g. "Joint"), invite your partner, then in each personal budget add a long-term fund whose destination is **→ Joint** (a fixed amount each week or a percentage of leftovers). When you close your personal week, that amount is posted into Joint as income labeled "Contribution", and Joint runs its own bills, weekly funds and long-term funds on it. Turn off Joint's daily shift reminder under Rules.

## Amount modes

Every amount has a dropdown: long-term funds are a % of leftovers or a fixed $ each week (fixed comes off the top like a bill); weekly funds are $ per week or % of the week's income; bills are per month (with a due day), per week, or per year — all converted to a weekly set-aside.

## How the math works (same rules as the original spreadsheet)

Each week: **income − bills set-aside − fixed fund deposits − weekly budgets = leftover**. Anything unspent inside the weekly funds is added to that leftover, and the total is split across long-term funds by their percentages. If a weekly fund goes over budget, the overspend is covered from the funds you pick in Rules (General Savings, then Emergency, by default). Each long-term fund maps to a real account, so the close-week checklist tells you exactly what to deposit where — including an optional deposit split (e.g. 80/20 domestic/international for a Roth). At month end you enter real account balances; the difference from what the app expected is booked as interest or market movement into the linked fund.

## Running the tests

```
npm install -g playwright && npx playwright install chromium
node test/run.js          # drives the whole app offline with a mock Firebase and saves screenshots to test/shots/
```

## Free-tier limits, for the curious

Firestore's free tier is 50k reads and 20k writes per day. A household logging a few entries a day uses well under 1% of that. GitHub Pages is free for public repos; the hourly Actions job uses about 20 of the 2,000 free minutes a month.
