/* 차트 배움터 링크 전용판 로더.
   내용·자료 파일은 암호화되어 있고, 열쇠는 공유 링크(?k=...)에만 들어 있다.
   열쇠는 이 기기 브라우저에만 저장되며 서버로 따로 보내지 않는다. */
(function () {
  'use strict';
  var BUILD = "2ac9855691";
  var PLAN = {"parent":["data/embedded-assets.js","data/course.js","data/quiz-extra.js","data/binance-steps.js","data/shots.js","data/binance-verified.js","data/upbit-guide.js","data/timeframes.js","data/binance-bilingual.js"],"frame":["goya/data/catalog.js","goya/data/cases-index.js"],"frameCode":["engine.js","signal-sequence.js","scenarios.js","ui.js"]};
  var KEY_STORE = 'cb:link-key';
  var me = document.currentScript;
  var MODE = (me && me.getAttribute('data-mode')) || 'parent';
  var PREFIX = MODE === 'frame' ? 'goya/' : '';
  var enc = new TextEncoder();

  function b64url(s) {
    s = String(s).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function readKey() {
    var k = null;
    try { k = new URL(location.href).searchParams.get('k'); } catch (e) { k = null; }
    if (!k) { var m = location.hash.match(/[#&]k=([A-Za-z0-9_-]{16,})/); if (m) k = m[1]; }
    if (k && !/^[A-Za-z0-9_-]{16,64}$/.test(k)) k = null;
    if (k) { try { localStorage.setItem(KEY_STORE, k); } catch (e) {} return k; }
    try { return localStorage.getItem(KEY_STORE); } catch (e) { return null; }
  }
  function forgetKey() { try { localStorage.removeItem(KEY_STORE); } catch (e) {} }

  function gate(kind) {
    var el = document.getElementById('cb-gate');
    if (!el) { el = document.createElement('div'); el.id = 'cb-gate'; document.body.appendChild(el); }
    var msg = {
      loading: '<div class="cb-spin" aria-hidden="true"></div><p class="cb-big">차트 배움터를 여는 중입니다</p><p>잠시만 기다려 주세요.</p>',
      nokey: '<p class="cb-big">받은 링크로 열어 주세요</p><p>이 공부방은 받은 링크로만 열립니다.<br>카카오톡 등으로 받은 링크를 한 번 더 눌러 주세요.</p>',
      badkey: '<p class="cb-big">링크가 맞지 않아요</p><p>주소가 잘렸거나 예전 링크일 수 있습니다.<br>보내 준 사람에게 새 링크를 받아 다시 눌러 주세요.</p>',
      nocrypto: '<p class="cb-big">이 브라우저에서는 열 수 없어요</p><p>크롬이나 삼성 인터넷, 사파리 최신판으로 열어 주세요.</p>',
      neterr: '<p class="cb-big">인터넷 연결을 확인해 주세요</p><p>와이파이나 데이터가 켜져 있는지 본 뒤<br><button type="button" id="cb-retry">다시 열기</button></p>'
    }[kind];
    el.className = 'cb-gate cb-' + kind;
    el.setAttribute('role', kind === 'loading' ? 'status' : 'alert');
    el.innerHTML = '<div class="cb-card">' + msg + (MODE === 'parent' ? '<p class="cb-credit">만든이 김민수</p>' : '') + '</div>';
    el.hidden = false;
    var retry = document.getElementById('cb-retry');
    if (retry) retry.addEventListener('click', function () { location.reload(); });
  }
  function ungate() { var el = document.getElementById('cb-gate'); if (el) el.hidden = true; }

  var keyPromise = null;
  function cryptoKey(secret) {
    if (!keyPromise) {
      var raw = b64url(secret), salt = enc.encode('cb-link-v1'), both = new Uint8Array(raw.length + salt.length);
      both.set(raw, 0); both.set(salt, raw.length);
      keyPromise = crypto.subtle.digest('SHA-256', both).then(function (d) {
        return crypto.subtle.importKey('raw', d, { name: 'AES-GCM' }, false, ['decrypt']);
      });
    }
    return keyPromise;
  }
  function fetchBytes(url) {
    return fetch(url + '?v=' + BUILD, { cache: 'no-cache', credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) { var e = new Error('HTTP ' + r.status + ' ' + url); e.net = true; throw e; }
      return r.arrayBuffer();
    }, function (err) { err.net = true; throw err; }).then(function (b) { return new Uint8Array(b); });
  }
  var pakoPromise = null;
  function inflate(bytes) {
    if (typeof DecompressionStream === 'function') {
      var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      return new Response(stream).arrayBuffer().then(function (b) { return new Uint8Array(b); });
    }
    if (!pakoPromise) pakoPromise = loadCode((MODE === 'frame' ? '../' : '') + 'vendor/pako_inflate.min.js?v=' + BUILD);
    return pakoPromise.then(function () { return window.pako.ungzip(bytes); });
  }
  function decrypt(secret, rel, bytes) {
    if (bytes.length < 32 || bytes[0] !== 67 || bytes[1] !== 66 || bytes[2] !== 76 || bytes[3] !== 49) {
      return Promise.reject(Object.assign(new Error('bad format ' + rel), { bad: true }));
    }
    return cryptoKey(secret).then(function (key) {
      return crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(4, 16), additionalData: enc.encode(rel) }, key, bytes.slice(16));
    }).then(function (plain) { return inflate(new Uint8Array(plain)); }, function () {
      throw Object.assign(new Error('decrypt failed ' + rel), { bad: true });
    });
  }
  function loadCode(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.async = false;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(Object.assign(new Error('script ' + src), { net: true })); };
      document.head.appendChild(s);
    });
  }
  function runText(bytes, name) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(new Blob([bytes, '\n//# sourceURL=' + name + '\n'], { type: 'text/javascript' }));
      var s = document.createElement('script');
      s.src = url; s.async = false;
      s.onload = function () { URL.revokeObjectURL(url); s.remove(); resolve(); };
      s.onerror = function () { URL.revokeObjectURL(url); reject(new Error('run ' + name)); };
      document.head.appendChild(s);
    });
  }
  // 암호화된 자료 파일을 받아 풀고 순서대로 실행한다. rel은 링크판 루트 기준 경로(예: data/course.js).
  function loadEncrypted(secret, rels) {
    var jobs = rels.map(function (rel) {
      var local = MODE === 'frame' ? rel.replace(/^goya\//, '') : rel;
      return fetchBytes(local + '.bin').then(function (b) { return decrypt(secret, rel, b); });
    });
    return jobs.reduce(function (chain, job, i) {
      return chain.then(function () { return job; }).then(function (text) { return runText(text, rels[i]); });
    }, Promise.resolve());
  }
  function fail(err) {
    if (err && err.bad) { forgetKey(); gate('badkey'); }
    else if (err && err.net) gate('neterr');
    else gate('badkey');
    if (window.console) console.warn('[차트 배움터]', err && err.message);
  }

  var secret = readKey();
  if (!window.crypto || !crypto.subtle || typeof fetch !== 'function') { gate('nocrypto'); return; }
  if (!secret) { gate('nokey'); return; }
  if (MODE === 'parent') {
    gate('loading');
    // 주소에 열쇠를 남겨 둔다: 아이폰·아이패드의 '홈 화면에 추가'는 저장소를 따로 쓰므로 주소에 열쇠가 있어야 열린다.
    try { var here = new URL(location.href); if (here.searchParams.get('k') !== secret) { here.searchParams.set('k', secret); history.replaceState(history.state, '', here.toString()); } } catch (e) {}
    // 모의연습 iframe 도 같은 열쇠로 열리도록(저장소가 막힌 브라우저 대비) 조각 주소로 넘긴다.
    window.cbFrameHash = '#k=' + secret;
    fetchBytes('check.bin').then(function (b) { return decrypt(secret, 'check', b); })
      .then(function () { return loadEncrypted(secret, PLAN.parent); })
      .then(function () { return loadCode('app.js?v=' + BUILD); })
      .then(function () {
        ungate();
        if (!/iPhone|iPad|iPod/.test(navigator.userAgent) && !(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
          var link = document.createElement('link'); link.rel = 'manifest'; link.href = 'manifest.webmanifest?v=' + BUILD; document.head.appendChild(link);
        }
        if ('serviceWorker' in navigator && location.protocol === 'https:' && location.hostname !== 'appassets.androidplatform.net') {
          navigator.serviceWorker.register('sw.js?v=' + BUILD).catch(function () {});
        }
      })
      .catch(fail);
  } else {
    window.cbLoadScript = function (src) {
      return fetchBytes(src + '.bin').then(function (b) { return decrypt(secret, 'goya/' + src, b); })
        .then(function (text) { return runText(text, 'goya/' + src); });
    };
    fetchBytes('../check.bin').then(function (b) { return decrypt(secret, 'check', b); })
      .then(function () { return loadEncrypted(secret, PLAN.frame); })
      .then(function () { return PLAN.frameCode.reduce(function (c, src) { return c.then(function () { return loadCode(src + '?v=' + BUILD); }); }, Promise.resolve()); })
      .catch(fail);
  }
})();
