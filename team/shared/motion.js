/* Shared presentation-only motion. No data, navigation, or storage mutations. */
(() => {
  'use strict';
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const running = new Set();
  const byElement = new WeakMap();
  function enter(element) {
    if (!element || !element.isConnected || typeof element.animate !== 'function') return;
    const previous = byElement.get(element);
    if (previous) previous.cancel();
    if (preference.matches || document.visibilityState === 'hidden') return;
    const animation = element.animate(
      [{ opacity: .5, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration: 210, easing: 'cubic-bezier(.22,.75,.3,1)' }
    );
    running.add(animation);
    byElement.set(element, animation);
    const finish = () => { running.delete(animation); if (byElement.get(element) === animation) byElement.delete(element); };
    animation.onfinish = finish;
    animation.oncancel = finish;
  }
  function stop() { for (const animation of [...running]) animation.cancel(); }
  const onPreference = event => { if (event.matches) stop(); };
  if (typeof preference.addEventListener === 'function') preference.addEventListener('change', onPreference);
  else if (typeof preference.addListener === 'function') preference.addListener(onPreference);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') stop(); });
  window.EXMotion = Object.freeze({ enter, stop, reduced: () => preference.matches });
})();
