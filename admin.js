/**
 * TipTop catalog editor — Supabase PostgREST.
 */
(function () {
  var cfg = { base: "", apiKey: "", serviceRole: false };
  var state = { categories: [], products: [] };
  /** Selected option index for admin storefront preview variant dropdown */
  var adminPreviewVariantIx = 0;

  var ICON_EDIT =
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125"/></svg>';
  var ICON_DELETE =
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>';

  function $(id) {
    return document.getElementById(id);
  }

  function initCfg() {
    cfg.base = String(window.SHOPCRAFT_SUPABASE_URL || "").replace(/\/$/, "");
    var svc = String(window.SHOPCRAFT_SUPABASE_SERVICE_ROLE_KEY || "").trim();
    if (!svc) {
      try {
        svc = String(localStorage.getItem("SHOPCRAFT_SUPABASE_SERVICE_ROLE_KEY") || "").trim();
      } catch (_) {}
    }
    var anon = String(
      window.SHOPCRAFT_SUPABASE_ANON_KEY || window.SHOPCRAFT_SUPABASE_KEY || ""
    ).trim();
    cfg.serviceRole = svc.length > 0;
    cfg.apiKey = svc || anon;
  }

  function hasApiKey() {
    return cfg.apiKey.length > 0;
  }

  function hasServiceRole() {
    return cfg.serviceRole;
  }

  function writeAccessHint() {
    return (
      "Write access is disabled. Add SHOPCRAFT_SUPABASE_SERVICE_ROLE_KEY in admin-secrets.js (or set it via localStorage key SHOPCRAFT_SUPABASE_SERVICE_ROLE_KEY) and reload Pour."
    );
  }

  function requireWriteAccess() {
    if (hasServiceRole()) return true;
    toast(writeAccessHint(), true);
    return false;
  }

  function toast(msg, isErr) {
    var el = $("admin-toast");
    if (!el) return;
    el.textContent = msg;
    el.className = "admin-toast" + (isErr ? " admin-toast-err" : "");
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () {
      el.hidden = true;
    }, 5000);
  }

  function headersService(extra) {
    var k = cfg.apiKey;
    var h = {
      apikey: k,
      Authorization: "Bearer " + k,
      Accept: "application/json",
    };
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) h[k] = extra[k];
      }
    }
    return h;
  }

  async function api(path, opts) {
    opts = opts || {};
    var init = {
      method: opts.method || "GET",
      headers: headersService(opts.headersExtra || {}),
    };
    if (opts.body != null) init.body = opts.body;
    return fetch(cfg.base + path, init);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /** Same rules as storefront catalog-cart.js — supports many Drive URL shapes. */
  function extractGoogleDriveFileId(url) {
    if (!url || typeof url !== "string") return null;
    var u = url.trim();
    var m = u.match(/[?&]id=([^&]+)/);
    if (m) return decodeURIComponent(m[1]);
    m = u.match(/\/file\/d\/([^/?#]+)/);
    if (m) return m[1];
    m = u.match(/\/d\/([^/?#]+)/);
    if (m && u.indexOf("drive.google") !== -1) return m[1];
    m = u.match(/googleusercontent\.com\/d\/([^/?#]+)/);
    if (m) return m[1];
    return null;
  }

  /**
   * Canonical URL written to the DB for Google Drive files.
   * Same shape as your existing data: uc?export=view&id=…
   */
  function normalizeImageUrlForStorage(raw) {
    var t = String(raw || "").trim();
    if (!t) return "";
    var id = extractGoogleDriveFileId(t);
    if (id) {
      return (
        "https://drive.google.com/uc?export=view&id=" + encodeURIComponent(id)
      );
    }
    return t;
  }

  /** URL for <img> preview only — thumbnail loads reliably; storefront uses the same idea in catalog-cart.js */
  function driveImageDisplayUrlForPreview(raw) {
    var t = String(raw || "").trim();
    if (!t) return "";
    var id = extractGoogleDriveFileId(t);
    if (id) {
      return (
        "https://drive.google.com/thumbnail?id=" + encodeURIComponent(id) + "&sz=w1920"
      );
    }
    if (/^https?:\/\//i.test(t)) return t;
    return "";
  }

  function normalizeSkuCompare(s) {
    return String(s || "")
      .trim()
      .toLowerCase();
  }

  /** True if another product (not excludeProductId) uses this SKU. */
  function isSkuTakenByOtherProduct(sku, excludeProductId) {
    var key = normalizeSkuCompare(sku);
    if (!key) return false;
    for (var i = 0; i < state.products.length; i++) {
      var p = state.products[i];
      if (
        excludeProductId != null &&
        excludeProductId !== "" &&
        Number(p.id) === Number(excludeProductId)
      ) {
        continue;
      }
      if (normalizeSkuCompare(p.sku) === key) return true;
    }
    return false;
  }

  function refreshSkuFeedback() {
    var inp = $("pf-sku");
    var fb = $("pf-sku-feedback");
    if (!inp || !fb) return;
    var editIdRaw = $("pf-edit-id") ? $("pf-edit-id").value : "";
    var excludeId = editIdRaw ? Number(editIdRaw) : null;
    var dup = isSkuTakenByOtherProduct(inp.value, excludeId);
    fb.textContent = dup ? "Already exists — choose another SKU." : "";
    inp.classList.toggle("admin-input--invalid", dup);
    inp.setAttribute("aria-invalid", dup ? "true" : "false");
  }

  var previewRaf = null;
  function scheduleProductPreview() {
    if (previewRaf != null) cancelAnimationFrame(previewRaf);
    previewRaf = requestAnimationFrame(function () {
      previewRaf = null;
      refreshProductPreview();
    });
  }

  /** Ordered values from each image row (including empty strings). */
  function collectOrderedImageRawStrings() {
    var wrap = $("pf-images-list");
    if (!wrap) return [];
    var nodes = wrap.querySelectorAll(".pf-in-image");
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      out.push(String(nodes[i].value || "").trim());
    }
    return out;
  }

  /** Same markup as catalog-cart.js renderProductCard gallery section (shared.css classes). */
  function buildPreviewGalleryMountHtml(urls) {
    var imgs = (urls || []).filter(Boolean);
    var slidesHtml = imgs.length
      ? imgs
          .map(function (url) {
            var src = driveImageDisplayUrlForPreview(url);
            return (
              '<div class="gallery-slide"><img src="' +
              escapeHtml(src) +
              '" alt="" loading="lazy" referrerpolicy="no-referrer" decoding="async"></div>'
            );
          })
          .join("")
      : '<div class="gallery-slide"><span style="font-size:3rem">🪵</span></div>';

    var navBlock = "";
    if (imgs.length > 1) {
      navBlock =
        '<button type="button" class="gallery-nav gallery-prev" tabindex="-1">&#8249;</button>' +
        '<button type="button" class="gallery-nav gallery-next" tabindex="-1">&#8250;</button>';
    } else {
      navBlock =
        '<div class="gallery-dots"><div class="gallery-dot active"></div></div>';
    }

    var thumbsHtml = "";
    if (imgs.length > 1) {
      thumbsHtml =
        '<div class="gallery-thumbs" role="tablist" aria-label="Product images">' +
        imgs
          .map(function (url, i) {
            var src = driveImageDisplayUrlForPreview(url);
            return (
              '<button type="button" class="gallery-thumb' +
              (i === 0 ? " gallery-thumb-active" : "") +
              '" role="tab" data-gallery-index="' +
              i +
              '" aria-selected="' +
              (i === 0 ? "true" : "false") +
              '" aria-label="Image ' +
              (i + 1) +
              " of " +
              imgs.length +
              '" tabindex="-1">' +
              '<span class="gallery-thumb-inner">' +
              '<img src="' +
              escapeHtml(src) +
              '" alt="" loading="lazy" referrerpolicy="no-referrer" decoding="async">' +
              "</span></button>"
            );
          })
          .join("") +
        "</div>";
    }

    return (
      '<div class="card-gallery-wrap">' +
      '<div class="card-gallery">' +
      '<div class="gallery-slides">' +
      slidesHtml +
      "</div>" +
      navBlock +
      "</div>" +
      thumbsHtml +
      "</div>"
    );
  }

  /** Mirrors catalog-cart.js buildDescriptionHtml */
  function buildPreviewDescriptionHtml(raw) {
    var normalized = String(raw || "")
      .replace(/\r\n/g, "\n")
      .replace(/\n+/g, " ")
      .trim();
    if (!normalized) return "";
    return (
      '<div class="product-desc product-desc-expandable" data-expanded="false">' +
      '<span class="product-desc-text">' +
      escapeHtml(normalized) +
      '</span><button type="button" class="desc-toggle" hidden>See more</button>' +
      "</div>"
    );
  }

  function formatMoneyPreview(n) {
    var num = Number(n) || 0;
    return "৳ " + num.toLocaleString("en-BD");
  }

  /** Same rules as catalog-cart.js priceDisplay for the single price field */
  function previewPriceFromField(priceStr) {
    var p = priceStr != null ? String(priceStr).trim() : "";
    if (!p) return "—";
    if (p.indexOf("-") !== -1) return "৳ " + p;
    var num = parseFloat(p);
    return formatMoneyPreview(Number.isFinite(num) ? num : 0);
  }

  function initAdminPreviewGallery() {
    var card = $("product-preview-card");
    if (!card) return;
    card.querySelectorAll(".card-gallery").forEach(function (gallery) {
      var slides = gallery.querySelector(".gallery-slides");
      var slideEls = slides ? slides.querySelectorAll(".gallery-slide") : [];
      var total = slideEls.length;
      if (!slides || total < 1) return;

      var wrap = gallery.closest(".card-gallery-wrap");
      var thumbs = wrap ? wrap.querySelectorAll(".gallery-thumb") : [];
      var dots = gallery.querySelectorAll(".gallery-dot");
      var prev = gallery.querySelector(".gallery-prev");
      var next = gallery.querySelector(".gallery-next");
      var current = 0;

      function goTo(n) {
        current = ((n % total) + total) % total;
        slides.style.transform = "translateX(-" + current * 100 + "%)";
        dots.forEach(function (d, i) {
          d.classList.toggle("active", i === current);
        });
        thumbs.forEach(function (t, i) {
          var on = i === current;
          t.classList.toggle("gallery-thumb-active", on);
          t.setAttribute("aria-selected", on ? "true" : "false");
        });
      }

      dots.forEach(function (d, i) {
        d.addEventListener("click", function (e) {
          e.stopPropagation();
          goTo(i);
        });
      });
      thumbs.forEach(function (btn, i) {
        btn.addEventListener("click", function (e) {
          e.stopPropagation();
          e.preventDefault();
          goTo(i);
        });
      });
      if (prev)
        prev.addEventListener("click", function (e) {
          e.stopPropagation();
          goTo(current - 1);
        });
      if (next)
        next.addEventListener("click", function (e) {
          e.stopPropagation();
          goTo(current + 1);
        });
    });
  }

  function initAdminPreviewDescToggles() {
    var card = $("product-preview-card");
    if (!card) return;
    card.querySelectorAll(".product-desc-expandable").forEach(function (block) {
      var textEl = block.querySelector(".product-desc-text");
      var toggle = block.querySelector(".desc-toggle");
      if (!textEl || !toggle) return;
      block.setAttribute("data-expanded", "false");
      toggle.textContent = "See more";
      toggle.hidden = true;
      var overflows = textEl.scrollHeight > textEl.clientHeight + 1;
      if (overflows) toggle.hidden = false;
    });
  }

  function bindAdminPreviewInteractions() {
    var card = $("product-preview-card");
    if (!card || card.getAttribute("data-preview-bound") === "1") return;
    card.setAttribute("data-preview-bound", "1");
    card.addEventListener("click", function (e) {
      var toggle = e.target.closest(".desc-toggle");
      if (!toggle) return;
      e.preventDefault();
      var block = toggle.closest(".product-desc-expandable");
      if (!block) return;
      var expanded = block.getAttribute("data-expanded") === "true";
      block.setAttribute("data-expanded", expanded ? "false" : "true");
      toggle.textContent = expanded ? "See more" : "See less";
    });
    card.addEventListener("change", function (e) {
      var sel = e.target.closest(".variant-select");
      if (!sel || sel.id !== "preview-variant-select") return;
      adminPreviewVariantIx = +sel.value;
      var variants = collectVariantsFromForm();
      var el = $("preview-price");
      if (!el || !variants[adminPreviewVariantIx]) return;
      el.textContent = formatMoneyPreview(variants[adminPreviewVariantIx].price);
    });
  }

  function refreshProductPreview() {
    if (!$("product-preview-card")) return;

    var filled = collectOrderedImageRawStrings().filter(Boolean);
    var mount = $("preview-gallery-mount");
    if (mount) mount.innerHTML = buildPreviewGalleryMountHtml(filled);

    var sku = ($("pf-sku") && $("pf-sku").value.trim()) || "SKU";
    var name = ($("pf-name") && $("pf-name").value.trim()) || "Product name";
    var elSku = $("preview-sku");
    var elName = $("preview-name");
    if (elSku) elSku.textContent = sku;
    if (elName) elName.textContent = name;

    var descEl = $("preview-desc");
    if (descEl) {
      descEl.innerHTML = buildPreviewDescriptionHtml(
        ($("pf-desc") && $("pf-desc").value) || ""
      );
    }

    var variants = collectVariantsFromForm();
    var elPrice = $("preview-price");
    if (variants.length) {
      adminPreviewVariantIx = Math.min(
        Math.max(0, adminPreviewVariantIx),
        variants.length - 1
      );
      var vCur = variants[adminPreviewVariantIx];
      if (elPrice) elPrice.textContent = formatMoneyPreview(vCur.price);
    } else {
      adminPreviewVariantIx = 0;
      if (elPrice)
        elPrice.textContent = previewPriceFromField(
          $("pf-price") && $("pf-price").value
        );
    }

    var chips = $("preview-chips");
    if (chips) {
      var parts = [];
      if ($("pf-new") && $("pf-new").checked) {
        parts.push(
          '<span class="product-chip product-chip-merch product-chip-new">New Arrival</span>'
        );
      }
      if ($("pf-best") && $("pf-best").checked) {
        parts.push(
          '<span class="product-chip product-chip-merch product-chip-best">Best Selling</span>'
        );
      }
      parseTagsInput(($("pf-tags") && $("pf-tags").value) || "").forEach(function (tag) {
        parts.push(
          '<span class="product-chip product-chip-tag">' + escapeHtml(tag) + "</span>"
        );
      });
      if (parts.length) {
        chips.hidden = false;
        chips.innerHTML = parts.join("");
      } else {
        chips.hidden = true;
        chips.innerHTML = "";
      }
    }

    var dims = collectDimensionsFromForm();
    var specEl = $("preview-specs");
    if (specEl) {
      specEl.innerHTML = dims.length
        ? '<div class="spec-wrap">' +
          '<div class="spec-title">স্পেসিফিকেশন</div>' +
          '<div class="spec-tags">' +
          dims
            .slice(0, 12)
            .map(function (d) {
              return '<span class="spec-tag">' + escapeHtml(d) + "</span>";
            })
            .join("") +
          "</div></div>"
        : "";
    }

    var slot = $("preview-variant-slot");
    if (slot) {
      if (variants.length) {
        slot.innerHTML =
          '<div class="variant-row">' +
          '<label class="variant-label" for="preview-variant-select">বিকল্প</label>' +
          '<select class="variant-select" id="preview-variant-select" tabindex="-1">' +
          variants
            .map(function (v, i) {
              return (
                '<option value="' +
                i +
                '">' +
                escapeHtml(v.label || "Option") +
                " — " +
                formatMoneyPreview(v.price) +
                "</option>"
              );
            })
            .join("") +
          "</select></div>";
        var sel = $("preview-variant-select");
        if (sel) {
          sel.value = String(adminPreviewVariantIx);
          if (elPrice) {
            var vx = variants[adminPreviewVariantIx];
            if (vx) elPrice.textContent = formatMoneyPreview(vx.price);
          }
        }
      } else {
        slot.innerHTML = "";
      }
    }

    requestAnimationFrame(function () {
      initAdminPreviewGallery();
      initAdminPreviewDescToggles();
    });
  }

  function categoryOptionValues() {
    var seen = [];
    state.categories.forEach(function (row) {
      var p = row.payload || {};
      var v = p.productCategory;
      if (v && seen.indexOf(v) === -1) seen.push(v);
    });
    state.products.forEach(function (pr) {
      var c = pr.category;
      if (c && seen.indexOf(c) === -1) seen.push(c);
    });
    return seen.sort();
  }

  function renderCategoryList() {
    var ul = $("category-sort-list");
    if (!ul) return;
    var rows = state.categories.slice().sort(function (a, b) {
      return (a.sort_order || 0) - (b.sort_order || 0);
    });
    ul.innerHTML = rows
      .map(function (row, idx) {
        var p = row.payload || {};
        var label = p.navLabel || p.breadcrumbLabel || row.slug;
        return (
          '<li class="cat-sort-item" draggable="true" data-slug="' +
          escapeHtml(row.slug) +
          '" data-index="' +
          idx +
          '">' +
          '<span class="cat-sort-grip">⋮⋮</span>' +
          '<span class="cat-sort-label">' +
          escapeHtml(label) +
          "</span>" +
          '<span class="cat-sort-meta">' +
          escapeHtml(row.slug) +
          "</span></li>"
        );
      })
      .join("");

    var dragSlug = null;
    ul.querySelectorAll(".cat-sort-item").forEach(function (li) {
      li.addEventListener("dragstart", function (e) {
        dragSlug = li.getAttribute("data-slug");
        e.dataTransfer.effectAllowed = "move";
        li.classList.add("dragging");
      });
      li.addEventListener("dragend", function () {
        li.classList.remove("dragging");
        dragSlug = null;
      });
      li.addEventListener("dragover", function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      });
      li.addEventListener("drop", function (e) {
        e.preventDefault();
        if (!dragSlug) return;
        var targetSlug = li.getAttribute("data-slug");
        if (targetSlug === dragSlug) return;
        var order0 = [].slice
          .call(ul.querySelectorAll(".cat-sort-item"))
          .map(function (n) {
            return n.getAttribute("data-slug");
          });
        var from = order0.indexOf(dragSlug);
        var to = order0.indexOf(targetSlug);
        if (from === -1 || to === -1) return;
        var order = order0.slice();
        order.splice(from, 1);
        order.splice(to, 0, dragSlug);
        state.categories = order
          .map(function (slug) {
            return state.categories.find(function (x) {
              return x.slug === slug;
            });
          })
          .filter(Boolean);
        renderCategoryList();
      });
    });
  }

  async function persistCategoryOrder() {
    if (!requireWriteAccess()) return;
    var order = []
      .slice.call($("category-sort-list").querySelectorAll(".cat-sort-item"))
      .map(function (li) {
        return li.getAttribute("data-slug");
      });
    try {
      for (var i = 0; i < order.length; i++) {
        var slug = order[i];
        var r = await api("/rest/v1/categories?slug=eq." + encodeURIComponent(slug), {
          method: "PATCH",
          headersExtra: {
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({ sort_order: i }),
        });
        if (!r.ok) {
          toast(await r.text(), true);
          return;
        }
      }
      toast("Category order saved.");
      await loadAll();
    } catch (err) {
      toast(err.message || String(err), true);
    }
  }

  function productThumbUrl(p) {
    var imgs = p.images;
    if (!Array.isArray(imgs) || !imgs.length) return "";
    var u = imgs[0];
    if (typeof u !== "string") return "";
    var idMatch = u.match(/[?&]id=([^&]+)/);
    if (idMatch) {
      return (
        "https://drive.google.com/thumbnail?id=" + encodeURIComponent(idMatch[1]) + "&sz=w200"
      );
    }
    return u;
  }

  function getFilteredSortedProducts() {
    var catFilter = ($("product-filter-cat") && $("product-filter-cat").value) || "";
    var sortKey = ($("product-sort") && $("product-sort").value) || "sort_order";
    var list = state.products.slice();
    if (catFilter) {
      list = list.filter(function (p) {
        return p.category === catFilter;
      });
    }
    list.sort(function (a, b) {
      if (sortKey === "sort_order") {
        var d = (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0);
        if (d !== 0) return d;
        return (Number(a.id) || 0) - (Number(b.id) || 0);
      }
      if (sortKey === "price") {
        return (Number(a.price) || 0) - (Number(b.price) || 0);
      }
      var sa = String(a[sortKey] || "").toLowerCase();
      var sb = String(b[sortKey] || "").toLowerCase();
      if (sa < sb) return -1;
      if (sa > sb) return 1;
      return 0;
    });
    return list;
  }

  function renderProductTable() {
    var tbody = $("product-table-body");
    if (!tbody) return;
    var list = getFilteredSortedProducts();
    tbody.innerHTML = list
      .map(function (p) {
        var tags = Array.isArray(p.tags) ? p.tags.join(", ") : "";
        var thumb = productThumbUrl(p);
        var thumbHtml = thumb
          ? '<img class="admin-thumb" src="' + escapeHtml(thumb) + '" alt="" loading="lazy">'
          : '<span class="admin-thumb-none">—</span>';
        var active = p.is_active !== false;
        return (
          "<tr>" +
          "<td>" +
          thumbHtml +
          "</td>" +
          "<td>" +
          escapeHtml(p.name || "") +
          "</td>" +
          "<td>" +
          escapeHtml(p.sku || "") +
          "</td>" +
          "<td>" +
          escapeHtml(p.category || "") +
          "</td>" +
          "<td>" +
          escapeHtml(String(p.price != null ? p.price : "")) +
          "</td>" +
          "<td>" +
          escapeHtml(tags) +
          "</td>" +
          '<td class="col-active">' +
          '<label class="toggle toggle-table" title="Visible on storefront">' +
          '<input type="checkbox" class="product-active-toggle" data-id="' +
          p.id +
          '"' +
          (active ? " checked" : "") +
          ">" +
          '<span class="toggle-slider"></span>' +
          "</label>" +
          "</td>" +
          '<td class="admin-actions">' +
          '<button type="button" class="icon-btn" data-act="edit" data-id="' +
          p.id +
          '" aria-label="Edit product">' +
          ICON_EDIT +
          "</button>" +
          '<button type="button" class="icon-btn icon-btn-danger" data-act="del" data-id="' +
          p.id +
          '" aria-label="Delete product">' +
          ICON_DELETE +
          "</button>" +
          "</td>" +
          "</tr>"
        );
      })
      .join("");

    var countEl = $("product-count-label");
    if (countEl) countEl.textContent = String(list.length) + " products";
  }

  function normDimText(x) {
    if (x == null || x === "") return "";
    if (typeof x === "string") return x;
    try {
      return JSON.stringify(x);
    } catch (e) {
      return String(x);
    }
  }

  function clearProductLists() {
    var a = $("pf-images-list");
    var b = $("pf-dimensions-list");
    var c = $("pf-variants-list");
    if (a) a.innerHTML = "";
    if (b) b.innerHTML = "";
    if (c) c.innerHTML = "";
  }

  function appendImageRow(url, skipFocus) {
    var wrap = $("pf-images-list");
    if (!wrap) return;
    var row = document.createElement("div");
    row.className = "list-editor-row";
    var inp = document.createElement("input");
    inp.type = "text";
    inp.className = "pf-in-image admin-input";
    inp.placeholder = "Image URL";
    inp.value = url != null ? String(url) : "";
    inp.autocomplete = "off";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-remove-row";
    btn.setAttribute("data-remove-row", "");
    btn.setAttribute("aria-label", "Remove row");
    btn.textContent = "×";
    row.appendChild(inp);
    row.appendChild(btn);
    wrap.appendChild(row);
    inp.addEventListener("input", scheduleProductPreview);
    inp.addEventListener("paste", function () {
      setTimeout(scheduleProductPreview, 0);
    });
    inp.addEventListener("change", scheduleProductPreview);
    if (!skipFocus) inp.focus();
    requestAnimationFrame(scheduleProductPreview);
  }

  function appendDimensionRow(text, skipFocus) {
    var wrap = $("pf-dimensions-list");
    if (!wrap) return;
    var row = document.createElement("div");
    row.className = "list-editor-row";
    var inp = document.createElement("input");
    inp.type = "text";
    inp.className = "pf-in-dimension admin-input";
    inp.placeholder = "e.g. 12×10 inch";
    inp.value = text != null ? normDimText(text) : "";
    inp.autocomplete = "off";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-remove-row";
    btn.setAttribute("data-remove-row", "");
    btn.setAttribute("aria-label", "Remove row");
    btn.textContent = "×";
    row.appendChild(inp);
    row.appendChild(btn);
    wrap.appendChild(row);
    if (!skipFocus) inp.focus();
  }

  function appendVariantRow(label, price, skipFocus) {
    var wrap = $("pf-variants-list");
    if (!wrap) return;
    var row = document.createElement("div");
    row.className = "list-editor-row variant-row";
    var lab = document.createElement("input");
    lab.type = "text";
    lab.className = "pf-in-variant-label admin-input";
    lab.placeholder = "Label";
    lab.value = label != null ? String(label) : "";
    lab.autocomplete = "off";
    var pr = document.createElement("input");
    pr.type = "text";
    pr.className = "pf-in-variant-price admin-input";
    pr.placeholder = "Price";
    pr.setAttribute("inputmode", "decimal");
    pr.value =
      price != null && price !== ""
        ? String(price)
        : "";
    pr.autocomplete = "off";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-remove-row";
    btn.setAttribute("data-remove-row", "");
    btn.setAttribute("aria-label", "Remove row");
    btn.textContent = "×";
    row.appendChild(lab);
    row.appendChild(pr);
    row.appendChild(btn);
    wrap.appendChild(row);
    if (!skipFocus) lab.focus();
  }

  function populateProductListsFromProduct(p) {
    clearProductLists();
    var imgs = p && Array.isArray(p.images) ? p.images : [];
    imgs.forEach(function (u) {
      var s = typeof u === "string" ? u : "";
      appendImageRow(s ? normalizeImageUrlForStorage(s) : "", true);
    });
    var dims = p && Array.isArray(p.dimensions) ? p.dimensions : [];
    dims.forEach(function (d) {
      appendDimensionRow(d, true);
    });
    var vars = p && Array.isArray(p.variants) ? p.variants : [];
    vars.forEach(function (v) {
      if (v && typeof v === "object") {
        appendVariantRow(v.label, v.price, true);
      }
    });
  }

  function collectImagesFromForm() {
    var nodes = $("pf-images-list")
      ? $("pf-images-list").querySelectorAll(".pf-in-image")
      : [];
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      var s = nodes[i].value.trim();
      if (s) out.push(normalizeImageUrlForStorage(s));
    }
    return out;
  }

  function collectDimensionsFromForm() {
    var nodes = $("pf-dimensions-list")
      ? $("pf-dimensions-list").querySelectorAll(".pf-in-dimension")
      : [];
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      var s = nodes[i].value.trim();
      if (s) out.push(s);
    }
    return out;
  }

  function collectVariantsFromForm() {
    var wrap = $("pf-variants-list");
    if (!wrap) return [];
    var rows = wrap.querySelectorAll(".list-editor-row.variant-row");
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var labEl = row.querySelector(".pf-in-variant-label");
      var prEl = row.querySelector(".pf-in-variant-price");
      var lab = labEl ? labEl.value.trim() : "";
      var pr = prEl ? prEl.value.trim() : "";
      if (!lab && !pr) continue;
      var num = parseFloat(pr);
      if (!Number.isFinite(num)) num = 0;
      out.push({ label: lab || "Option", price: num });
    }
    return out;
  }

  function bindProductDialogListUi() {
    if ($("btn-add-image"))
      $("btn-add-image").addEventListener("click", function () {
        appendImageRow("");
      });
    if ($("btn-add-dimension"))
      $("btn-add-dimension").addEventListener("click", function () {
        appendDimensionRow("");
        scheduleProductPreview();
      });
    if ($("btn-add-variant"))
      $("btn-add-variant").addEventListener("click", function () {
        appendVariantRow("", "");
        scheduleProductPreview();
      });
    var fp = $("form-product");
    if (fp) {
      fp.addEventListener("click", function (e) {
        var t = e.target;
        if (!t || !t.closest) return;
        var rm = t.closest("[data-remove-row]");
        if (!rm) return;
        var row = rm.closest(".list-editor-row");
        if (row && row.parentNode) row.parentNode.removeChild(row);
        scheduleProductPreview();
      });
      fp.addEventListener(
        "focusout",
        function (e) {
          var t = e.target;
          if (t && t.classList && t.classList.contains("pf-in-image")) {
            var n = normalizeImageUrlForStorage(t.value);
            if (n && n !== String(t.value || "").trim()) t.value = n;
            scheduleProductPreview();
          }
        },
        true
      );
      fp.addEventListener(
        "compositionend",
        function (e) {
          if (
            e.target &&
            e.target.classList &&
            e.target.classList.contains("pf-in-image")
          ) {
            scheduleProductPreview();
          }
        },
        true
      );
      /* Inputs live inside <form>, not direct children of <dialog> — bind here for reliable bubbling */
      fp.addEventListener("input", function (e) {
        scheduleProductPreview();
        if (e.target && e.target.id === "pf-sku") refreshSkuFeedback();
      });
      fp.addEventListener("change", function (e) {
        scheduleProductPreview();
        if (e.target && e.target.id === "pf-sku") refreshSkuFeedback();
      });
    }
    var imgList = $("pf-images-list");
    if (imgList) {
      imgList.addEventListener("input", scheduleProductPreview, true);
      imgList.addEventListener("change", scheduleProductPreview, true);
      imgList.addEventListener(
        "paste",
        function () {
          setTimeout(scheduleProductPreview, 0);
        },
        true
      );
    }
    if ($("btn-preview-eye")) {
      $("btn-preview-eye").addEventListener("click", function () {
        var layout = $("dialog-layout");
        if (!layout) return;
        if (window.matchMedia("(min-width: 960px)").matches) {
          var card = $("product-preview-card");
          if (card) card.scrollIntoView({ behavior: "smooth", block: "nearest" });
        } else {
          layout.classList.toggle("dialog-layout--preview-open");
        }
      });
    }
    if ($("btn-close-dialog"))
      $("btn-close-dialog").addEventListener("click", function () {
        $("product-dialog").close();
      });
  }

  function fillCategorySelects() {
    var vals = categoryOptionValues();
    var selF = $("product-filter-cat");
    var selForm = $("pf-category");
    var curF = selF ? selF.value : "";
    var curForm = selForm ? selForm.value : "";
    if (selF) {
      selF.innerHTML =
        '<option value="">All categories</option>' +
        vals
          .map(function (v) {
            return '<option value="' + escapeHtml(v) + '">' + escapeHtml(v) + "</option>";
          })
          .join("");
      if (vals.indexOf(curF) !== -1) selF.value = curF;
    }
    if (selForm) {
      selForm.innerHTML = vals
        .map(function (v) {
          return '<option value="' + escapeHtml(v) + '">' + escapeHtml(v) + "</option>";
        })
        .join("");
      if (vals.indexOf(curForm) !== -1) selForm.value = curForm;
    }
  }

  function openProductForm(id) {
    var dlg = $("product-dialog");
    var isEdit = id != null && id !== "";
    $("pf-edit-id").value = isEdit ? String(id) : "";
    $("product-dialog-title").textContent = isEdit ? "Edit product" : "Add product";
    adminPreviewVariantIx = 0;

    if (!isEdit) {
      $("pf-sku").value = "";
      $("pf-name").value = "";
      $("pf-desc").value = "";
      $("pf-price").value = "";
      $("pf-tags").value = "";
      $("pf-sort").value = "0";
      $("pf-new").checked = false;
      $("pf-best").checked = false;
      if ($("pf-active")) $("pf-active").checked = true;
      clearProductLists();
    } else {
      var p = state.products.find(function (x) {
        return Number(x.id) === Number(id);
      });
      if (!p) {
        toast("Product not found.", true);
        return;
      }
      $("pf-sku").value = p.sku || "";
      $("pf-name").value = p.name || "";
      $("pf-desc").value = p.description || "";
      $("pf-price").value = p.price != null ? String(p.price) : "";
      $("pf-tags").value = Array.isArray(p.tags) ? p.tags.join(", ") : "";
      $("pf-sort").value = String(p.sort_order != null ? p.sort_order : 0);
      $("pf-new").checked = !!p.is_new_arrival;
      $("pf-best").checked = !!p.is_best_selling;
      if ($("pf-active")) $("pf-active").checked = p.is_active !== false;
      populateProductListsFromProduct(p);
    }

    fillCategorySelects();
    if (isEdit) {
      var p2 = state.products.find(function (x) {
        return Number(x.id) === Number(id);
      });
      if (p2 && p2.category && $("pf-category")) $("pf-category").value = p2.category;
    }

    dlg.showModal();
    scheduleProductPreview();
    refreshSkuFeedback();
    try {
      $("pf-sku").focus();
    } catch (e2) {}
  }

  function parseTagsInput(s) {
    return String(s || "")
      .split(",")
      .map(function (x) {
        return x.trim();
      })
      .filter(Boolean);
  }

  async function submitProductForm(e) {
    e.preventDefault();
    if (!requireWriteAccess()) return;
    var idVal = $("pf-edit-id").value;
    var isEdit = idVal !== "";

    refreshSkuFeedback();
    if (
      isSkuTakenByOtherProduct($("pf-sku").value, isEdit ? Number(idVal) : null)
    ) {
      toast("This SKU is already used by another product.", true);
      if ($("pf-sku")) $("pf-sku").focus();
      return;
    }

    var row = {
      sku: $("pf-sku").value.trim(),
      name: $("pf-name").value.trim(),
      category: ($("pf-category") && $("pf-category").value) || "",
      description: $("pf-desc").value,
      price: String($("pf-price").value).trim(),
      sort_order: Number($("pf-sort").value) || 0,
      is_new_arrival: $("pf-new").checked,
      is_best_selling: $("pf-best").checked,
      tags: parseTagsInput($("pf-tags").value),
      images: collectImagesFromForm(),
      dimensions: collectDimensionsFromForm(),
      variants: collectVariantsFromForm(),
      is_active: $("pf-active") ? $("pf-active").checked : true,
    };

    try {
      if (isEdit) {
        var q = "/rest/v1/products?id=eq." + encodeURIComponent(idVal);
        var r = await api(q, {
          method: "PATCH",
          headersExtra: {
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify(row),
        });
        if (!r.ok) {
          toast(await r.text(), true);
          return;
        }
        toast("Product updated.");
      } else {
        var r2 = await api("/rest/v1/products", {
          method: "POST",
          headersExtra: {
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify(row),
        });
        if (!r2.ok) {
          toast(await r2.text(), true);
          return;
        }
        toast("Product created.");
      }
      $("product-dialog").close();
      await loadAll();
    } catch (err) {
      toast(err.message || String(err), true);
    }
  }

  async function setProductActive(id, active, checkboxEl) {
    if (!requireWriteAccess()) {
      if (checkboxEl) checkboxEl.checked = !active;
      return;
    }
    try {
      var r = await api("/rest/v1/products?id=eq." + encodeURIComponent(String(id)), {
        method: "PATCH",
        headersExtra: {
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ is_active: active }),
      });
      if (!r.ok) {
        toast(await r.text(), true);
        if (checkboxEl) checkboxEl.checked = !active;
        return;
      }
      var p = state.products.find(function (x) {
        return Number(x.id) === Number(id);
      });
      if (p) p.is_active = active;
    } catch (err) {
      toast(err.message || String(err), true);
      if (checkboxEl) checkboxEl.checked = !active;
    }
  }

  async function deleteProduct(id) {
    if (!requireWriteAccess()) return;
    if (!confirm("Delete this product permanently?")) return;
    var r = await api("/rest/v1/products?id=eq." + encodeURIComponent(String(id)), {
      method: "DELETE",
      headersExtra: { Prefer: "return=minimal" },
    });
    if (!r.ok) {
      toast(await r.text(), true);
      return;
    }
    toast("Product deleted.");
    await loadAll();
  }

  async function loadAll() {
    var rc = await api(
      "/rest/v1/categories?select=slug,sort_order,payload&order=sort_order.asc"
    );
    if (!rc.ok) {
      toast(await rc.text(), true);
      return;
    }
    state.categories = await rc.json();

    var rp = await api("/rest/v1/products?select=*&order=sort_order.asc,id.asc");
    if (!rp.ok) {
      toast(await rp.text(), true);
      return;
    }
    var raw = await rp.json();
    state.products = (raw || []).map(function (row) {
      return {
        id: row.id,
        category: row.category,
        sku: row.sku,
        name: row.name,
        description: row.description,
        price: row.price,
        dimensions: row.dimensions,
        variants: row.variants,
        images: row.images,
        tags: Array.isArray(row.tags) ? row.tags : [],
        is_new_arrival: !!row.is_new_arrival,
        is_best_selling: !!row.is_best_selling,
        sort_order: row.sort_order != null ? Number(row.sort_order) : 0,
        is_active: row.is_active !== false,
      };
    });

    fillCategorySelects();
    renderCategoryList();
    renderProductTable();
  }

  function bindProductTableEvents() {
    var tbody = $("product-table-body");
    if (!tbody) return;
    tbody.addEventListener("click", function (e) {
      var editBtn = e.target.closest("button[data-act='edit']");
      var delBtn = e.target.closest("button[data-act='del']");
      if (editBtn) {
        openProductForm(Number(editBtn.getAttribute("data-id")));
        return;
      }
      if (delBtn) {
        deleteProduct(Number(delBtn.getAttribute("data-id")));
      }
    });
    tbody.addEventListener("change", function (e) {
      var t = e.target;
      if (!t || !t.classList || !t.classList.contains("product-active-toggle")) return;
      var id = Number(t.getAttribute("data-id"));
      setProductActive(id, t.checked, t);
    });
  }

  function bindTabs() {
    document.querySelectorAll("[data-admin-tab]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var tab = btn.getAttribute("data-admin-tab");
        document.querySelectorAll("[data-admin-tab]").forEach(function (b) {
          b.classList.toggle("active", b.getAttribute("data-admin-tab") === tab);
        });
        document.querySelectorAll("[data-admin-pane]").forEach(function (pane) {
          pane.hidden = pane.getAttribute("data-admin-pane") !== tab;
        });
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initCfg();
    if (!cfg.base) {
      toast("Missing Supabase URL. Check configuration.", true);
      return;
    }
    if (!hasApiKey()) {
      toast(
        "No API key configured. Add the Supabase anon key for browsing or the service role key for edits.",
        true
      );
      return;
    }
    if (!hasServiceRole()) {
      toast(
        "Using anon key: listing works, but writes are blocked. " + writeAccessHint(),
        false
      );
    }

    bindTabs();
    bindProductTableEvents();
    bindProductDialogListUi();
    bindAdminPreviewInteractions();

    $("btn-save-categories").addEventListener("click", persistCategoryOrder);
    $("btn-add-product").addEventListener("click", function () {
      openProductForm(null);
    });
    $("btn-cancel-product").addEventListener("click", function () {
      $("product-dialog").close();
    });
    $("form-product").addEventListener("submit", submitProductForm);

    if ($("product-filter-cat"))
      $("product-filter-cat").addEventListener("change", renderProductTable);
    if ($("product-sort")) $("product-sort").addEventListener("change", renderProductTable);

    loadAll().catch(function (err) {
      toast(err.message || String(err), true);
    });
  });
})();
