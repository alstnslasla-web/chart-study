/* 만든이 김민수 | 무단복제 금지. 외부 자료의 권리는 해당 권리자에게 있습니다. */
(function (global) {
  'use strict';
  if (global.BinanceRealRuntime) return;
  const ownScript = document.currentScript;
  const base = ownScript && ownScript.src ? new URL(ownScript.src) : null;
  const mounts = new WeakMap();
  let rendererPromise, stylePromise, catalogPromise, inflatePromise;
  function resource(name) {
    if (!base || base.origin !== location.origin || !/^https?:$/.test(base.protocol)) throw new Error('resource');
    const url = new URL(name, base); url.searchParams.set('v', '20261001-r1');
    if (url.origin !== base.origin) throw new Error('resource');
    return url.href;
  }
  function loadElement(tag, name) {
    return new Promise(function (resolve, reject) {
      const node = document.createElement(tag);
      let timer;
      function finish(ok) {
        clearTimeout(timer); node.onload = node.onerror = null;
        if (!ok) node.remove();
        ok ? resolve() : reject(new Error('resource'));
      }
      if (tag === 'link') { node.rel = 'stylesheet'; node.href = resource(name); }
      else { node.src = resource(name); node.async = true; }
      node.onload = function () { finish(true); };
      node.onerror = function () { finish(false); };
      timer = setTimeout(function () { finish(false); }, 25000);
      document.head.appendChild(node);
    });
  }
  function rendererReady() {
    if (!rendererPromise) rendererPromise = loadElement('script', 'binance-real.js').then(function () {
      if (!global.BinanceRealGuide || typeof global.BinanceRealGuide.mount !== 'function') throw new Error('renderer');
    }).catch(function () { rendererPromise = null; throw new Error('resource'); });
    return rendererPromise;
  }
  function styleReady() {
    if (!stylePromise) stylePromise = loadElement('link', 'binance-real.css').catch(function () { stylePromise = null; throw new Error('resource'); });
    return stylePromise;
  }
  // Read only the URL or the already authenticated parent loader's in-memory hint.
  // No localStorage access and no storage or URL mutations.
  function readKey() {
    let k = null;
    try { k = new URL(location.href).searchParams.get('k'); } catch (_) {}
    if (!k) { const m = location.hash.match(/[#&]k=([A-Za-z0-9_-]{16,})/); if (m) k = m[1]; }
    if (k && !/^[A-Za-z0-9_-]{16,64}$/.test(k)) k = null;
    if (k) return k;
    const inherited = typeof global.cbFrameHash === 'string' && /^#k=([A-Za-z0-9_-]{16,64})$/.exec(global.cbFrameHash);
    return inherited ? inherited[1] : null;
  }
  function decodeKey(secret) {
    if (!secret || !/^[A-Za-z0-9_-]{16,64}$/.test(secret)) throw new Error('key');
    let text = secret.replace(/-/g, '+').replace(/_/g, '/');
    while (text.length % 4) text += '=';
    return Uint8Array.from(atob(text), function (c) { return c.charCodeAt(0); });
  }
  async function inflate(bytes) {
    if (typeof DecompressionStream === 'function') {
      return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
    }
    if (!inflatePromise) inflatePromise = loadElement('script', 'vendor/pako_inflate.min.js').then(function () {
      if (!global.pako || typeof global.pako.ungzip !== 'function') throw new Error('inflate');
    }).catch(function () { inflatePromise = null; throw new Error('resource'); });
    await inflatePromise;
    return global.pako.ungzip(bytes);
  }
  async function readCatalog() {
    if (!global.crypto || !global.crypto.subtle) throw new Error('crypto');
    const raw = decodeKey(readKey()), enc = new TextEncoder(), salt = enc.encode('cb-link-v1');
    const both = new Uint8Array(raw.length + salt.length); both.set(raw); both.set(salt, raw.length);
    const digest = await crypto.subtle.digest('SHA-256', both);
    const key = await crypto.subtle.importKey('raw', digest, {name: 'AES-GCM'}, false, ['decrypt']);
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, 25000);
    let bytes;
    try {
      const response = await fetch(resource('data/binance-real.json.bin'), {cache: 'no-cache', credentials: 'same-origin', redirect: 'error', signal: controller.signal});
      if (!response.ok) throw new Error('resource');
      bytes = new Uint8Array(await response.arrayBuffer());
    } finally { clearTimeout(timer); }
    if (bytes.length < 32 || bytes[0] !== 67 || bytes[1] !== 66 || bytes[2] !== 76 || bytes[3] !== 49) throw new Error('format');
    const compressed = await crypto.subtle.decrypt({name: 'AES-GCM', iv: bytes.slice(4, 16), additionalData: enc.encode('data/binance-real.json')}, key, bytes.slice(16));
    return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(await inflate(new Uint8Array(compressed))));
  }
  function catalogReady() {
    if (!catalogPromise) catalogPromise = readCatalog().catch(function () { catalogPromise = null; throw new Error('data'); });
    return catalogPromise;
  }
  function mount(root, options) {
    if (!(root instanceof Element)) throw new TypeError('root');
    const prior = mounts.get(root); if (prior) prior();
    let disposed = false, generation = 0, rendererDestroy = null;
    const observer = new MutationObserver(function () { if (!root.isConnected) destroy(); });
    function active(run) { return !disposed && root.isConnected && run === generation; }
    function destroy() {
      if (disposed) return;
      disposed = true; generation++; observer.disconnect();
      if (rendererDestroy) { rendererDestroy(); rendererDestroy = null; }
      mounts.delete(root);
    }
    function panel(failed) {
      root.replaceChildren();
      const section = document.createElement('section'); section.className = 'card';
      section.setAttribute('role', failed ? 'alert' : 'status');
      const message = document.createElement('p');
      message.textContent = failed ? '실제 화면 안내를 열지 못했습니다. 연결과 받은 링크를 확인한 뒤 다시 시도해 주세요. 기존 학습은 그대로 이용할 수 있습니다.' : '실제 화면 안내를 불러오는 중입니다.';
      section.appendChild(message);
      if (failed) {
        const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'big-btn'; retry.textContent = '다시 시도';
        retry.addEventListener('click', start); section.appendChild(retry);
      }
      const back = document.createElement('a'); back.href = '#binance'; back.className = 'big-btn ghost'; back.textContent = '기존 31단계로 돌아가기'; section.appendChild(back);
      root.appendChild(section);
    }
    async function start() {
      if (disposed || !root.isConnected) return;
      const run = ++generation; panel(false);
      try {
        const results = await Promise.all([catalogReady(), rendererReady(), styleReady()]);
        if (!active(run)) return;
        const mounted = global.BinanceRealGuide.mount(root, {lessonSlug: options && options.lessonSlug || '', catalog: results[0], legacyHref: '#binance', preview: false});
        rendererDestroy = typeof mounted === 'function' ? mounted : mounted && typeof mounted.destroy === 'function' ? function () { mounted.destroy(); } : null;
        if (mounted && mounted.error) { if (rendererDestroy) rendererDestroy(); rendererDestroy = null; throw mounted.error; }
      } catch (_) {
        if (!active(run)) return;
        catalogPromise = null;
        panel(true);
      }
    }
    mounts.set(root, destroy);
    observer.observe(document.documentElement, {childList: true, subtree: true});
    if (root.isConnected) start(); else destroy();
    return destroy;
  }
  global.BinanceRealRuntime = Object.freeze({mount: mount});
})(window);
