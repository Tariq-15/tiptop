# TipTop website

Static HTML storefront with category pages, cart, and Supabase-backed catalog.

## Quick start

- Configure `shopcraft-supabase-config.js` (project URL + anon key).
- Open `index.html` for the public site.

## Pour (catalog admin)

Catalog management is in **`pour.html`** (not linked from the storefront). Uses the **service role** in **`admin-secrets.js`**.

Setup and security: **[ADMIN.md](./ADMIN.md)**.

To source the admin key from `.env`:

- Create `.env` at repo root with `SHOPCRAFT_SUPABASE_SERVICE_ROLE_KEY=...`
- Run `npm run prepare:admin-secrets` (or any `npm run build`)
- This auto-generates `admin-secrets.js` from the env value

## Deploy (Vercel)

This repo is a **static HTML** site at the root. **Next.js only exists under `drive-proxy/`** (optional local image proxy). Vercel was detecting that subfolder and treating the project as Next.js; **`vercel.json` sets `"framework": null`** (same as the **Other** preset), and **`.vercelignore`** skips `drive-proxy` for this deployment.

1. **Import** this GitHub repo in Vercel.
2. **Root Directory:** leave **empty** (repo root, **not** `drive-proxy`).
3. **Framework Preset:** should become **Other** once `vercel.json` is picked up; if the dashboard still shows Next.js, open **Settings → General → Framework Preset** and set **Other**, then redeploy.
4. **Build / Output:** use **`vercel.json`** (`npm run build`, output `.`).

To deploy the **drive proxy** as its own app: create a second Vercel project with **Root Directory** `drive-proxy` and framework **Next.js**.
