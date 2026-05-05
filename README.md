# Vela — AI Automation Landing Page

> Set your direction. Let AI do the sailing.

## Live site setup

### 1. Enable GitHub Pages

1. Go to your repo on GitHub → **Settings** → **Pages**
2. Under *Source*, select **Deploy from a branch**
3. Branch: `main` · Folder: `/ (root)` → **Save**
4. Your site will be live at:
   `https://deaconautomation.github.io/Automation/`

---

### 2. Connect Gmail via Formspree (free — takes 2 minutes)

Formspree sends every waitlist signup directly to your Gmail inbox.

1. Go to [formspree.io](https://formspree.io) and **sign up with your Gmail**
2. Click **+ New Form**, give it a name (e.g. "Vela Waitlist")
3. Copy your **Form ID** — it looks like `xwkjgpqz`
4. Open `index.html`, find this line near the bottom:
   ```js
   const FORMSPREE_ID = 'YOUR_FORMSPREE_ID';
   ```
5. Replace `YOUR_FORMSPREE_ID` with your actual ID:
   ```js
   const FORMSPREE_ID = 'xwkjgpqz';
   ```
6. Commit and push — signups now land in your Gmail

Free tier: 50 submissions/month. Upgrade anytime.

---

## Local preview

Just open `index.html` in any browser — no build step required.
