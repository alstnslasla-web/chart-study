/* Presentation only. The app router, practice iframe and stored records are unchanged. */
(() => {
  'use strict';
  // Group only the home navigation cards. Move their existing nodes, preserving links.
  function groupHome() {
    if (document.body.dataset.exPage !== 'home') return;
    const view = document.getElementById('view');
    const cards = view ? [...view.querySelectorAll(':scope > .module-card')] : [];
    if (cards.length) {
      const grid = document.createElement('div');
      grid.className = 'ex-module-grid';
      cards[0].before(grid);
      cards.forEach(card => grid.appendChild(card));
    }
  }
  function showPage() {
    const page = (location.hash.slice(1).split(/[/?]/)[0] || 'home');
    document.body.dataset.exPage = page;
    groupHome();
    document.querySelectorAll('.tabbar a').forEach((link) => {
      if (link.classList.contains('active')) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    const target = page === 'sim' ? document.getElementById('goya-host') : document.getElementById('view');
    if (target && !target.hidden) window.EXMotion?.enter(target);
  }
  window.addEventListener('hashchange', showPage);
  document.addEventListener('click', event => {
    if (event.target.closest('[data-act="install-hide"], [data-act="install-show"]')) requestAnimationFrame(showPage);
  });
  // The app re-renders #view without a hashchange in a few paths (install prompt); keep the home grid applied.
  const view = document.getElementById('view');
  if (view && typeof MutationObserver === 'function') new MutationObserver(() => groupHome()).observe(view, { childList: true });
  showPage();
})();
