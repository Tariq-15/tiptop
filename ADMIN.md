# ShopCraft — Pour (catalog admin)

The public storefront uses the **anon** key and read-only RLS.

## How it works

1. **`pour.html`** loads **`admin-secrets.js`**, which sets `SHOPCRAFT_SUPABASE_SERVICE_ROLE_KEY` (Dashboard → **Project Settings** → **API** → **service_role** JWT).
2. There is **no login screen** — opening **`pour.html`** loads the editor directly.
3. The **service role bypasses RLS**. Restrict who can open this URL and read **`admin-secrets.js`** (private hosting, HTTP auth, IP rules, or proxy writes through your own backend).

## Setup

1. In Supabase **Dashboard → Project Settings → API**, copy the **`service_role`** JWT (not the anon key). Set it in **`admin-secrets.js`**:
   ```js
   window.SHOPCRAFT_SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOi...";
   ```
2. **`shopcraft-supabase-config.js`** must define **`SHOPCRAFT_SUPABASE_URL`** and **`SHOPCRAFT_SUPABASE_ANON_KEY`** (same as the storefront).

If **`admin-secrets.js`** does not define a key, the page **falls back to the anon key** so lists load; **create/update/delete** need the **service_role** key.

### Error: `No API key found in request`

PostgREST requires an `apikey` header. Check script order and that **`shopcraft-supabase-config.js`** loads before **`pour.html`** finishes initializing.

## Security

- **Never** include **`admin-secrets.js`** on **`index.html`**, **`category.html`**, or any public catalog page.
- Do not commit real keys to a public repository.
- Restrict access to **`pour.html`** and to files that contain secrets.

## Features

- **Categories**: drag-and-drop order → `sort_order`.
- **Products**: filter, sort, add / edit / delete; JSON for `images`, `dimensions`, `variants`; tags; New Arrival / Best Selling.
