/**
 * TipTop — load products from Supabase, pagination, galleries, cart with variant dropdowns.
 *
 * Optional: set window.SHOPCRAFT_DRIVE_PROXY = "http://localhost:3000/api/drive-image"
 * before this script when using the Next.js proxy in drive-proxy/ (same-origin in production).
 */
(function () {
  var STORAGE_KEY = "shopcraft_cart_v1";
  var MESSENGER_BASE = "https://m.me/YOUR_PAGE_USERNAME";
  var PER_PAGE = 16;

  /** If category metadata is missing, map ?c= slug → product category label. */
  var SLUG_FALLBACK_PRODUCT_CATEGORY = {
    "plant-hub": "PLANT HUB",
    kitchen: "Kitchen Essentials",
    home: "Home Essentials",
    wall: "Wall Organizers",
    wood: "Artisan Wood Craft",
    decor: null,
  };

  var productsCatalog = [];
  var productsById = new Map();
  var categoriesBySlug = new Map();

  function initCategoryMaps(list) {
    categoriesBySlug.clear();
    (list || []).forEach(function (c) {
      if (c && c.slug) categoriesBySlug.set(c.slug, c);
    });
  }

  function getActiveCategoryDef() {
    var params = new URLSearchParams(window.location.search || "");
    var slug = params.get("c") || params.get("category");

    if (slug) {
      if (categoriesBySlug.has(slug)) return categoriesBySlug.get(slug);
      if (categoriesBySlug.size > 0) return null;
      if (Object.prototype.hasOwnProperty.call(SLUG_FALLBACK_PRODUCT_CATEGORY, slug)) {
        var fb = SLUG_FALLBACK_PRODUCT_CATEGORY[slug];
        return {
          slug: slug,
          productCategory: fb,
          breadcrumbLabel: slug,
          pageTitle: slug,
          subtitle: "",
          emptyMessage:
            fb === null
              ? "এই বিভাগের জন্য এখনও পণ্য যোগ করা হয়নি।"
              : undefined,
        };
      }
      return null;
    }

    if (
      typeof window.SHOPCRAFT_CATEGORY_SLUG === "string" &&
      categoriesBySlug.has(window.SHOPCRAFT_CATEGORY_SLUG)
    ) {
      return categoriesBySlug.get(window.SHOPCRAFT_CATEGORY_SLUG);
    }

    return null;
  }

  function applyCategoryHero(catDef) {
    if (!catDef) return;
    var crumb = document.getElementById("catalog-breadcrumb-current");
    if (crumb && catDef.breadcrumbLabel) crumb.textContent = catDef.breadcrumbLabel;
    var t = document.getElementById("catalog-page-title");
    if (t && catDef.pageTitle) t.textContent = catDef.pageTitle;
    var s = document.getElementById("catalog-page-subtitle");
    if (s && catDef.subtitle != null) s.textContent = catDef.subtitle;
    var dt = catDef.documentTitle || catDef.breadcrumbLabel || catDef.slug || "TipTop";
    document.title = dt + " — TipTop";
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /** Extract Google Drive file id from common URL shapes. */
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
   * Prefer thumbnail endpoint (works reliably for many public files vs uc?export=view).
   * If window.SHOPCRAFT_DRIVE_PROXY is set (Next.js /api/drive-image), use that instead.
   */
  function resolveCatalogImageUrl(originalUrl) {
    if (!originalUrl || typeof originalUrl !== "string") return originalUrl;
    var id = extractGoogleDriveFileId(originalUrl);
    if (!id) return originalUrl;
    var proxy =
      typeof window !== "undefined" && window.SHOPCRAFT_DRIVE_PROXY
        ? String(window.SHOPCRAFT_DRIVE_PROXY).replace(/\/?$/, "")
        : "";
    if (proxy) {
      return proxy + "?id=" + encodeURIComponent(id);
    }
    return (
      "https://drive.google.com/thumbnail?id=" +
      encodeURIComponent(id) +
      "&sz=w1920"
    );
  }

  function buildDescriptionHtml(p) {
    var normalized = (p.description || "").replace(/\r\n/g, "\n").replace(/\n+/g, " ").trim();
    if (!normalized) return "";
    return (
      '<div class="product-desc product-desc-expandable" data-expanded="false">' +
      '<span class="product-desc-text">' +
      escapeHtml(normalized) +
      '</span><button type="button" class="desc-toggle" hidden>See more</button>' +
      "</div>"
    );
  }

  function buildMerchChips(p) {
    var parts = [];
    if (p.is_new_arrival) {
      parts.push(
        '<span class="product-chip product-chip-merch product-chip-new">New Arrival</span>'
      );
    }
    if (p.is_best_selling) {
      parts.push(
        '<span class="product-chip product-chip-merch product-chip-best">Best Selling</span>'
      );
    }
    if (Array.isArray(p.tags)) {
      p.tags.forEach(function (t) {
        var s = String(t || "").trim();
        if (s) parts.push('<span class="product-chip product-chip-tag">' + escapeHtml(s) + "</span>");
      });
    }
    if (!parts.length) return "";
    return (
      '<div class="product-chips" aria-label="Product tags">' + parts.join("") + "</div>"
    );
  }

  function buildSpecificationsHtml(p) {
    var tags = [];
    if (Array.isArray(p.specifications)) tags = p.specifications;
    else if (Array.isArray(p.dimensions)) tags = p.dimensions;
    tags = tags
      .map(function (t) {
        return String(t || "").trim();
      })
      .filter(Boolean);
    if (!tags.length) return "";
    return (
      '<div class="spec-wrap">' +
      '<div class="spec-title">স্পেসিফিকেশন</div>' +
      '<div class="spec-tags">' +
      tags
        .map(function (t) {
          return '<span class="spec-tag">' + escapeHtml(t) + "</span>";
        })
        .join("") +
      "</div></div>"
    );
  }

  function formatMoney(n) {
    var num = Number(n) || 0;
    return "৳ " + num.toLocaleString("en-BD");
  }

  function unitPrice(product, variantIndex) {
    if (product.variants && product.variants.length) {
      var v = product.variants[variantIndex] || product.variants[0];
      return Number(v.price) || 0;
    }
    var p = product.price;
    if (typeof p === "number") return p;
    if (typeof p === "string") {
      var first = p.match(/\d+/);
      return first ? parseInt(first[0], 10) : 0;
    }
    return 0;
  }

  function priceDisplay(product, variantIndex) {
    if (product.variants && product.variants.length) {
      var v = product.variants[variantIndex] || product.variants[0];
      return formatMoney(v.price);
    }
    if (typeof product.price === "string" && String(product.price).indexOf("-") !== -1) {
      return "৳ " + product.price;
    }
    return formatMoney(product.price);
  }

  function lineKey(productId, variantIndex) {
    return String(productId) + ":" + String(variantIndex);
  }

  function loadCart() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveCart(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  function mergeCartDuplicates(cart) {
    var map = new Map();
    cart.forEach(function (line) {
      var k = lineKey(line.productId, line.variantIndex);
      if (!map.has(k)) map.set(k, { productId: line.productId, variantIndex: line.variantIndex, qty: line.qty });
      else map.get(k).qty += line.qty;
    });
    return Array.from(map.values());
  }

  function findProduct(id) {
    return productsById.get(Number(id));
  }

  function renderProductCard(p) {
    var hasVariants = p.variants && p.variants.length > 0;
    var imgs = p.images && p.images.length ? p.images : [];
    var slidesHtml = imgs.length
      ? imgs
          .map(function (url) {
            var src = resolveCatalogImageUrl(url);
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
        '<button type="button" class="gallery-nav gallery-prev">&#8249;</button>' +
        '<button type="button" class="gallery-nav gallery-next">&#8250;</button>';
    } else {
      navBlock = '<div class="gallery-dots"><div class="gallery-dot active"></div></div>';
    }

    var thumbsHtml = "";
    if (imgs.length > 1) {
      thumbsHtml =
        '<div class="gallery-thumbs" role="tablist" aria-label="Product images">' +
        imgs
          .map(function (url, i) {
            var src = resolveCatalogImageUrl(url);
            return (
              '<button type="button" class="gallery-thumb' +
              (i === 0 ? " gallery-thumb-active" : "") +
              '" role="tab" data-gallery-index="' +
              i +
              '" aria-selected="' +
              (i === 0 ? "true" : "false") +
              '" aria-label="Image ' +
              (i + 1) +
              ' of ' +
              imgs.length +
              '">' +
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

    var gallerySection =
      '<div class="card-gallery-wrap">' +
      '<div class="card-gallery">' +
      '<div class="gallery-slides">' +
      slidesHtml +
      "</div>" +
      navBlock +
      "</div>" +
      thumbsHtml +
      "</div>";

    var variantSelect = "";
    if (hasVariants) {
      variantSelect =
        '<div class="variant-row">' +
        '<label class="variant-label" for="var-' +
        p.id +
        '">বিকল্প</label>' +
        '<select class="variant-select" id="var-' +
        p.id +
        '" data-product-id="' +
        p.id +
        '">' +
        p.variants
          .map(function (v, i) {
            return (
              '<option value="' +
              i +
              '">' +
              escapeHtml(v.label) +
              " — " +
              formatMoney(v.price) +
              "</option>"
            );
          })
          .join("") +
        "</select>" +
        "</div>";
    }

    return (
      '<div class="product-card" data-product-id="' +
      p.id +
      '">' +
      gallerySection +
      '<div class="card-body">' +
      buildMerchChips(p) +
      '<div class="product-code">' +
      escapeHtml(p.sku) +
      "</div>" +
      '<div class="product-name">' +
      escapeHtml(p.name) +
      "</div>" +
      buildDescriptionHtml(p) +
      buildSpecificationsHtml(p) +
      variantSelect +
      '<div class="card-footer">' +
      '<div class="product-price" data-product-id="' +
      p.id +
      '" data-role="price">' +
      priceDisplay(p, 0) +
      "</div>" +
      '<button type="button" class="add-cart-btn" data-product-id="' +
      p.id +
      '">কার্টে যোগ করুন</button>' +
      "</div>" +
      "</div>" +
      "</div>"
    );
  }

  function updatePageMeta(count, list) {
    var skuText = "";
    if (list && list.length) {
      var skus = list
        .map(function (p) {
          return p.sku;
        })
        .sort();
      skuText = skus[0] + " to " + skus[skus.length - 1];
    }
    var elCount = document.getElementById("catalog-count-products");
    var elSku = document.getElementById("catalog-sku-range");
    if (elCount) elCount.textContent = count + " Products";
    if (elSku) elSku.textContent = skuText;

    var meta = document.querySelector(".page-meta");
    if (!meta) return;
    if (elCount && elSku) return;

    var spans = meta.querySelectorAll(".product-count");
    if (spans[0]) spans[0].textContent = count + " Products";
    if (spans[1]) spans[1].textContent = skuText;
  }

  function initGalleries(container) {
    container.querySelectorAll(".card-gallery").forEach(function (gallery) {
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

      var autoTimer;
      gallery.addEventListener("mouseenter", function () {
        clearInterval(autoTimer);
      });
      gallery.addEventListener("mouseleave", function () {
        if (total > 1)
          autoTimer = setInterval(function () {
            goTo(current + 1);
          }, 3000);
      });
    });
  }

  function initPagination(grid, paginationEl) {
    var currentPage = 1;

    function allCards() {
      return Array.from(grid.querySelectorAll(".product-card"));
    }

    function showPage(page) {
      var cards = allCards();
      var tp = Math.max(1, Math.ceil(cards.length / PER_PAGE));
      currentPage = Math.min(Math.max(1, page), tp);
      cards.forEach(function (c, i) {
        c.style.display = i >= (currentPage - 1) * PER_PAGE && i < currentPage * PER_PAGE ? "" : "none";
      });
      paginationEl.querySelectorAll(".page-btn[data-page]").forEach(function (btn) {
        btn.classList.toggle("active", +btn.dataset.page === currentPage);
      });
      var prevBtn = document.getElementById("btn-prev");
      var nextBtn = document.getElementById("btn-next");
      if (prevBtn) prevBtn.disabled = currentPage === 1;
      if (nextBtn) nextBtn.disabled = currentPage === tp;
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function rebuild() {
      var cards = allCards();
      var tp = Math.ceil(cards.length / PER_PAGE) || 1;
      if (!cards.length || tp <= 1) {
        paginationEl.innerHTML = "";
        cards.forEach(function (c) {
          c.style.display = "";
        });
        return;
      }
      var nums = Array.from({ length: tp }, function (_, i) {
        return (
          '<button type="button" class="page-btn" data-page="' +
          (i + 1) +
          '">' +
          (i + 1) +
          "</button>"
        );
      }).join("");
      paginationEl.innerHTML =
        '<button type="button" class="page-btn" id="btn-prev">‹</button>' + nums + '<button type="button" class="page-btn" id="btn-next">›</button>';

      paginationEl.querySelectorAll(".page-btn[data-page]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          showPage(+btn.dataset.page);
        });
      });
      document.getElementById("btn-prev").addEventListener("click", function () {
        showPage(currentPage - 1);
      });
      document.getElementById("btn-next").addEventListener("click", function () {
        showPage(currentPage + 1);
      });
      currentPage = 1;
      showPage(1);
    }

    rebuild();
  }

  function bindProductInteractions(grid) {
    grid.addEventListener("change", function (e) {
      var sel = e.target.closest(".variant-select");
      if (!sel) return;
      var id = +sel.dataset.productId;
      var p = findProduct(id);
      if (!p) return;
      var vi = +sel.value;
      var card = sel.closest(".product-card");
      var priceEl = card.querySelector('[data-role="price"]');
      if (priceEl) priceEl.textContent = priceDisplay(p, vi);
    });

    grid.addEventListener("click", function (e) {
      var toggle = e.target.closest(".desc-toggle");
      if (toggle) {
        e.preventDefault();
        var block = toggle.closest(".product-desc-expandable");
        if (!block) return;
        var expanded = block.getAttribute("data-expanded") === "true";
        block.setAttribute("data-expanded", expanded ? "false" : "true");
        toggle.textContent = expanded ? "See more" : "See less";
        return;
      }

      var btn = e.target.closest(".add-cart-btn");
      if (!btn) return;
      var id = +btn.dataset.productId;
      var p = findProduct(id);
      if (!p) return;
      var variantIndex = 0;
      var card = btn.closest(".product-card");
      var s = card.querySelector(".variant-select");
      if (s) variantIndex = +s.value;
      addCartLine(id, variantIndex, 1);
    });
  }

  function initDescriptionToggles(grid) {
    grid.querySelectorAll(".product-desc-expandable").forEach(function (block) {
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

  function addCartLine(productId, variantIndex, qty) {
    var cart = loadCart();
    var k = lineKey(productId, variantIndex);
    var existing = cart.find(function (l) {
      return lineKey(l.productId, l.variantIndex) === k;
    });
    if (existing) existing.qty += qty;
    else cart.push({ productId: productId, variantIndex: variantIndex, qty: qty });
    saveCart(cart);
    renderCart();
    refreshCartBadge();
  }

  function setLineQty(index, qty) {
    var cart = loadCart();
    if (!cart[index]) return;
    cart[index].qty = Math.max(1, qty);
    saveCart(cart);
    renderCart();
    refreshCartBadge();
  }

  function removeLine(index) {
    var cart = loadCart();
    cart.splice(index, 1);
    saveCart(cart);
    renderCart();
    refreshCartBadge();
  }

  function changeLineVariant(lineIndex, newVariantIndex) {
    var cart = loadCart();
    var line = cart[lineIndex];
    if (!line) return;
    line.variantIndex = Number(newVariantIndex);
    cart = mergeCartDuplicates(cart);
    saveCart(cart);
    renderCart();
    refreshCartBadge();
  }

  function cartTotals() {
    var cart = loadCart();
    var total = 0;
    cart.forEach(function (line) {
      var p = findProduct(line.productId);
      if (!p) return;
      total += unitPrice(p, line.variantIndex) * line.qty;
    });
    return total;
  }

  function buildMessengerLink() {
    var cart = loadCart();
    var lines = [];
    var sum = 0;
    cart.forEach(function (line) {
      var p = findProduct(line.productId);
      if (!p) return;
      var variantLabel = "";
      if (p.variants && p.variants.length) {
        var v = p.variants[line.variantIndex] || p.variants[0];
        variantLabel = " (" + v.label + ")";
      }
      var u = unitPrice(p, line.variantIndex);
      sum += u * line.qty;
      lines.push(line.qty + "× " + p.sku + " " + p.name + variantLabel + " @ " + formatMoney(u));
    });
    var text =
      "Hi! I want to order:\n" + lines.join("\n") + "\nTotal: " + formatMoney(sum);
    return MESSENGER_BASE + "?text=" + encodeURIComponent(text);
  }

  function renderCart() {
    var root = document.getElementById("cart-lines");
    var totalEl = document.getElementById("cart-total");
    var checkout = document.getElementById("cart-checkout");
    if (!root) return;

    var cart = loadCart();
    if (!cart.length) {
      root.innerHTML = '<p class="cart-empty">আপনার কার্ট খালি।</p>';
      if (totalEl) totalEl.textContent = formatMoney(0);
      if (checkout) checkout.href = MESSENGER_BASE;
      return;
    }

    root.innerHTML = cart
      .map(function (line, idx) {
        var p = findProduct(line.productId);
        if (!p)
          return (
            '<div class="cart-line cart-line-stale"><span>আইটেম আর নেই</span><button type="button" class="cart-remove" data-line="' +
            idx +
            '">×</button></div>'
          );

        var hasV = p.variants && p.variants.length;
        var variantBlock = "";
        if (hasV) {
          variantBlock =
            '<select class="cart-variant-select" data-line-index="' +
            idx +
            '" aria-label="বিকল্প">' +
            p.variants
              .map(function (v, i) {
                return (
                  '<option value="' +
                  i +
                  '"' +
                  (i === line.variantIndex ? " selected" : "") +
                  ">" +
                  escapeHtml(v.label) +
                  " — " +
                  formatMoney(v.price) +
                  "</option>"
                );
              })
              .join("") +
            "</select>";
        }

        var subtotal = unitPrice(p, line.variantIndex) * line.qty;
        return (
          '<div class="cart-line" data-line-index="' +
          idx +
          '">' +
          '<div class="cart-line-body">' +
          '<div class="cart-line-title">' +
          escapeHtml(p.sku) +
          " — " +
          escapeHtml(p.name) +
          "</div>" +
          variantBlock +
          '<div class="cart-line-controls">' +
          '<button type="button" class="cart-qty-btn" data-act="dec" data-line="' +
          idx +
          '">−</button>' +
          '<span class="cart-qty-num">' +
          line.qty +
          "</span>" +
          '<button type="button" class="cart-qty-btn" data-act="inc" data-line="' +
          idx +
          '">+</button>' +
          '<button type="button" class="cart-remove" data-act="remove" data-line="' +
          idx +
          '">মুছুন</button>' +
          "</div>" +
          "</div>" +
          '<div class="cart-line-price">' +
          formatMoney(subtotal) +
          "</div>" +
          "</div>"
        );
      })
      .join("");

    if (totalEl) totalEl.textContent = formatMoney(cartTotals());
    if (checkout) checkout.href = buildMessengerLink();
  }

  function refreshCartBadge() {
    var badge = document.getElementById("cart-badge");
    if (!badge) return;
    var n = loadCart().reduce(function (a, l) {
      return a + l.qty;
    }, 0);
    badge.textContent = String(n);
    badge.hidden = n === 0;
  }

  function injectCartUi() {
    if (document.getElementById("cart-root")) return;

    var headerRight = document.querySelector(".header-right");
    if (headerRight) {
      var toggle = document.createElement("button");
      toggle.type = "button";
      toggle.id = "cart-toggle-header";
      toggle.className = "cart-toggle-header";
      toggle.setAttribute("aria-expanded", "false");
      toggle.innerHTML =
        '<span class="cart-toggle-icon" aria-hidden="true">🛒</span><span id="cart-badge" class="cart-badge" hidden>0</span>';
      headerRight.insertBefore(toggle, headerRight.firstChild);
    }

    var root = document.createElement("div");
    root.id = "cart-root";
    root.innerHTML =
      '<aside id="cart-panel" class="cart-panel" aria-hidden="true">' +
      '<div class="cart-panel-header">' +
      "<h2>কার্ট</h2>" +
      '<button type="button" id="cart-close" class="cart-close" aria-label="বন্ধ">×</button>' +
      "</div>" +
      '<div id="cart-lines" class="cart-lines"></div>' +
      '<div class="cart-footer">' +
      '<div class="cart-total-row"><span>মোট</span><span id="cart-total">৳ 0</span></div>' +
      '<a id="cart-checkout" class="cart-checkout-btn" href="' +
      MESSENGER_BASE +
      '" target="_blank" rel="noopener">💬 Messenger এ অর্ডার</a>' +
      "</div>" +
      "</aside>" +
      '<div id="cart-backdrop" class="cart-backdrop" hidden></div>';

    document.body.appendChild(root);
  }

  function setCartOpen(open) {
    var panel = document.getElementById("cart-panel");
    var backdrop = document.getElementById("cart-backdrop");
    var toggle = document.getElementById("cart-toggle-header");
    if (!panel) return;
    panel.classList.toggle("cart-panel-open", open);
    panel.setAttribute("aria-hidden", open ? "false" : "true");
    if (backdrop) {
      backdrop.hidden = !open;
    }
    if (toggle) toggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) renderCart();
    document.body.style.overflow = open ? "hidden" : "";
  }

  function attachCartEvents() {
    document.body.addEventListener("click", function (e) {
      var t = e.target;
      if (t.closest("#cart-toggle-header")) {
        e.preventDefault();
        var panel = document.getElementById("cart-panel");
        var open = !(panel && panel.classList.contains("cart-panel-open"));
        setCartOpen(open);
        return;
      }
      if (t.id === "cart-close") {
        setCartOpen(false);
        return;
      }
      if (t.id === "cart-backdrop") {
        setCartOpen(false);
        return;
      }
    });

    document.body.addEventListener("change", function (e) {
      var sel = e.target.closest(".cart-variant-select");
      if (!sel) return;
      var idx = +sel.dataset.lineIndex;
      changeLineVariant(idx, +sel.value);
    });

    document.body.addEventListener("click", function (e) {
      var btn = e.target.closest(".cart-qty-btn, .cart-remove");
      if (!btn || !btn.closest("#cart-lines")) return;
      var line = +btn.dataset.line;
      if (btn.dataset.act === "remove" || btn.classList.contains("cart-remove")) {
        removeLine(line);
        return;
      }
      var cart = loadCart();
      var cur = cart[line];
      if (!cur) return;
      if (btn.dataset.act === "inc") setLineQty(line, cur.qty + 1);
      else if (btn.dataset.act === "dec") setLineQty(line, cur.qty - 1);
    });
  }

  function fetchCategoriesDoc() {
    if (typeof ShopcraftApi !== "undefined" && ShopcraftApi.supabaseActive()) {
      return ShopcraftApi.fetchCategoriesJson().catch(function () {
        return { categories: [] };
      });
    }
    return Promise.resolve({ categories: [] });
  }

  function fetchProductsDoc() {
    if (typeof ShopcraftApi !== "undefined" && ShopcraftApi.supabaseActive()) {
      return ShopcraftApi.fetchProductsJson();
    }
    return Promise.reject(new Error("supabase_not_configured"));
  }

  document.addEventListener("DOMContentLoaded", function () {
    var grid = document.getElementById("productGrid");
    var pagination = document.getElementById("pagination");
    if (!grid || !pagination) return;

    injectCartUi();
    attachCartEvents();
    renderCart();
    refreshCartBadge();

    Promise.all([fetchCategoriesDoc(), fetchProductsDoc()])
      .then(function (pair) {
        initCategoryMaps((pair[0] && pair[0].categories) || []);
        var data = pair[1];
        productsCatalog = data.products || [];
        productsById = new Map(
          productsCatalog.map(function (p) {
            return [p.id, p];
          })
        );

        var catDef = getActiveCategoryDef();
        if (!catDef) {
          applyCategoryHero({
            breadcrumbLabel: "Categories",
            pageTitle: "Pick a category",
            subtitle: "চালিয়ে যেতে হোম থেকে একটি কালেকশন বেছে নিন।",
            documentTitle: "Categories",
          });
          grid.innerHTML =
            '<p class="catalog-empty"><a href="index.html">← হোমে ফিরে ক্যাটাগরি বেছে নিন</a></p>';
          pagination.innerHTML = "";
          updatePageMeta(0, []);
          return;
        }

        applyCategoryHero(catDef);

        var pc = catDef.productCategory;
        if (pc === null || pc === undefined) {
          grid.innerHTML =
            '<p class="catalog-empty">' +
            escapeHtml(
              catDef.emptyMessage ||
                "এই পাতায় এখনও পণ্য সংযুক্ত নয়। ডাটাবেসে ক্যাটাগরি মিলিয়ে দেখুন।"
            ) +
            "</p>";
          pagination.innerHTML = "";
          updatePageMeta(0, []);
          return;
        }

        var list = productsCatalog.filter(function (p) {
          return p.category === pc;
        });
        list.sort(function (a, b) {
          var d = (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0);
          if (d !== 0) return d;
          return (Number(a.id) || 0) - (Number(b.id) || 0);
        });
        updatePageMeta(list.length, list);

        if (!list.length) {
          grid.innerHTML =
            '<p class="catalog-empty">এই বিভাগে এখনও কোনো পণ্য নেই। Supabase products টেবিল চেক করুন।</p>';
          pagination.innerHTML = "";
          return;
        }

        grid.innerHTML = list.map(renderProductCard).join("");
        initGalleries(grid);
        initDescriptionToggles(grid);
        initPagination(grid, pagination);
        bindProductInteractions(grid);
      })
      .catch(function () {
        grid.innerHTML =
          '<p class="catalog-error">পণ্য তালিকা লোড করা যায়নি। Supabase কানেকশন ও shopcraft-supabase-config.js চেক করুন।</p>';
      });
  });
})();
