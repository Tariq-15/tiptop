/**
 * Index page — categories and product counts from Supabase (shopcraft-api.js).
 */
(function () {
  var mount = document.getElementById("category-grid-mount");
  var navMount = document.getElementById("nav-category-links");
  var navMoreRoot = document.getElementById("nav-more");
  var navMoreBtn = document.getElementById("nav-more-btn");
  var navMoreMenu = document.getElementById("nav-more-menu");
  var navLinksWrap = navMount ? navMount.parentElement : null;
  var messengerBtn = document.querySelector(".nav-shell .messenger-btn");
  var footerMount = document.getElementById("footer-category-links");
  var heroBlurb = document.getElementById("hero-category-blurb");
  if (!mount) return;
  var navItems = [];

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

  function closeMoreMenu() {
    if (!navMoreRoot || !navMoreBtn || !navMoreMenu) return;
    navMoreBtn.setAttribute("aria-expanded", "false");
    navMoreMenu.classList.remove("nav-more-menu-open");
  }

  function openMoreMenu() {
    if (!navMoreRoot || !navMoreBtn || !navMoreMenu) return;
    navMoreBtn.setAttribute("aria-expanded", "true");
    navMoreMenu.classList.add("nav-more-menu-open");
  }

  function buildOverflowMenu(overflow) {
    if (!navMoreRoot || !navMoreMenu) return;
    if (!overflow.length) {
      navMoreRoot.hidden = true;
      navMoreMenu.innerHTML = "";
      closeMoreMenu();
      return;
    }
    navMoreRoot.hidden = false;
    navMoreMenu.innerHTML = overflow
      .map(function (item) {
        return (
          '<a class="nav-more-link" role="menuitem" href="' +
          item.href +
          '">' +
          escapeHtml(item.label) +
          "</a>"
        );
      })
      .join("");
  }

  function distributeNavItems() {
    if (!navMount || !navLinksWrap || !messengerBtn || !navItems.length) return;

    navItems.forEach(function (item) {
      item.el.hidden = false;
    });

    var navShell = messengerBtn.closest(".nav-shell");
    if (!navShell) return;

    var available =
      navShell.clientWidth - messengerBtn.offsetWidth - 10;

    var totalWidth = navItems.reduce(function (acc, item) {
      return acc + item.el.offsetWidth + 6;
    }, 0);
    if (totalWidth <= available) {
      buildOverflowMenu([]);
      return;
    }

    var used = 0;
    var overflow = [];
    var reserveMore = 88; // fallback room for "More" pill
    if (navMoreRoot && navMoreBtn) {
      navMoreRoot.hidden = false;
      reserveMore = Math.ceil(navMoreBtn.offsetWidth || reserveMore) + 10;
    }

    navItems.forEach(function (item, idx) {
      var w = item.el.offsetWidth + 6;
      var remaining = navItems.length - idx - 1;
      var mustReserve = remaining > 0 ? reserveMore : 0;
      if (used + w + mustReserve <= available) {
        used += w;
        item.el.hidden = false;
      } else {
        item.el.hidden = true;
        overflow.push({ href: item.href, label: item.label });
      }
    });

    buildOverflowMenu(overflow);
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

      defs.forEach(function (c) {
        if (c.showInNav === false || !navMount) return;
        var a = document.createElement("a");
        a.href = "category.html?c=" + encodeURIComponent(c.slug);
        a.textContent = c.navLabel || c.breadcrumbLabel || c.slug;
        a.className = "nav-link";
        navMount.appendChild(a);
        navItems.push({
          el: a,
          href: a.href,
          label: a.textContent,
        });
      });

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

      distributeNavItems();

      if (navMoreBtn) {
        navMoreBtn.addEventListener("click", function () {
          var expanded = navMoreBtn.getAttribute("aria-expanded") === "true";
          if (expanded) closeMoreMenu();
          else openMoreMenu();
        });
      }

      document.addEventListener("click", function (e) {
        if (!navMoreRoot || navMoreRoot.hidden) return;
        if (!navMoreRoot.contains(e.target)) closeMoreMenu();
      });

      window.addEventListener("resize", function () {
        closeMoreMenu();
        distributeNavItems();
      });
    })
    .catch(function () {
      mount.innerHTML =
        '<p class="catalog-error" style="grid-column:1/-1;text-align:center;color:#6b6b6b;">ক্যাটাগরি লোড করা যায়নি। Supabase কানেকশন ও shopcraft-supabase-config.js চেক করুন।</p>';
    });
})();
