import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function readEnvValue(name) {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return "";
  const raw = fs.readFileSync(envPath, "utf8");
  const m = raw.match(new RegExp("^" + name + "\\s*=\\s*(.+)$", "m"));
  return m ? String(m[1]).trim() : "";
}

function readSupabaseUrl() {
  const cfgPath = path.join(root, "shopcraft-supabase-config.js");
  const raw = fs.readFileSync(cfgPath, "utf8");
  const m = raw.match(/SHOPCRAFT_SUPABASE_URL\s*=\s*"([^"]+)"/);
  return m ? String(m[1]).replace(/\/$/, "") : "";
}

async function main() {
  const key = readEnvValue("SHOPCRAFT_SUPABASE_SERVICE_ROLE_KEY");
  const base = readSupabaseUrl();
  if (!key) throw new Error("Missing SHOPCRAFT_SUPABASE_SERVICE_ROLE_KEY in .env");
  if (!base) throw new Error("Missing SHOPCRAFT_SUPABASE_URL in shopcraft-supabase-config.js");

  const headers = {
    apikey: key,
    Authorization: "Bearer " + key,
    Accept: "application/json",
  };

  const res = await fetch(
    base + "/rest/v1/categories?select=slug,payload,sort_order&order=sort_order.asc",
    { headers }
  );
  if (!res.ok) throw new Error("Read failed: " + res.status + " " + (await res.text()));

  const rows = await res.json();
  let changed = 0;

  for (const row of rows || []) {
    const slug = String(row.slug || "").trim();
    if (!slug) continue;

    const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
    const title = payload.navLabel || payload.breadcrumbLabel || payload.pageTitle || payload.documentTitle || slug;

    const nextPayload = {
      ...payload,
      navLabel: payload.navLabel || title,
      breadcrumbLabel: payload.breadcrumbLabel || title,
      pageTitle: payload.pageTitle || title,
      documentTitle: payload.documentTitle || title,
      cardImage: typeof payload.cardImage === "string" ? payload.cardImage : "",
    };

    if (JSON.stringify(payload) === JSON.stringify(nextPayload)) continue;

    const updateRes = await fetch(
      base + "/rest/v1/categories?slug=eq." + encodeURIComponent(slug),
      {
        method: "PATCH",
        headers: {
          ...headers,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ payload: nextPayload }),
      }
    );

    if (!updateRes.ok) {
      throw new Error("Patch failed for " + slug + ": " + updateRes.status + " " + (await updateRes.text()));
    }
    changed += 1;
  }

  console.log("Categories total:", rows.length);
  console.log("Categories updated:", changed);
}

main().catch((err) => {
  console.error(err && err.message ? err.message : String(err));
  process.exit(1);
});
