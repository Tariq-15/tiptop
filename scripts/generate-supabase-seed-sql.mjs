/**
 * Obsolete: catalog data lives in Supabase (categories + products tables).
 * Root-level products.json / categories.json were removed; the old generator
 * targeted shop_products / shop_categories, which are no longer used.
 */
console.error(
  "This script is retired. Manage catalog data in the Supabase project (Dashboard or SQL); the site loads via PostgREST."
);
process.exit(1);
