/**
 * Index page — category grid, footer links, hero blurb (shopcraft-api.js).
 * Header category pills: site-nav-categories.js + ShopcraftNav.renderCategoryLinks.
 */
(function () {
  var mount = document.getElementById("category-grid-mount");
  var footerMount = document.getElementById("footer-category-links");
  var heroBlurb = document.getElementById("hero-category-blurb");
  if (!mount) return;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function skuRangeLabel(products) {
    if (!products.length) return "No products yet";
    var skus = products
      .map(function (p) {
        return p.sku;
      })
      .sort();
    return skus[0] + " – " + skus[skus.length - 1];
  }

  function fetchCategoriesDoc() {
    if (typeof ShopcraftApi !== "undefined" && ShopcraftApi.supabaseActive()) {
      return ShopcraftApi.fetchCategoriesJson();
    }
    return Promise.reject(new Error("supabase_not_configured"));
  }

  function fetchProductsDoc() {
    if (typeof ShopcraftApi !== "undefined" && ShopcraftApi.supabaseActive()) {
      return ShopcraftApi.fetchProductsJson();
    }
    return Promise.reject(new Error("supabase_not_configured"));
  }

  Promise.all([fetchCategoriesDoc(), fetchProductsDoc()])
    .then(function (pair) {
      var catDoc = pair[0];
      var prodDoc = pair[1];
      var defs = (catDoc.categories || []).filter(function (c) {
        return c.listOnHomepage !== false;
      });
      var products = prodDoc.products || [];

      if (typeof ShopcraftNav !== "undefined" && ShopcraftNav.renderCategoryLinks) {
        ShopcraftNav.renderCategoryLinks(defs);
      }

      defs.forEach(function (c) {
        if (c.showInNav === false || !footerMount) return;
        var a = document.createElement("a");
        a.href = "category.html?c=" + encodeURIComponent(c.slug);
        a.textContent = c.navLabel || c.breadcrumbLabel || c.slug;
        footerMount.appendChild(a);
      });

      var cardsHtml = defs
        .map(function (c) {
          var list = !c.productCategory
            ? []
            : products.filter(function (p) {
                return p.category === c.productCategory;
              });
          var countLine =
            list.length + " Products · " + skuRangeLabel(list);
          var emoji = c.cardEmoji || "📦";
          var grad = c.cardGradient || "linear-gradient(135deg, #f5f2ec 0%, #e8e4dc 100%)";
          return (
            '<a href="category.html?c=' +
            encodeURIComponent(c.slug) +
            '" class="category-card">' +
            '<div class="category-img-placeholder" style="background:' +
            escapeHtml(grad) +
            '">' +
            emoji +
            "</div>" +
            '<div class="category-body">' +
            "<div>" +
            '<div class="category-name">' +
            escapeHtml(c.breadcrumbLabel || c.pageTitle || c.slug) +
            "</div>" +
            '<div class="category-count">' +
            escapeHtml(countLine) +
            "</div>" +
            "</div>" +
            '<div class="view-btn">View All →</div>' +
            "</div>" +
            "</a>"
          );
        })
        .join("");

      mount.innerHTML = cardsHtml;

      if (heroBlurb) {
        heroBlurb.textContent =
          "Browse our hand-picked collection across " +
          defs.length +
          " categories. Order directly via Facebook Messenger.";
      }
    })
    .catch(function () {
      mount.innerHTML =
        '<p class="catalog-error" style="grid-column:1/-1;text-align:center;color:#6b6b6b;">ক্যাটাগরি লোড করা যায়নি। Supabase কানেকশন ও shopcraft-supabase-config.js চেক করুন।</p>';
    });
})();
