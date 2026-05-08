// shared.js — gallery slider + pagination logic

// ── GALLERY SLIDER ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.card-gallery').forEach(gallery => {
    const slides = gallery.querySelector('.gallery-slides');
    const dots   = gallery.querySelectorAll('.gallery-dot');
    const prev   = gallery.querySelector('.gallery-prev');
    const next   = gallery.querySelector('.gallery-next');
    let current  = 0;
    const total  = dots.length;

    function goTo(n) {
      current = (n + total) % total;
      slides.style.transform = `translateX(-${current * 100}%)`;
      dots.forEach((d, i) => d.classList.toggle('active', i === current));
    }

    dots.forEach((d, i) => d.addEventListener('click', e => { e.stopPropagation(); goTo(i); }));
    if (prev) prev.addEventListener('click', e => { e.stopPropagation(); goTo(current - 1); });
    if (next) next.addEventListener('click', e => { e.stopPropagation(); goTo(current + 1); });

    // Auto-advance on hover pause
    let autoTimer;
    gallery.addEventListener('mouseenter', () => clearInterval(autoTimer));
    gallery.addEventListener('mouseleave', () => {
      autoTimer = setInterval(() => goTo(current + 1), 3000);
    });
  });

  // ── PAGINATION ──────────────────────────────────────────────────
  const allCards = Array.from(document.querySelectorAll('.product-card'));
  const PER_PAGE = 16;
  const totalPages = Math.ceil(allCards.length / PER_PAGE);
  const pagination = document.getElementById('pagination');

  function showPage(page) {
    allCards.forEach((c, i) => {
      c.style.display = (i >= (page-1)*PER_PAGE && i < page*PER_PAGE) ? '' : 'none';
    });
    // Update buttons
    document.querySelectorAll('.page-btn[data-page]').forEach(btn => {
      btn.classList.toggle('active', +btn.dataset.page === page);
    });
    document.getElementById('btn-prev').disabled = page === 1;
    document.getElementById('btn-next').disabled = page === totalPages;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (pagination && totalPages > 1) {
    pagination.innerHTML = `
      <button class="page-btn" id="btn-prev" onclick="changePage(-1)">‹</button>
      ${Array.from({length: totalPages}, (_,i) =>
        `<button class="page-btn" data-page="${i+1}" onclick="gotoPage(${i+1})">${i+1}</button>`
      ).join('')}
      <button class="page-btn" id="btn-next" onclick="changePage(1)">›</button>
    `;
  }

  let currentPage = 1;
  window.gotoPage = function(p) { currentPage = p; showPage(p); };
  window.changePage = function(dir) { gotoPage(currentPage + dir); };

  showPage(1);
});
