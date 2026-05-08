/**
 * Category names in the header — same markup on index, category, and pour pages.
 * Populated from Supabase via shopcraft-api.js.
 */
(function () {
  var navMount;
  var navMoreRoot;
  var navMoreBtn;
  var navMoreMenu;
  var messengerBtn;
  var navItems = [];
  var uiBound = false;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
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
      highlightNavLinks();
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
    highlightNavLinks();
  }

  function highlightNavLinks() {
    var slug = new URLSearchParams(window.location.search || "").get("c");
    document
      .querySelectorAll(
        "#nav-category-links a.nav-link, #nav-more-menu a.nav-more-link"
      )
      .forEach(function (a) {
        a.removeAttribute("aria-current");
      });
    if (!slug) return;
    var needle = "c=" + encodeURIComponent(slug);
    document
      .querySelectorAll(
        "#nav-category-links a.nav-link, #nav-more-menu a.nav-more-link"
      )
      .forEach(function (a) {
        if (a.href.indexOf(needle) !== -1) {
          a.setAttribute("aria-current", "page");
        }
      });
  }

  function distributeNavItems() {
    if (!navMount || !messengerBtn || !navItems.length) return;

    navItems.forEach(function (item) {
      item.el.hidden = false;
    });

    var navShell = messengerBtn.closest(".nav-shell");
    if (!navShell) return;

    var available = navShell.clientWidth - messengerBtn.offsetWidth - 10;

    var totalWidth = navItems.reduce(function (acc, item) {
      return acc + item.el.offsetWidth + 6;
    }, 0);
    if (totalWidth <= available) {
      buildOverflowMenu([]);
      return;
    }

    var used = 0;
    var overflow = [];
    var reserveMore = 88;
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

  function bindUiOnce() {
    if (uiBound) return;
    uiBound = true;
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
  }

  function cacheElements() {
    navMount = document.getElementById("nav-category-links");
    navMoreRoot = document.getElementById("nav-more");
    navMoreBtn = document.getElementById("nav-more-btn");
    navMoreMenu = document.getElementById("nav-more-menu");
    messengerBtn = document.querySelector(".nav-shell .messenger-btn");
  }

  /** Relative listing URL; default category.html; mod home sets category/; mod category page sets "". */
  function categoryListingHref(slug) {
    var base =
      typeof window.SHOPCRAFT_CATEGORY_LINK_BASE === "string"
        ? window.SHOPCRAFT_CATEGORY_LINK_BASE
        : "category.html";
    var q = "?c=" + encodeURIComponent(slug);
    if (base === "" || base === ".") return q;
    return base + q;
  }

  /**
   * @param {Array} defs category payloads (already filtered by listOnHomepage where needed)
   */
  function renderCategoryLinks(defs) {
    cacheElements();
    if (!navMount || !Array.isArray(defs)) return;

    bindUiOnce();

    navMount.innerHTML = "";
    navItems = [];

    defs.forEach(function (c) {
      if (c.showInNav === false) return;
      var a = document.createElement("a");
      a.href = categoryListingHref(c.slug);
      a.textContent = c.navLabel || c.breadcrumbLabel || c.slug;
      a.className = "nav-link";
      navMount.appendChild(a);
      navItems.push({
        el: a,
        href: a.href,
        label: a.textContent,
      });
    });

    highlightNavLinks();
    requestAnimationFrame(function () {
      distributeNavItems();
    });
  }

  function initStandalone() {
    cacheElements();
    if (!navMount) return;
    if (typeof ShopcraftApi === "undefined" || !ShopcraftApi.supabaseActive()) {
      return;
    }
    ShopcraftApi.fetchCategoriesJson()
      .then(function (doc) {
        var raw = (doc.categories || []).filter(function (c) {
          return c.listOnHomepage !== false;
        });
        renderCategoryLinks(raw);
      })
      .catch(function () {
        /* silent — page works without nav */
      });
  }

  window.ShopcraftNav = {
    renderCategoryLinks: renderCategoryLinks,
  };

  if (!document.getElementById("category-grid-mount")) {
    initStandalone();
  }
})();
