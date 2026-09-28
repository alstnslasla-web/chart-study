/* Animate only panels becoming visible; never animate prices or recreate the engine. */
(() => {
  'use strict';
  function initialize() {
    document.querySelectorAll('.mode-tab').forEach((button) => {
      button.addEventListener('click', () => requestAnimationFrame(() => {
        const monthly = document.getElementById('monthly');
        const workspace = document.getElementById('workspace');
        const panel = monthly && !monthly.hidden ? monthly : workspace;
        if (panel && !panel.hidden) window.EXMotion?.enter(panel);
      }));
    });
    window.EXMotion?.enter(document.querySelector('.page-header'));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
