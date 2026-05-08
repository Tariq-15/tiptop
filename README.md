# TipTop website

Static HTML storefront with category pages, cart, and Supabase-backed catalog.

## Quick start

- Configure `shopcraft-supabase-config.js` (project URL + anon key).
- Open `index.html` for the public site.

## Pour (catalog admin)

Catalog management is in **`pour.html`** (not linked from the storefront). Uses the **service role** in **`admin-secrets.js`**.

Setup and security: **[ADMIN.md](./ADMIN.md)**.

## Deploy (Vercel)

This repo is a **static HTML** site at the root. **Next.js only exists under `drive-proxy/`** (optional local image proxy), so the storefront project must not use Vercel’s **Next.js** preset.

1. **Import** this GitHub repo in Vercel.
2. **Framework Preset:** **Other** (or leave defaults that match `vercel.json`).
3. **Root Directory:** `.` (repository root, **not** `drive-proxy`).
4. **Build Command:** `npm run build` — **Output Directory:** `.`  
   These are set in **`vercel.json`** at the repo root.

To deploy the **drive proxy** as its own app: create a second Vercel project with **Root Directory** `drive-proxy` and framework **Next.js**.
