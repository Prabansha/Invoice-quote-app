# Invoice & Quotation Generator

A React app for generating invoices and quotations with:
- 3 selectable templates (Harbor, Ledger, Brass)
- Logo upload with automatic background removal and header-color matching
- Business profile, client info, line items with Warranty column
- Payment (bank) details and Terms & Conditions sections
- "Print / Save as PDF" and a fallback "Download HTML → Print to PDF" export
- Business profile saved in the browser (localStorage), so it's remembered next visit

## Run locally

```bash
npm install
npm run dev
```

Then open the URL shown in the terminal (usually http://localhost:5173).

## Build for production

```bash
npm run build
```

This creates a `dist/` folder with the static site — deploy that folder anywhere
that serves static files.

## Deploy for free

### Option A — Vercel
1. Push this folder to a GitHub repo.
2. Go to vercel.com → "New Project" → import the repo.
3. Framework preset: Vite. Build command: `npm run build`. Output dir: `dist`.
4. Deploy. You'll get a `*.vercel.app` URL immediately; you can attach a
   custom domain later in Project Settings → Domains.

### Option B — Netlify
1. Push this folder to a GitHub repo.
2. Go to app.netlify.com → "Add new site" → import the repo.
3. Build command: `npm run build`. Publish directory: `dist`.
4. Deploy.

Both platforms auto-redeploy every time you push to the repo.

## Notes on data storage

This build stores the saved business profile (logo, name, address, bank
details, terms) in the browser's `localStorage`, per visitor, per browser. It
is **not** shared between devices or users. If you plan to offer this as a
multi-user product (each customer signing in and keeping their own data),
swap `src/storage.js` for a real backend — Supabase or Firebase both have
free tiers and are the easiest path: add auth, then read/write a `profiles`
table keyed by user ID instead of localStorage.

## Monetization notes

Not legal or financial advice — for anything involving business registration,
VAT-compliant invoice formatting, or payment-gateway agreements, check with an
accountant or lawyer in your jurisdiction before launching.
