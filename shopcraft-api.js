/**
 * Load categories/products from Supabase PostgREST when SHOPCRAFT_SUPABASE_* is set.
 */
(function (global) {
  function cfg() {
    var url = global.SHOPCRAFT_SUPABASE_URL;
    var key = global.SHOPCRAFT_SUPABASE_ANON_KEY || global.SHOPCRAFT_SUPABASE_KEY;
    if (!url || !key) return null;
    return { url: String(url).replace(/\/$/, ""), key: String(key) };
  }

  function supabaseActive() {
    return !!cfg();
  }

  function rest(path, init) {
    var c = cfg();
    init = init || {};
    var h = Object.assign(
      {
        apikey: c.key,
        Authorization: "Bearer " + c.key,
        Accept: "application/json",
      },
      init.headers || {}
    );
    return fetch(c.url + path, Object.assign({}, init, { headers: h }));
  }

  function asArray(x) {
    if (x == null) return [];
    return Array.isArray(x) ? x : [];
  }

  function normalizeProduct(row) {
    var tags = row.tags;
    if (!Array.isArray(tags)) tags = [];
    return {
      id: Number(row.id),
      category: row.category,
      sku: row.sku,
      name: row.name,
      description: row.description,
      price: row.price != null ? Number(row.price) : 0,
      dimensions: asArray(row.dimensions),
      images: asArray(row.images),
      variants: asArray(row.variants),
      tags: tags,
      is_new_arrival: !!row.is_new_arrival,
      is_best_selling: !!row.is_best_selling,
      sort_order: row.sort_order != null ? Number(row.sort_order) : 0,
      is_active: row.is_active !== false,
      message_text: row.message_text != null ? String(row.message_text) : "",
      order_message: row.order_message != null ? String(row.order_message) : "",
    };
  }

  function fetchCategoriesJson() {
    return rest("/rest/v1/categories?select=payload,sort_order&order=sort_order.asc").then(function (r) {
      if (!r.ok) throw new Error("categories_http_" + r.status);
      return r.json();
    }).then(function (rows) {
      return { categories: (rows || []).map(function (x) { return x.payload; }) };
    });
  }

  function fetchProductsJson() {
    return rest(
      "/rest/v1/products?select=*&is_active=eq.true&order=sort_order.asc,id.asc"
    ).then(function (r) {
      if (!r.ok) throw new Error("products_http_" + r.status);
      return r.json();
    }).then(function (rows) {
      return { products: (rows || []).map(normalizeProduct) };
    });
  }

  global.ShopcraftApi = {
    supabaseActive: supabaseActive,
    fetchCategoriesJson: fetchCategoriesJson,
    fetchProductsJson: fetchProductsJson,
  };
})(typeof window !== "undefined" ? window : this);
