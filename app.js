
/* 만든이 김민수 | 저작권 © 2026 김민수. All rights reserved. | 무단복제 금지. 저작권자의 사전 허락 없는 복제 및 재배포를 금합니다. 외부 인용 자료와 상표의 권리는 해당 권리자에게 있습니다. */
/* 차트 배움터 — 핵심 로직 (의존성 없음, file:// 에서도 동작) */
(() => {
  'use strict';

  // ---------- 유틸 ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem('cb:' + k); const parsed = v ? JSON.parse(v) : d; return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('cb:' + k, JSON.stringify(v)); } catch (e) { /* 저장 불가 환경 */ } }
  };
  const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const pad2 = (n) => String(n).padStart(2, '0');

  // ---------- 데이터 ----------
  const COURSE = Array.isArray(window.COURSE) ? window.COURSE : [];
  // 바이낸스 단계: 검증 데이터(공식 문서 확인본)가 있으면 그 텍스트를 쓰고, 화면 모형은 기본 데이터에서 id 매핑으로 붙인다.
  const BASE_STEPS = Array.isArray(window.BINANCE_STEPS) ? window.BINANCE_STEPS : [];
  const SCREEN_MAP = { '01': 'install', '02': 'signup', '03': 'login', '04': 'kyc', '05': 'face', '06': 'twofa', '07': 'whitelist', '08': 'kr-exchange', '09': 'kr-exchange', '10': 'deposit-address', '11': 'transfer', '12': 'futures-home', '13': 'symbol', '14': 'chart', '15': 'margin-mode', '16': 'leverage', '17': 'order-type', '18': 'amount', '19': 'long', '20': 'short', '21': 'confirm', '22': 'tpsl-entry', '23': 'tpsl-position', '24': 'position', '25': 'close', '26': 'funding', '27': 'fees', '28': 'mock', '29': 'mistakes', '30': 'help', '31': 'language' };
  function buildSteps() {
    const V = window.BINANCE_VERIFIED;
    if (!V || !Array.isArray(V.steps) || !V.steps.length) return { steps: BASE_STEPS.filter((s) => (s.steps || []).length), meta: window.BINANCE_META || { korea_notes: [], glossary: [], checked: '' } };
    const byId = Object.fromEntries(BASE_STEPS.map((s) => [s.id, s]));
    const steps = V.steps.map((v) => {
      const base = byId[SCREEN_MAP[v.id]] || {};
      const guide = window.UPBIT_GUIDE?.[v.id] || null;
      const labels = Array.isArray(v.screen_labels) ? v.screen_labels : (base.labels || []);
      const hl = labels.includes(base.hl) ? base.hl : labels[0] || '';
      return { id: v.id, phase: v.phase, title: v.title, menu: v.menu_path, steps: v.instructions || [], labels, hl, caution: v.caution || '', verified: v.verified || '', sources: v.source_urls || [], screen: guide?.screen || base.screen || null, guide, bilingual: window.BINANCE_BILINGUAL?.[v.id] || null };
    });
    const meta = {
      checked: `공식 문서 확인일 ${V.checked_date || ''}. 한국어 메뉴명은 설명용 번역이며 실기기 검증은 아닙니다.`,
      korea_notes: (V.korea_notes || []).map((n) => n.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '$1: $2')),
      glossary: (V.glossary || []).map((g) => [g.term, g.easy])
    };
    return { steps, meta };
  }
  const BUILT = buildSteps();
  const STEPS = BUILT.steps;
  const META = BUILT.meta;
  const FIG = {
    'candles': 'candle-basics', 'trendline': 'trend-candles', 'draw-lines': 'practice-candles', 'channels': 'chart-structures',
    'support': 'chart-structures', 'triangles': 'triangle-candles', 'volume-profile': 'volume-profile', 'golden-cross': 'golden-cross',
    'bollinger': 'bollinger', 'rsi': 'rsi-candles', 'macd': 'macd-candles', 'divergence': 'divergence-types', 'elliott': 'elliott-candles',
    'goya-markers': 'goya-markers', 'goya-three-conditions': 'goya-three-conditions', 'goya-entry-exit': 'goya-exit-modes', 'goya-practice-app': 'goya-practice-screen-a'
  };
  const FIG_EXTRA = { 'goya-practice-app': ['goya-practice-screen-b'] };
  const FIG_CAPTION = {
    'candle-basics': '양봉과 음봉의 네 가격', 'trend-candles': 'A·B·C 저점을 잇는 추세선과 평행 채널', 'practice-candles': '선을 직접 그어 보는 연습 캔들',
    'chart-structures': '추세선 · 채널 · 삼각수렴 · 거짓 돌파', 'triangle-candles': '고점은 낮아지고 저점은 높아지는 삼각수렴', 'volume-profile': '시간별 거래량과 가격별 매물대',
    'golden-cross': '짧은 평균선이 긴 평균선 위로(후행성)', 'bollinger': '볼린저밴드의 좁은 폭과 넓은 폭', 'rsi-candles': 'RSI 70 위에서도 가격은 더 오를 수 있음',
    'macd-candles': 'MACD선 · 신호선 · 막대(차이)', 'divergence-types': '일반·히든 다이버전스 네 가지', 'elliott-candles': '엘리엇파동 1~5와 A·B·C',
    'goya-markers': '학습용 가상 그림입니다. RS·RL 화살표는 원본 화면 모양이며, 앱에서는 둘 다 봉 위 노란 마름모입니다. L2는 원본에서도 봉 아래 초록 화살표지만 이 그림에서는 글자 상자로만 표시했고, 분홍 선은 1시간봉 24개 평균선과 거의 같은 선입니다.', 'goya-three-conditions': '학습용 가상 그림입니다. 위는 롱, 아래는 숏입니다. ① Smart가 먼저 나오고, ② Premium과 ③ RS는 순서와 상관없이 모이면 완성입니다. 진입을 고르면 다음 봉 시가에 모의 체결됩니다.', 'goya-exit-modes': '학습용 가상 그림입니다. 같은 롱 진입에서 ①과 ②가 언제 정리되는지 비교하세요. ①은 반대 SS가 보인 다음 봉 시가에 정리하고, ②는 반대 세 조건이 완성될 때까지 들고 있습니다.', 'goya-practice-screen-a': '앱 화면 예시(휴대폰). ① 연습 방식 탭 ② 연습할 코인 ③ 세 신호 카드 ⑤ 롱·숏·관망 고르기 ⑥ 진행 버튼. 보관된 과거 시세를 모의로 재생한 화면입니다.', 'goya-practice-screen-b': '앱 화면 예시(휴대폰). ④ 차트와 “세 신호 함께 보기”. 차트 위 상자의 시각은 봉이 시작한 시각이라 카드의 확인 시각보다 한 시간 이릅니다.'
  };
  const IMG = (name) => window.CHART_ASSETS["assets/" + name + ".webp"];
  const PARTS = ['1부 · 처음부터', '2부 · 차근차근', '3부 · 선택 심화', '4부 · 우리 지표 연습'];

  // ---------- 상태 ----------
  const S = {
    settings: store.get('settings', { font: 'L' }),
    done: store.get('done', {}),          // lessonId -> true
    quiz: store.get('quiz', {}),          // questionId -> {seen, ok, ng, lastOk}
    bnb: store.get('bnb', {}),            // stepId -> true
    sim: store.get('sim', { games: 0, wins: 0, losses: 0, waits: 0, score: 0, best: 0 })
  };
  const nonNegative = (v) => Number.isSafeInteger(v) && v >= 0 ? v : 0;
  S.settings.font = ['M', 'L', 'XL'].includes(S.settings.font) ? S.settings.font : 'L';
  for (const flags of [S.done, S.bnb]) Object.keys(flags).forEach((key) => { if (flags[key] !== true) delete flags[key]; });
  Object.keys(S.quiz).forEach((key) => {
    const value = S.quiz[key];
    if (!value || typeof value !== 'object') { delete S.quiz[key]; return; }
    const ok = nonNegative(value.ok), ng = nonNegative(value.ng);
    S.quiz[key] = { seen: ok + ng, ok, ng, lastOk: typeof value.lastOk === 'boolean' ? value.lastOk : null };
  });
  ['games', 'wins', 'losses', 'waits', 'best'].forEach((key) => { S.sim[key] = nonNegative(S.sim[key]); });
  S.sim.score = Number.isSafeInteger(S.sim.score) ? S.sim.score : 0;
  S.sim.games = S.sim.wins + S.sim.losses + S.sim.waits;
  S.sim.best = Math.max(S.sim.best, S.sim.score);
  const save = () => { store.set('settings', S.settings); store.set('done', S.done); store.set('quiz', S.quiz); store.set('bnb', S.bnb); store.set('sim', S.sim); };
  document.documentElement.dataset.font = S.settings.font || 'L';

  // ---------- 문제 은행 ----------
  function bank() {
    const q = [];
    COURSE.forEach((L, i) => {
      if (L.quiz && Array.isArray(L.quiz.options)) {
        q.push({ id: 'c:' + L.id, lesson: L.id, lessonNo: i + 1, difficulty: 1, question: L.quiz.question, options: L.quiz.options, answer: L.quiz.answer, explanation: L.quiz.explanation || '', image: (L.level || '').startsWith('4부') ? '' : (FIG[L.id] || '') });
      }
    });
    (window.QUIZ_EXTRA || []).forEach((x, k) => {
      const i = COURSE.findIndex((L) => L.id === x.lesson);
      if (i < 0 || !Array.isArray(x.options) || typeof x.answer !== 'number') return;
      q.push({ id: 'x:' + x.lesson + ':' + k, lesson: x.lesson, lessonNo: i + 1, difficulty: x.difficulty || 1, question: x.question, options: x.options, answer: x.answer, explanation: x.explanation || '', image: x.image || '' });
    });
    return q;
  }
  const BANK = bank();
  const lessonOf = (id) => COURSE.find((L) => L.id === id);
  const lessonIndex = (id) => COURSE.findIndex((L) => L.id === id);
  const partOf = (L) => PARTS.findIndex((p) => (L.level || '').startsWith(p.slice(0, 2)));
  const qStat = (id) => S.quiz[id] || { seen: 0, ok: 0, ng: 0, lastOk: null };
  const totalStats = () => { let seen = 0, ok = 0; Object.values(S.quiz).forEach((s) => { seen += s.seen; ok += s.ok; }); return { seen, ok }; };
  const wrongIds = () => BANK.filter((q) => qStat(q.id).lastOk === false).map((q) => q.id);

  // ---------- 화면 렌더 ----------
  const view = $('#view');
  const title = $('#top-title');
  const backBtn = $('#back-btn');
  let backTo = null;

  function setTop(t, back) {
    title.textContent = t;
    backTo = back || null;
    backBtn.hidden = !back;
    const tab = (location.hash.replace('#', '').split('/')[0] || 'home').split('?')[0];
    $$('.tabbar a').forEach((a) => {
      const active = a.dataset.tab === tab || ((tab === 'lesson' || tab === 'timeframes') && a.dataset.tab === 'learn');
      a.classList.toggle('active', active);
      if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    document.title = t === '차트 배움터' ? t : t + ' | 차트 배움터';
  }
  backBtn.addEventListener('click', () => { if (backTo) location.hash = backTo; else history.back(); });
  $('#font-btn').addEventListener('click', () => {
    const order = ['M', 'L', 'XL'];
    const cur = order.indexOf(S.settings.font || 'L');
    S.settings.font = order[(cur + 1) % order.length];
    document.documentElement.dataset.font = S.settings.font; save();
    if (location.hash.startsWith('#sim-example')) requestAnimationFrame(drawSim);
    const goyaFrame = document.getElementById('goya-practice-frame');
    if (goyaFrame && goyaFrame.contentWindow) goyaFrame.contentWindow.postMessage({ type: 'cb-font', font: S.settings.font }, location.protocol === 'file:' ? '*' : location.origin);
    toast({ M: '글자: 보통', L: '글자: 크게', XL: '글자: 아주 크게' }[S.settings.font]);
  });

  function toast(msg) {
    let t = $('#toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.style.cssText = 'position:fixed;left:50%;bottom:calc(var(--touch) + 20px);transform:translateX(-50%);background:#16232a;color:#fff;padding:12px 20px;border-radius:14px;z-index:60;font-weight:700;box-shadow:0 4px 14px rgba(0,0,0,.3)'; document.body.appendChild(t); }
    t.textContent = msg; t.style.display = 'block';
    clearTimeout(t._h); t._h = setTimeout(() => { t.style.display = 'none'; }, 1600);
  }

  function html(strings, ...vals) { return strings.reduce((acc, s, i) => acc + s + (i < vals.length ? vals[i] : ''), ''); }

  // ---------- 홈 ----------
  function ring(pct, label) {
    const r = 26, c = 2 * Math.PI * r, off = c * (1 - Math.min(1, Math.max(0, pct)));
    return `<svg class="ring" viewBox="0 0 64 64" aria-label="${esc(label)}"><circle cx="32" cy="32" r="${r}" fill="none" stroke="var(--brand-soft)" stroke-width="7"/><circle cx="32" cy="32" r="${r}" fill="none" stroke="var(--brand)" stroke-width="7" stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 32 32)"/><text x="32" y="38" text-anchor="middle">${Math.round(pct * 100)}%</text></svg>`;
  }
  function drawHeroStrip() {
    const c = $('#hero-strip'); if (!c) return;
    const dpr = window.devicePixelRatio || 1; const W = c.clientWidth, H = c.clientHeight; if (!W) return;
    c.width = W * dpr; c.height = H * dpr; const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const s = genSeries(20260918, 48); const lo = Math.min(...s.map((b) => b.l)), hi = Math.max(...s.map((b) => b.h));
    const y = (v) => 8 + (H - 16) * (1 - (v - lo) / (hi - lo || 1)); const bw = W / s.length;
    s.forEach((b, i) => { const x = i * bw + bw / 2; const up = b.c >= b.o; g.strokeStyle = g.fillStyle = up ? '#ff6b7a' : '#7fb3ff'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, y(b.h)); g.lineTo(x, y(b.l)); g.stroke(); const t = y(Math.max(b.o, b.c)), btm = y(Math.min(b.o, b.c)); g.fillRect(x - bw * 0.3, t, bw * 0.6, Math.max(1.5, btm - t)); });
  }
  function goyaProgress() {
    let n = 0, t = 0;
    try { const s = JSON.parse(localStorage.getItem('cb:goya-sim:v1') || 'null'); if (s && typeof s === 'object') { n = Number(s.decisionCount) || 0; t = Number(s.tradeCount) || 0; } } catch (e) { /* 저장 불가 환경 */ }
    if (!n) {
      try { const run = JSON.parse(localStorage.getItem('cb:goya-sim:v1:run') || 'null'); if (run && Array.isArray(run.actions) && run.actions.length) return { pct: 0.05, label: '이어서 연습하기' }; } catch (e) { /* 저장 불가 환경 */ }
    }
    return { pct: Math.min(1, n / 20), label: n ? `판단 ${n}회 · 완료 거래 ${t}회` : '아직 연습 전' };
  }
  // ---------- 쉽게 열기: 바탕화면 아이콘 · 카카오톡 밖에서 열기 ----------
  const UA = navigator.userAgent || '';
  const ENV = {
    kakao: /KAKAOTALK/i.test(UA),
    ios: /iPhone|iPad|iPod/i.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
    ipad: /iPad/i.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
    samsung: /SamsungBrowser/i.test(UA),
    android: /Android/i.test(UA),
    // 안드로이드 앱(APK) 안에서는 이미 아이콘이 있으므로 설치 안내를 띄우지 않는다.
    standalone: (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true || location.hostname === 'appassets.androidplatform.net'
  };
  let installPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; if ((location.hash || '#home').startsWith('#home')) renderHome(); });
  window.addEventListener('appinstalled', () => { installPrompt = null; store.set('install', { hidden: true }); toast('바탕화면에 아이콘을 만들었어요'); });
  function shareUrl() {
    const u = new URL(location.href);
    let k = null; try { k = localStorage.getItem('cb:link-key'); } catch (e) { k = null; }
    if (k && !u.searchParams.get('k')) u.searchParams.set('k', k);
    return u.toString();
  }
  function accessHelp(force) {
    const hidden = store.get('install', { hidden: false }).hidden;
    if (ENV.standalone || (!ENV.ios && !ENV.android) || (hidden && !force)) {
      return ENV.standalone || (!ENV.ios && !ENV.android) ? '' : '<p class="access-again"><button type="button" class="linkish" data-act="install-show">📲 바탕화면에 아이콘 만드는 방법 다시 보기</button></p>';
    }
    let title = '📲 바탕화면에 아이콘 만들기', body = '', action = '';
    if (ENV.kakao) {
      title = '카카오톡 안에서 열려 있어요';
      body = `<p>${ENV.ios ? '사파리' : '크롬이나 삼성 인터넷'}에서 열면 바탕화면에 아이콘을 만들 수 있고, 다음부터 아이콘만 누르면 바로 열립니다.</p>`;
      action = `<button type="button" class="big-btn" data-act="open-external">${ENV.ios ? '사파리로 열기' : '크롬으로 열기'}</button>`;
    } else if (installPrompt) {
      body = '<p>한 번만 만들어 두면 다음부터 아이콘을 눌러 바로 공부할 수 있어요.</p>';
      action = '<button type="button" class="big-btn" data-act="install-now">바탕화면에 아이콘 만들기</button>';
    } else if (ENV.ios) {
      body = `<ol class="access-steps"><li>${ENV.ipad ? '화면 <b>위쪽</b>' : '화면 <b>아래쪽</b>'}의 <b>공유 버튼</b>(네모에서 화살표가 나오는 모양 <span aria-hidden="true">⬆︎</span>)을 누릅니다.</li><li>목록을 올려 <b>홈 화면에 추가</b>를 누릅니다.</li><li>오른쪽 위 <b>추가</b>를 누르면 끝입니다.</li></ol>`;
    } else if (ENV.samsung) {
      body = '<ol class="access-steps"><li>화면 아래쪽 <b>≡</b>(줄 세 개) 메뉴를 누릅니다.</li><li><b>현재 페이지 추가</b>를 누릅니다.</li><li><b>홈 화면</b>을 고르면 바탕화면에 아이콘이 생깁니다.</li></ol>';
    } else {
      body = '<ol class="access-steps"><li>화면 오른쪽 위 <b>⋮</b>(점 세 개)를 누릅니다.</li><li><b>홈 화면에 추가</b> 또는 <b>앱 설치</b>를 누릅니다.</li><li><b>추가</b>를 누르면 바탕화면에 아이콘이 생깁니다.</li></ol>';
    }
    return `<section class="card access-card" aria-labelledby="access-title"><h2 id="access-title">${title}</h2>${body}<div class="access-actions">${action}<button type="button" class="big-btn ghost" data-act="install-hide">다음에 볼게요</button></div></section>`;
  }
  function bindAccessHelp(root) {
    root.querySelectorAll('[data-act="open-external"]').forEach((b) => b.addEventListener('click', () => { location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(shareUrl()); }));
    root.querySelectorAll('[data-act="install-now"]').forEach((b) => b.addEventListener('click', async () => {
      if (!installPrompt) return;
      installPrompt.prompt();
      try { const choice = await installPrompt.userChoice; if (choice && choice.outcome === 'accepted') store.set('install', { hidden: true }); } catch (e) { /* 선택 결과를 알 수 없음 */ }
      installPrompt = null; renderHome();
    }));
    root.querySelectorAll('[data-act="install-hide"]').forEach((b) => b.addEventListener('click', () => { store.set('install', { hidden: true }); renderHome(); }));
    root.querySelectorAll('[data-act="install-show"]').forEach((b) => b.addEventListener('click', () => { store.set('install', { hidden: false }); renderHome(); }));
  }

  function renderHome() {
    setTop('차트 배움터', null);
    const doneN = COURSE.filter((L) => S.done[L.id]).length;
    const st = totalStats();
    const bn = STEPS.filter((s) => S.bnb[s.id]).length;
    const acc = st.seen ? Math.round(st.ok / st.seen * 100) : 0;
    const starsN = Math.min(5, Math.floor(st.ok / 20));
    view.innerHTML = html`
      <section class="hero">
        <h2>천천히,<br>그림부터.</h2>
        <p class="hero-credit">만든이 <strong>김민수</strong></p>
        <p>읽고, 문제로 확인하고, 앱 화면을 익힌 뒤 모의로 연습합니다. 실제 주문은 없습니다.</p>
        <div class="legend"><span><i style="background:#ff6b7a"></i>빨강 = 양봉(오름)</span><span><i style="background:#7fb3ff"></i>파랑 = 음봉(내림)</span></div>
        <canvas id="hero-strip" aria-hidden="true"></canvas>
      </section>
      ${accessHelp()}
      <nav class="path" aria-label="학습 순서">
        <a href="#learn"><b>1</b>배우기</a><a href="#quiz"><b>2</b>문제</a><a href="#binance"><b>3</b>바이낸스</a><a href="#sim"><b>4</b>연습</a>
      </nav>
      <a class="card lift module-card" href="#learn">
        <div class="mod-head"><div class="mod-ico">📖</div><div><div class="mod-title">차트 배우기</div><div class="mod-sub">${COURSE.length}강 · 그림과 설명, 강마다 확인 문제</div></div></div>
        ${ring(doneN / Math.max(1, COURSE.length), '학습 진도')}
        <div class="mod-foot"><span class="badge">${doneN} / ${COURSE.length}강 완료</span><span>1부 1~8강부터</span></div>
      </a>
      ${timeframeTeaser()}
      <a class="card lift module-card" href="#quiz">
        <div class="mod-head"><div class="mod-ico">🎯</div><div><div class="mod-title">문제 도전</div><div class="mod-sub">그림을 보고 답하는 객관식 · 별 모으기</div></div></div>
        ${ring(st.seen ? st.ok / st.seen : 0, '정답률')}
        <div class="mod-foot"><span class="badge">${st.seen}문제 · 정답률 ${acc}%</span><span style="color:var(--accent-deep)">${'★'.repeat(starsN)}${'☆'.repeat(5 - starsN)}</span><span>은행 ${BANK.length}문제</span></div>
      </a>
      <a class="card lift module-card" href="#binance">
        <div class="mod-head"><div class="mod-ico">📱</div><div><div class="mod-title">바이낸스 선물 앱</div><div class="mod-sub">가입 → 인증 → 입금 → 선물 화면 → 롱/숏 → TP/SL</div></div></div>
        ${ring(bn / Math.max(1, STEPS.length), '단계 진도')}
        <div class="mod-foot"><span class="badge">${bn} / ${STEPS.length}단계 확인</span><span>모의거래부터</span></div>
      </a>
      <a class="card lift module-card" href="#sim">
        <div class="mod-head"><div class="mod-ico">📈</div><div><div class="mod-title">지표 모의연습</div><div class="mod-sub">우리 지표 실제 기록 · LL/SS·Premium·RS 신호를 보며 롱·숏·관망 연습</div></div></div>
        ${ring(goyaProgress().pct, '연습 진행')}
        <div class="mod-foot"><span class="badge">${goyaProgress().label}</span><span>실제 기록 353종목 · 한 시간씩 진행</span></div>
      </a>
      <div class="notice"><strong>이 앱은 연습용입니다</strong>투자 조언이 아니며 수익을 약속하거나 특정 종목·거래를 권하지 않습니다. 선물은 투자금 전액 손실과 강제청산 위험이 있습니다. 학습 기록은 이 기기·브라우저에만 저장되며 다른 사람과 공유되지 않습니다.</div>
      <a class="big-btn accent" href="#quiz/play?mode=daily">🎯 오늘의 도전 10문제 시작</a>
    `;
    bindAccessHelp(view);
    requestAnimationFrame(drawHeroStrip);
  }

  // ---------- 배우기 ----------
  function renderLearn() {
    setTop('차트 배우기', '#home');
    let out = '';
    PARTS.forEach((p, pi) => {
      const items = COURSE.map((L, i) => ({ L, i })).filter(({ L }) => partOf(L) === pi);
      if (!items.length) return;
      out += `<h2 class="part-head">${esc(p)}${pi === 2 ? ' <span class="badge">나중에 읽어도 됨</span>' : ''}${pi === 3 ? ' <span class="badge">모의연습과 함께</span>' : ''}</h2><ul class="lesson-list">`;
      items.forEach(({ L, i }) => {
        out += `<li><a class="lesson-item ${S.done[L.id] ? 'done' : ''}" href="#lesson/${esc(L.id)}"><span class="num">${S.done[L.id] ? '✓' : pad2(i + 1)}</span><span><div class="t">${esc(L.title)}</div><div class="s">${esc(L.subtitle || '')}${FIG[L.id] ? ' · 🖼 그림' : ''}</div></span><span class="chev">›</span></a></li>`;
      });
      out += '</ul>';
    });
    view.innerHTML = timeframeTeaser() + `<div class="tip">한 번에 한 강만 읽어도 됩니다. 1부 1~8강부터 시작하세요.</div>${out}`;
  }

  function figureHtml(name, extraCaption) {
    if (!name) return '';
    const capText = extraCaption || FIG_CAPTION[name] || '';
    return `<figure class="figure"><img src="${IMG(name)}" alt="${esc(FIG_CAPTION[name] || name)}" loading="lazy" data-zoom="${IMG(name)}"><figcaption><span>${esc(capText)}${/학습용 가상|앱 화면 예시/.test(capText) ? '' : ' · 학습용 가상 그림'}</span><button class="zoom-btn" type="button" data-zoom="${IMG(name)}">🔍 크게</button></figcaption></figure>`;
  }

  function renderLesson(id) {
    const L = lessonOf(id);
    if (!L) { location.hash = '#learn'; return; }
    const i = lessonIndex(id);
    setTop(`${pad2(i + 1)}강`, '#learn');
    const prev = COURSE[i - 1], next = COURSE[i + 1];
    const qN = BANK.filter((q) => q.lesson === id).length;
    view.innerHTML = html`
      <div class="eyebrow">${esc(L.level || '')} · ${pad2(i + 1)}강 · 약 ${esc(L.minutes || 8)}분</div>
      <h2 class="page-title">${esc(L.title)}</h2>
      <p class="muted">${esc(L.subtitle || '')}</p>
      ${figureHtml(FIG[id])}
      ${(FIG_EXTRA[id] || []).map((name) => figureHtml(name)).join('')}
      ${['read-chart', 'trendline', 'plan-exits'].includes(id) ? timeframeTeaser() : ''}
      ${(L.objectives || []).length ? `<div class="card"><h2>이 강에서 익힐 것</h2><ul>${L.objectives.map((o) => `<li>${esc(o)}</li>`).join('')}</ul></div>` : ''}
      ${(L.sections || []).map((s) => `<div class="card section-card"><h2>${esc(s.heading)}</h2><p>${esc(s.body)}</p></div>`).join('')}
      ${(L.checklist || []).length ? `<div class="card"><h2>스스로 확인하기</h2><ul class="check-list">${L.checklist.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>` : ''}
      ${(L.sources || []).length ? `<details class="card"><summary style="font-weight:700;cursor:pointer">참고 출처 ${L.sources.length}개</summary><ul class="small-print" style="margin-top:8px">${L.sources.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a></li>`).join('')}</ul></details>` : partOf(L) === 3 ? `<div class="notice"><strong>자체 분석</strong>이 강의 규칙과 숫자는 우리 모의연습 자료(한 달 보관 기록)를 분석한 것입니다. 외부 공식 출처가 아니며 미래 수익을 뜻하지 않습니다.</div>` : `<div class="notice"><strong>참고 출처 없음</strong>이 강의 용어는 제공자마다 정의가 다를 수 있어 공식 출처를 연결하지 않았습니다.</div>`}
      ${partOf(L) === 3 ? '<a class="big-btn" href="#sim">📈 지표 모의연습에서 직접 해보기</a>' : ''}
      <a class="big-btn accent" href="#quiz/play?mode=lesson&id=${esc(id)}">🎯 이 강 문제 풀기 (${qN}문제)</a>
      <button class="big-btn ${S.done[id] ? 'ok' : 'secondary'}" type="button" data-act="done">${S.done[id] ? '✓ 다 읽었어요 (완료)' : '다 읽었어요'}</button>
      <div class="row">
        ${prev ? `<a class="big-btn ghost" href="#lesson/${esc(prev.id)}">‹ 이전 강</a>` : '<span></span>'}
        ${next ? `<a class="big-btn ghost" href="#lesson/${esc(next.id)}">다음 강 ›</a>` : '<a class="big-btn ghost" href="#quiz">문제 도전 ›</a>'}
      </div>
    `;
    $('[data-act="done"]', view).addEventListener('click', () => { S.done[id] = !S.done[id]; save(); renderLesson(id); if (S.done[id]) toast('완료! 잘하셨어요'); });
    view.scrollTop = 0; window.scrollTo(0, 0);
  }

  // ---------- 시간봉과 큰 흐름 가이드 ----------
  function timeframeTeaser() {
    return `<a class="card lift tf-teaser" href="#timeframes"><span class="badge">시간봉 가이드</span><h2>큰 흐름부터 진입 후보까지</h2><p>일봉 → 4시간봉 → 1시간봉 → 15분봉 → 5분봉</p><span class="muted">시간봉의 뜻 · 같은 시세 묶어 보기 · 관망 조건</span><span class="tf-teaser-go" aria-hidden="true">차근차근 보기 ›</span></a>`;
  }
  function tfAggregate(bars, size) {
    if (!Array.isArray(bars) || !bars.length || !Number.isInteger(size) || size < 1 || bars.length % size !== 0) throw new Error('시간봉 예시에는 완성된 묶음이 필요합니다.');
    const grouped = [];
    for (let i = 0; i < bars.length; i += size) {
      const group = bars.slice(i, i + size);
      grouped.push({ o: group[0].o, h: Math.max(...group.map(b => b.h)), l: Math.min(...group.map(b => b.l)), c: group[group.length - 1].c });
    }
    return grouped;
  }
  function tfAggregationFigure() {
    const prices = [100, 101.4, 102.3, 101.2, 99.6, 98.8, 99.7, 100.9, 102.1, 101.6, 103, 103.8, 103.4];
    const bars = prices.slice(0, -1).map((o, i) => ({ o, c: prices[i + 1], h: Math.max(o, prices[i + 1]) + .3 + (i % 3) * .2, l: Math.min(o, prices[i + 1]) - .4 - (i % 2) * .3 }));
    const one = tfAggregate(bars, 12)[0];
    const groups = [{ title: '5분봉 12개', bars }, { title: '15분봉 4개', bars: tfAggregate(bars, 3) }, { title: '1시간봉 1개', bars: [one] }];
    const lo = Math.floor(Math.min(...bars.map(b => b.l))), hi = Math.ceil(Math.max(...bars.map(b => b.h)));
    const y = v => 18 + 116 * (hi - v) / (hi - lo);
    return groups.map((group, gi) => {
      const gap = 538 / group.bars.length;
      const shapes = group.bars.map((b, i) => {
        const x = 60 + gap * (i + .5), width = Math.min(34, gap * .6), up = b.c >= b.o;
        return `<g fill="${up ? 'var(--up)' : 'var(--down)'}" stroke="${up ? 'var(--up)' : 'var(--down)'}"><line x1="${x}" y1="${y(b.h)}" x2="${x}" y2="${y(b.l)}" stroke-width="2.5"/><rect x="${x - width / 2}" y="${y(Math.max(b.o, b.c))}" width="${width}" height="${Math.max(2, Math.abs(y(b.o) - y(b.c)))}" stroke="none"/></g>`;
      }).join('');
      return `<figure class="tf-candle-figure"><figcaption>${group.title}</figcaption><svg viewBox="0 0 640 174" role="img" aria-labelledby="tf-svg-title-${gi}"><title id="tf-svg-title-${gi}">${group.title}. 같은 가상 60분 시세를 집계한 그림. 빨강 양봉, 파랑 음봉.</title><rect width="640" height="174" fill="var(--paper)"/>${[lo, (lo + hi) / 2, hi].map(v => `<line x1="54" y1="${y(v)}" x2="610" y2="${y(v)}" stroke="var(--line)"/><text x="46" y="${y(v) + 6}" text-anchor="end" fill="var(--ink-2)" font-size="18">${v.toFixed(1)}</text>`).join('')}${shapes}<text x="58" y="165" fill="var(--ink-2)" font-size="19">시작 0분</text><text x="605" y="165" text-anchor="end" fill="var(--ink-2)" font-size="19">끝 60분</text></svg></figure>`;
    }).join('') + `<p class="muted">한 시간 전체는 시가 ${one.o.toFixed(1)}, 고가 ${one.h.toFixed(1)}, 저가 ${one.l.toFixed(1)}, 종가 ${one.c.toFixed(1)}입니다. 큰 봉의 시가는 첫 작은 봉의 시가, 종가는 마지막 작은 봉의 종가이며 고가·저가는 구간 전체의 최댓값·최솟값입니다.</p><p class="small-print">직접 만든 가상 가격이며 실제 종목·시세가 아닙니다. 세 그림은 같은 60분·같은 세로 가격 범위입니다. 모든 봉이 마감됐다고 가정했습니다.</p>`;
  }
  function renderTimeframes() {
    const G = window.TIMEFRAME_GUIDE;
    setTop('시간봉과 큰 흐름', '#learn');
    if (!G) { view.innerHTML = '<div class="notice">시간봉 자료를 불러오지 못했습니다. 페이지를 새로고침해 주세요.</div>'; return; }
    view.innerHTML = html`
      <div class="eyebrow">배우기 · 연결 가이드 · 약 15분</div>
      <h2 class="page-title">${esc(G.title)}</h2>
      <p class="muted">${esc(G.subtitle)}</p>
      <div class="notice info"><strong>큰 지도에서 위치를 찾고, 작은 지도로 자세히</strong>분봉을 본다고 진입 정확도나 수익이 보장되지는 않습니다. 큰 흐름·관심 구간·진입 조건·틀렸을 때의 계획을 분리하는 연습입니다.</div>
      <nav class="tf-jumps" aria-label="시간봉 가이드 내용"><button type="button" data-tf-jump="tf-basics">시간봉 차이</button><button type="button" data-tf-jump="tf-flow">분석 순서</button><button type="button" data-tf-jump="tf-risk">관망·위험</button><button type="button" data-tf-jump="tf-checks">자가점검</button></nav>
      <section class="card tf-anchor" id="tf-basics"><h2>1. 봉 하나가 담는 시간이 다릅니다</h2><p>1분봉은 1분, 15분봉은 15분 동안의 <strong>시가·고가·저가·종가</strong>를 한 봉에 담습니다. 15분봉도 분봉입니다. 시간봉을 바꾸면 같은 시세를 다른 크기로 묶어 보는 것입니다.</p><div class="tf-table-wrap"><table class="tf-table"><caption>24시간 연속 거래에서의 시간봉 비교</caption><thead><tr><th scope="col">시간봉</th><th scope="col">봉 1개의 시간</th><th scope="col">하루의 봉 수</th></tr></thead><tbody>${G.intervals.map(t => `<tr><th scope="row">${esc(t.label)}<small>${esc(t.code)}</small></th><td>${esc(t.duration)}</td><td>${esc(t.count)}</td></tr>`).join('')}</tbody></table></div><p class="muted">4시간봉 6개 = 1일, 1시간봉 4개 = 4시간, 15분봉 4개 = 1시간입니다. 표의 개수는 같은 시간 기준·누락 없는 정상 데이터의 계산값입니다. 주식처럼 거래 시간이 정해진 시장이나 거래 중단·누락 데이터에는 그대로 적용하지 않습니다.</p><div class="notice"><strong>일봉이 닫히는 시각부터 확인하세요</strong>가상자산의 일봉 마감은 시장 전체가 문을 닫는다는 뜻이 아닙니다. 거래소·차트의 일봉 경계와 시간 기준을 확인하고, 한국시간 자정이라고 당연하게 가정하지 마세요. 같은 종목이라도 거래소·현물/선물·사용 가격이 다르면 봉도 달라질 수 있습니다.</div></section>
      <section class="card"><h2>2. 각 시간봉은 무엇을 맡을까요?</h2><div class="tf-select" role="group" aria-label="시간봉 역할 선택">${G.intervals.map((t, i) => `<button type="button" data-tf-choice="${esc(t.id)}" aria-pressed="${i === 0}">${esc(t.label)}</button>`).join('')}</div><div id="tf-role-panel" class="tf-role-panel" role="region" aria-live="polite" aria-label="선택한 시간봉 설명"></div><p class="muted">예를 들어 20개 봉의 이동평균도 일봉에서는 20일, 5분봉에서는 100분에 해당하는 봉들의 평균입니다. 같은 숫자의 지표라도 시간 범위는 다릅니다.</p></section>
      <details class="card"><summary>그림으로 보기: 5분봉 12개를 1시간봉 하나로 묶으면?</summary><div class="tf-details-body"><p>같은 가상 가격 안에 오르내림이 함께 있습니다. 작은 봉의 하락과 큰 봉의 상승이 동시에 보이는 이유를 비교하세요.</p>${tfAggregationFigure()}<p>한 개의 큰 봉만으로는 그 안에서 고가와 저가 중 무엇이 먼저 나왔는지 알 수 없습니다.</p></div></details>
      <section class="card tf-anchor" id="tf-flow"><h2>3. 큰 흐름에서 작은 흐름으로</h2><p class="tf-flow-summary">일봉 → 4시간봉 → 1시간봉 → 15분봉 → 5분봉</p><div class="notice"><strong>이 다섯 단계는 학습용 예시입니다</strong>공식 교육 자료의 큰 흐름→작은 흐름 원칙을 나누어 설명한 것이며, 검증된 수익 전략이나 의무 순서가 아닙니다. 모두 같은 방향일 때까지 무조건 기다리는 방법도 아닙니다. 실제로는 보유 기간과 검증한 계획에 맞춰 필요한 시간봉만 고르며, 1분봉은 선택 사항입니다.</div><ol class="tf-steps">${G.steps.map((s, i) => `<li><div class="tf-step-title"><span class="tf-number">${i + 1}</span><div><span class="badge">${esc(s.label)}</span><h3>${esc(s.title)}</h3></div></div><p class="tf-question">${esc(s.question)}</p><ul>${s.actions.map(a => `<li>${esc(a)}</li>`).join('')}</ul><p class="tf-record">${esc(s.record)}</p></li>`).join('')}</ol><p class="muted">여러 시간봉은 서로 다른 독립 증거가 아니라 같은 시세를 달리 묶은 것입니다. 시간봉 숫자를 많이 늘린다고 분석이 자동으로 좋아지지는 않습니다. 더 긴 보유 기간을 살필 때는 일봉보다 큰 주봉·월봉도 맥락으로 확인할 수 있습니다.</p></section>
      <section class="card"><h2>4. 가상 사례로 비교하기</h2><p class="muted">실제 종목·현재 시세·주문 지시가 아닙니다.</p>${G.cases.map(c => `<details class="tf-case"><summary>${esc(c.title)}</summary><div class="tf-details-body"><span class="badge warn">${esc(c.badge)}</span><p>${esc(c.body)}</p><p><strong>판단:</strong> ${esc(c.conclusion)}</p></div></details>`).join('')}</section>
      <section class="card tf-anchor" id="tf-risk"><h2>5. 작은 봉보다 먼저 정할 위험</h2><p><strong>무효화 위치 → 손실 예산 → 수량 → 비용·목표 확인</strong> 순서로 적습니다. 손절은 진입 근거가 틀렸다고 볼 구조에 맞춰 검토하는 것이지, 언제나 1분봉 꼬리 바로 아래에 붙이는 것이 아닙니다. 손절 거리가 넓어지면 같은 예산에서 수량을 줄이거나 거래를 하지 않을 수 있습니다.</p><div class="notice bad"><strong>봉 마감 기다리기와 손절 미루기는 다릅니다</strong>신호를 확인하는 시간 기준과 실제 손절·최대 손실 기준을 각각 적으세요. 일봉 마감을 기다린다며 위험 한도를 없애면 안 됩니다. 손절 주문도 지정한 트리거 가격의 체결을 보장하지 않으며, 수수료·슬리피지·미체결 위험은 남습니다.</div><a class="big-btn secondary" href="#lesson/risk-first">손절과 수량 계산 배우기</a><h3>이럴 때는 진입하지 않고 보류합니다</h3><ul class="check-list">${G.noTrade.map(t => `<li>${esc(t)}</li>`).join('')}</ul></section>
      <section class="card"><h2>6. 내 말로 계획 한 줄 쓰기</h2><p class="tf-plan-example">“일봉의 ___ 흐름 안에서 4시간봉 ___ 구간을 관찰한다. 1시간봉 ___ 조건이 마감으로 확인되고 15분봉 ___, 5분봉 ___ 조건이 생기면 진입 후보로 검토한다. 무효화는 ___, 손실 예산은 ___, 수량은 ___, 목표와 비용은 ___다. ___이면 거래하지 않는다.”</p><p class="muted">종이에 가상 사례로 채워 보세요. 현재 시장의 매수·매도 추천이 아니며, 이 화면에서 실제 주문은 나가지 않습니다.</p><ul class="check-list">${G.checklist.map(c => `<li>${esc(c)}</li>`).join('')}</ul><a class="big-btn secondary" href="#lesson/plan-exits">진입·손절·청산 계획으로 이어가기</a></section>
      <section class="card tf-anchor" id="tf-checks"><h2>7. 짧게 확인하기</h2><p class="muted">이 가이드의 자가점검 3문항입니다. 기존 120문제의 점수·학습 기록에는 합산하지 않습니다.</p>${G.checks.map((q, qi) => `<div class="tf-check"><h3>${qi + 1}. ${esc(q.question)}</h3><div class="tf-check-options" data-tf-check="${qi}">${q.options.map((o, oi) => `<button class="opt-btn" type="button" data-tf-answer="${oi}">${esc(o)}</button>`).join('')}</div><p class="feedback" id="tf-feedback-${qi}" role="status" tabindex="-1" hidden></p></div>`).join('')}<button class="big-btn secondary" type="button" id="tf-check-reset">자가점검 다시 풀기</button></section>
      <details class="card"><summary>공식 교육 자료와 이 가이드의 범위</summary><div class="tf-details-body"><p class="muted">확인 ${esc(G.checked)}. 아래 자료의 일반 원리를 한국어로 설명하고 학습용 사례를 구성했습니다. 일봉→4시간봉→1시간봉→15분봉→5분봉 전체 체인을 특정 기관이 그대로 검증한 것은 아닙니다. 외환·주식·선물 자료를 가상자산의 실거래 규칙으로 그대로 옮기지 마세요.</p><ul class="tf-sources">${G.sources.map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a><p class="muted">${esc(s.scope)}</p></li>`).join('')}</ul><p class="small-print">기술적 분석은 미래를 확정하지 못합니다. 본문과 그림은 교육용이며, 거래소 화면·상품·비용·마감 기준은 실제 사용 시 별도로 확인해야 합니다.</p></div></details>
      <div class="row"><a class="big-btn ghost" href="#lesson/read-chart">차트 기초</a><a class="big-btn ghost" href="#lesson/trendline">추세선·구조</a></div><a class="big-btn" href="#learn">24강 배우기로 돌아가기</a>
    `;
    const showRole = id => {
      const t = G.intervals.find(x => x.id === id) || G.intervals[0];
      $$('[data-tf-choice]', view).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tfChoice === t.id)));
      $('#tf-role-panel', view).innerHTML = `<h3>${esc(t.label)} · ${esc(t.role)}</h3><p>${esc(t.read)}</p><p class="notice"><strong>주의할 점</strong>${esc(t.caution)}</p>`;
    };
    $$('[data-tf-choice]', view).forEach(b => b.addEventListener('click', () => showRole(b.dataset.tfChoice)));
    showRole('1d');
    $$('[data-tf-jump]', view).forEach(b => b.addEventListener('click', () => {
      const target = document.getElementById(b.dataset.tfJump);
      if (target) { target.setAttribute('tabindex', '-1'); target.focus({ preventScroll: true }); target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); }
    }));
    $$('[data-tf-check]', view).forEach(group => group.addEventListener('click', e => {
      const button = e.target.closest('[data-tf-answer]');
      if (!button || button.disabled) return;
      const qi = Number(group.dataset.tfCheck), q = G.checks[qi], picked = Number(button.dataset.tfAnswer);
      $$('button', group).forEach(b => { b.disabled = true; if (Number(b.dataset.tfAnswer) === q.answer) b.classList.add('correct'); });
      if (picked !== q.answer) button.classList.add('wrong');
      const feedback = document.getElementById(`tf-feedback-${qi}`);
      feedback.className = `feedback ${picked === q.answer ? 'good' : 'bad'}`;
      feedback.textContent = (picked === q.answer ? '맞았습니다. ' : '다시 살펴보세요. ') + q.explanation;
      feedback.hidden = false;
      feedback.focus({ preventScroll: true });
    }));
    $('#tf-check-reset', view).addEventListener('click', () => {
      $$('[data-tf-answer]', view).forEach(b => { b.disabled = false; b.classList.remove('correct', 'wrong'); });
      $$('.tf-check .feedback', view).forEach(p => { p.hidden = true; p.textContent = ''; p.className = 'feedback'; });
      $('[data-tf-answer]', view)?.focus();
    });
  }

  // ---------- 그림 확대 ----------
  // 확대 창을 열 때 같은 주소로 history 항목을 하나 넣어 둔다. 그러면 휴대폰 뒤로 버튼(popstate)이
  // 강의 밖으로 나가는 대신 확대 창만 닫는다. 닫기 버튼·Esc 는 history.back() 으로 그 항목을 지운다.
  let zoomReturnFocus = null;
  let zoomClosing = false;
  let zoomBackPending = false; // 닫기 버튼이 보낸 history.back() 이 아직 도착하지 않음
  const zoomIsOpen = () => $('#modal-root').childElementCount > 0;
  const hasZoomState = () => !!(history.state && history.state.cbZoom);
  function closeZoom(restoreFocus = true) {
    const root = $('#modal-root');
    zoomClosing = false;
    root.innerHTML = ''; root.onclick = null; root.onkeydown = null;
    $('#app').inert = false; document.body.style.overflow = '';
    if (restoreFocus && zoomReturnFocus?.isConnected) zoomReturnFocus.focus();
    zoomReturnFocus = null;
  }
  // 닫기 버튼·Esc: 넣어 둔 history 항목이 있으면 뒤로 가서 지운다(popstate 가 닫음). 없으면 바로 닫는다.
  function dismissZoom() {
    if (zoomClosing) return;
    if (!hasZoomState() || zoomBackPending) { closeZoom(); return; } // 앞서 보낸 뒤로가기가 아직 오는 중이면 그것이 항목을 지운다
    zoomClosing = true; zoomBackPending = true;
    history.back();
    setTimeout(() => { zoomBackPending = false; }, 2000); // 뒤로가기가 끝내 안 오면 다음 휴대폰 뒤로 버튼을 가로채지 않게
    setTimeout(() => { if (zoomClosing && zoomIsOpen()) closeZoom(); }, 400); // popstate 가 안 오는 예외 상황 대비
  }
  function openZoom(src, alt) {
    const root = $('#modal-root');
    zoomReturnFocus = document.activeElement;
    let zoom = 100;
    root.innerHTML = `<div class="modal-bg" role="dialog" aria-modal="true" aria-label="학습 그림 확대"><div class="modal-top"><button type="button" data-z="-">－ 작게</button><span>손가락으로 밀어서 보세요</span><button type="button" data-z="+">＋ 크게</button><button type="button" data-z="x">닫기</button></div><div class="zoom-area"><img src="${esc(src)}" alt="${esc(alt || '확대된 학습 그림')}" style="--zoom:100%"></div></div>`;
    const img = $('img', root);
    $('#app').inert = true; document.body.style.overflow = 'hidden';
    zoomClosing = false;
    if (!hasZoomState()) { try { history.pushState({ cbZoom: 1 }, '', location.href); } catch (_) { /* 기록을 못 넣는 환경: 뒤로 버튼은 이전 화면으로 간다 */ } }
    root.onclick = (e) => {
      const b = e.target.closest('[data-z]'); if (!b) return;
      if (b.dataset.z === 'x') { dismissZoom(); return; }
      zoom = Math.max(100, Math.min(400, zoom + (b.dataset.z === '+' ? 50 : -50)));
      img.style.setProperty('--zoom', zoom + '%');
    };
    root.onkeydown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); dismissZoom(); }
      if (e.key === 'Tab') {
        const buttons = $$('button', root), first = buttons[0], last = buttons[buttons.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    $('[data-z="x"]', root).focus();
  }
  document.addEventListener('click', (e) => { const z = e.target.closest('[data-zoom]'); if (z) openZoom(z.dataset.zoom, z.dataset.zoomAlt || z.getAttribute('alt')); });
  window.addEventListener('popstate', () => {
    if (zoomBackPending) {
      zoomBackPending = false;
      // 느린 기기에서 뒤로가기가 늦게 와서 그사이 확대 창을 다시 연 경우: 창은 그대로 두고 기록 항목만 새로 넣는다
      if (zoomIsOpen() && !zoomClosing) { try { history.pushState({ cbZoom: 1 }, '', location.href); } catch (_) { /* 무시 */ } return; }
    }
    if (zoomIsOpen()) { closeZoom(); return; }
    // 확대 창이 닫힌 채 남은 항목(주소창 이동·새로고침 뒤)에 도착한 경우: 표시만 지워 다시 열 때 항목이 겹치지 않게 한다
    if (hasZoomState()) { try { history.replaceState(null, '', location.href); } catch (_) { /* 무시 */ } }
  });
  // 새로고침 뒤에는 브라우저가 history.state 를 되살리므로, 확대 창이 없는데 표시만 남은 경우를 지운다
  if (hasZoomState()) { try { history.replaceState(null, '', location.href); } catch (_) { /* 무시 */ } }

  // ---------- 문제 허브 ----------
  function renderQuizHub() {
    setTop('문제 도전', '#home');
    const st = totalStats();
    const acc = st.seen ? Math.round(st.ok / st.seen * 100) : 0;
    const wrong = wrongIds().length;
    const imgN = BANK.filter((q) => q.image).length;
    const stars = Math.min(5, Math.floor(st.ok / 20));
    view.innerHTML = html`
      <div class="card center"><div class="stars">${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}</div><div class="muted">정답 20개마다 별 하나 · 지금까지 정답 ${st.ok}개</div>
        <div class="stat-grid"><div><b>${st.seen}</b><span>푼 문제</span></div><div><b>${acc}%</b><span>정답률</span></div><div><b>${BANK.length}</b><span>문제 은행</span></div></div></div>
      <a class="big-btn accent" href="#quiz/play?mode=daily">🎯 오늘의 도전 10문제</a>
      <a class="big-btn" href="#quiz/play?mode=image">🖼 그림 보고 답하기 (${imgN}문제 중 10)</a>
      <a class="big-btn ${wrong ? 'danger' : 'secondary'}" href="#quiz/play?mode=wrong" ${wrong ? '' : 'aria-disabled="true" onclick="return false"'}>🔁 틀린 문제 다시 풀기 (${wrong}개)</a>
      <h2 class="part-head">단원별 세트</h2>
      ${PARTS.map((p, i) => `<a class="big-btn secondary" href="#quiz/play?mode=part&id=${i}">${esc(p)} (${BANK.filter((q) => partOf(lessonOf(q.lesson) || {}) === i).length}문제)</a>`).join('')}
      <div class="tip">틀려도 괜찮습니다. 해설을 읽고 "왜"를 한 번 말해 보면 오래 기억됩니다.</div>
      <button class="big-btn ghost" type="button" data-act="reset">기록 지우기</button>
    `;
    $('[data-act="reset"]', view).addEventListener('click', () => { if (confirm('문제 기록을 모두 지울까요?')) { S.quiz = {}; save(); renderQuizHub(); } });
  }

  // ---------- 문제 풀기 ----------
  const Q = { list: [], idx: 0, correct: 0, answered: false, mode: 'daily', label: '' };

  function pickSet(mode, id) {
    let pool = BANK.slice();
    let label = '오늘의 도전';
    if (mode === 'lesson') { pool = BANK.filter((q) => q.lesson === id); label = `${pad2(lessonIndex(id) + 1)}강 문제`; }
    else if (mode === 'image') { pool = shuffle(BANK.filter((q) => q.image)).slice(0, 10); label = '그림 보고 답하기'; }
    else if (mode === 'wrong') { const w = new Set(wrongIds()); pool = shuffle(BANK.filter((q) => w.has(q.id))).slice(0, 15); label = '틀린 문제 다시'; }
    else if (mode === 'part') { pool = shuffle(BANK.filter((q) => partOf(lessonOf(q.lesson) || {}) === Number(id))); label = PARTS[Number(id)] || '단원 세트'; }
    else { // daily: 덜 본 문제 우선, 배운 강 우선
      const scored = pool.map((q) => ({ q, w: (qStat(q.id).seen ? 1 : 0) * 2 + (S.done[q.lesson] ? 0 : 1) + Math.random() }));
      scored.sort((a, b) => a.w - b.w);
      pool = scored.slice(0, 10).map((x) => x.q);
    }
    return { list: mode === 'lesson' ? pool : shuffle(pool), label };
  }

  function renderQuizPlay(params) {
    const mode = params.get('mode') || 'daily';
    const id = params.get('id');
    const set = pickSet(mode, id);
    Q.list = set.list; Q.idx = 0; Q.correct = 0; Q.answered = false; Q.mode = mode; Q.label = set.label; Q.lessonId = id;
    if (!Q.list.length) { setTop('문제', '#quiz'); view.innerHTML = `<div class="card"><h2>풀 문제가 없습니다</h2><p class="muted">먼저 다른 세트를 풀어 보세요.</p><a class="big-btn" href="#quiz">문제 허브로</a></div>`; return; }
    renderQuestion();
  }

  function renderQuestion() {
    const q = Q.list[Q.idx];
    setTop(`${Q.idx + 1}/${Q.list.length} · ${Q.label}`, Q.mode === 'lesson' ? `#lesson/${Q.lessonId}` : '#quiz');
    const L = lessonOf(q.lesson);
    const keys = ['①', '②', '③', '④'];
    view.innerHTML = html`
      <div class="quiz-top"><span>${pad2(q.lessonNo)}강 · ${esc(L ? L.title : '')}</span><span class="pts">${Q.correct * 10}점</span></div>
      <div class="progress"><i style="width:${Math.round(Q.idx / Q.list.length * 100)}%"></i></div>
      ${q.image ? figureHtml(q.image) : ''}
      <div class="question">${esc(q.question)}</div>
      <div id="opts">${q.options.map((o, k) => `<button class="opt-btn" type="button" data-k="${k}"><span class="k">${keys[k] || k + 1}</span><span>${esc(o)}</span></button>`).join('')}</div>
      <div id="fb"></div>
    `;
    Q.answered = false;
    $('#opts', view).addEventListener('click', (e) => {
      const b = e.target.closest('.opt-btn'); if (!b || Q.answered) return;
      Q.answered = true;
      const k = Number(b.dataset.k);
      const ok = k === q.answer;
      $$('.opt-btn', view).forEach((x) => { x.disabled = true; const kk = Number(x.dataset.k); if (kk === q.answer) x.classList.add('correct'); else if (kk === k) x.classList.add('wrong'); });
      const st = qStat(q.id); st.seen++; if (ok) st.ok++; else st.ng++; st.lastOk = ok; S.quiz[q.id] = st;
      if (ok) Q.correct++;
      save();
      if (navigator.vibrate && !ok) { try { navigator.vibrate(120); } catch (e) { /* 무시 */ } }
      const last = Q.idx + 1 >= Q.list.length;
      $('#fb', view).innerHTML = `<div class="feedback ${ok ? 'good' : 'bad'}"><strong>${ok ? '⭕ 맞았어요!' : '❌ 아쉬워요'}</strong>${ok ? '' : `<div>정답: ${keys[q.answer]} ${esc(q.options[q.answer])}</div>`}<div style="margin-top:6px">${esc(q.explanation)}</div></div><button class="big-btn" type="button" id="next-q">${last ? '결과 보기' : '다음 문제 ›'}</button>`;
      $('#next-q', view).addEventListener('click', () => { if (last) renderResult(); else { Q.idx++; renderQuestion(); window.scrollTo(0, 0); } });
      $('#fb', view).scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    window.scrollTo(0, 0);
  }

  function renderResult() {
    const n = Q.list.length, c = Q.correct;
    const pct = Math.round(c / n * 100);
    const stars = pct >= 90 ? 3 : pct >= 70 ? 2 : pct >= 50 ? 1 : 0;
    if (Q.mode === 'lesson' && Q.lessonId && c >= Math.ceil(n * 0.75)) { S.done[Q.lessonId] = true; save(); }
    const wrongHere = Q.list.filter((q) => qStat(q.id).lastOk === false);
    setTop('결과', '#quiz');
    view.innerHTML = html`
      <div class="card center"><div class="stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</div><div class="score-big">${c} / ${n}</div><div class="muted">${pct >= 90 ? '훌륭해요! 거의 다 맞았습니다.' : pct >= 70 ? '잘했어요. 틀린 문제만 다시 보면 됩니다.' : pct >= 50 ? '절반 넘게 맞았어요. 해설을 다시 읽어 보세요.' : '괜찮아요. 해당 강을 한 번 더 읽고 다시 풀어 보세요.'}</div></div>
      ${wrongHere.length ? `<div class="card"><h2>다시 볼 문제</h2><ul>${wrongHere.map((q) => `<li>${esc(q.question)} <a href="#lesson/${esc(q.lesson)}">(${pad2(q.lessonNo)}강 읽기)</a></li>`).join('')}</ul></div>` : ''}
      <button class="big-btn accent" type="button" id="replay-quiz">🔁 한 번 더</button>
      ${wrongHere.length ? '<a class="big-btn danger" href="#quiz/play?mode=wrong">틀린 문제만 다시</a>' : ''}
      <a class="big-btn secondary" href="#quiz">문제 허브로</a>
    `;
    $('#replay-quiz', view).addEventListener('click', () => {
      const params = new URLSearchParams(); params.set('mode', Q.mode);
      if (Q.lessonId) params.set('id', Q.lessonId);
      renderQuizPlay(params);
    });
    window.scrollTo(0, 0);
  }

  // ---------- 바이낸스 ----------
  function renderBinance() {
    setTop('바이낸스 선물 앱', '#home');
    const phases = [];
    STEPS.forEach((s) => { if (!phases.includes(s.phase)) phases.push(s.phase); });
    const doneN = STEPS.filter((s) => S.bnb[s.id]).length;
    view.innerHTML = html`
      <div class="notice bad"><strong>먼저 읽어 주세요</strong>선물은 맡긴 돈을 전부 잃을 수 있습니다. 이 순서는 화면을 익히기 위한 것이고, 실제 주문을 권하는 것이 아닙니다. 모의거래와 소액으로 먼저 연습하세요.</div>
      <div class="progress"><i style="width:${Math.round(doneN / Math.max(1, STEPS.length) * 100)}%"></i></div><div class="muted">${doneN} / ${STEPS.length}단계 확인 · ${esc(META.checked || '')}</div>
      <div class="tip">바이낸스 안내는 영문·한글 짝그림으로 비교합니다. 단계 안의 번호를 누르면 설명에 맞는 위치가 강조됩니다. 업비트 8·9단계의 한글 공식 참고 사진은 그대로 볼 수 있습니다.</div>
      <details class="card"><summary style="font-weight:700;cursor:pointer">🇰🇷 한국 이용자가 꼭 알 것 ${META.korea_notes.length}가지</summary><ul style="margin-top:8px">${META.korea_notes.map((n) => `<li style="margin-bottom:6px">${esc(n)}</li>`).join('')}</ul></details>
      <details class="card"><summary style="font-weight:700;cursor:pointer">📚 용어 풀이 ${META.glossary.length}개</summary><dl class="gloss">${META.glossary.map(([t, e]) => `<dt>${esc(t)}</dt><dd>${esc(e)}</dd>`).join('')}</dl></details>
      ${phases.map((p) => `<h2 class="phase-head"><span>${esc(p)}</span><span class="muted">${STEPS.filter((s) => s.phase === p && S.bnb[s.id]).length}/${STEPS.filter((s) => s.phase === p).length}</span></h2>${STEPS.map((s, i) => ({ s, i })).filter(({ s }) => s.phase === p).map(({ s, i }) => `<a class="step-item ${S.bnb[s.id] ? 'done' : ''}" href="#binance/${i}"><span class="num">${S.bnb[s.id] ? '✓' : i + 1}</span><span><div class="t">${esc(s.title)}</div><div class="s">${esc(s.menu)}</div></span><span class="chev">›</span></a>`).join('')}`).join('')}
      <a class="big-btn accent" href="#binance/${STEPS.findIndex((s) => !S.bnb[s.id]) >= 0 ? STEPS.findIndex((s) => !S.bnb[s.id]) : 0}">▶ 이어서 보기</a>
    `;
  }

  function el(spec) {
    const hl = spec.hl === true ? ' hl' : '';
    switch (spec.t) {
      case 'title': return `<div class="ph-title${hl}">${esc(spec.text)}</div>`;
      case 'text': return `<div class="ph-note${hl}">${esc(spec.text)}</div>`;
      case 'tabs': return `<div class="ph-tabs">${spec.items.map((x, i) => `<span class="${i === spec.on ? 'on' : ''}${i === spec.hl ? ' hl' : ''}">${esc(x)}</span>`).join('')}</div>`;
      case 'seg': return `<div class="ph-seg">${spec.items.map((x, i) => `<span class="${i === spec.on ? 'on' : ''}${i === spec.hl ? ' hl' : ''}">${esc(x)}</span>`).join('')}</div>`;
      case 'btn': return `<div class="ph-btn ${esc(spec.color || 'yellow')}${hl}">${esc(spec.label)}</div>`;
      case 'row': return `<div style="display:flex;gap:8px">${spec.items.map((x) => `<div style="flex:1">${el(x)}</div>`).join('')}</div>`;
      case 'input': return `<div class="ph-input${hl}"><small>${esc(spec.label)}</small><span>${esc(spec.value)}</span></div>`;
      case 'list': return `<div class="ph-list">${spec.items.map((r) => `<div class="${r[2] ? 'hl' : ''}"><span>${esc(r[0])}</span><span>${esc(r[1])}</span></div>`).join('')}</div>`;
      case 'kv': return `<div class="ph-kv">${spec.items.map((r) => `<div class="${r[2] ? 'hl' : ''}"><small>${esc(r[0])}</small>${esc(r[1])}</div>`).join('')}</div>`;
      case 'toggle': return `<div class="ph-toggle${hl}"><span>${esc(spec.label)}</span><i class="${spec.on ? 'on' : ''}"></i></div>`;
      case 'nav': return `<div class="ph-nav">${spec.items.map((x, i) => `<span class="${i === spec.on ? 'on' : ''}${i === spec.hl ? ' hl' : ''}">${esc(x)}</span>`).join('')}</div>`;
      case 'slider': return `<div class="ph-slider${hl}"><div style="display:flex;justify-content:space-between"><span>값</span><b>${esc(spec.value)}</b></div><div class="track"><i style="left:calc(${Math.round((spec.pos || 0) * 100)}% - 9px)"></i></div><div class="ticks">${(spec.ticks || []).map((t) => `<span>${esc(t)}</span>`).join('')}</div></div>`;
      case 'store': return `<div class="ph-store${hl}"><div class="logo">B</div><div><div>${esc(spec.name)}</div><small>${esc(spec.dev)}</small></div></div>`;
      case 'pos': return `<div class="ph-pos${hl}"><div><b style="color:${spec.side === '롱' ? '#0ecb81' : '#f6465d'}">${esc(spec.side)}</b> ${esc(spec.sym)} · ${esc(spec.lev)}</div><div class="pnl ${spec.neg ? 'neg' : ''}">${esc(spec.pnl)}</div><div class="ph-kv">${spec.items.map((r) => `<div class="${r[2] ? 'hl' : ''}"><small>${esc(r[0])}</small>${esc(r[1])}</div>`).join('')}</div></div>`;
      case 'chart': return `<div class="ph-chart">${miniChartSvg()}</div>`;
      default: return '';
    }
  }
  function miniChartSvg() {
    let s = '<svg viewBox="0 0 320 110" preserveAspectRatio="none">';
    let p = 55; const rng = mulberry32(7);
    for (let i = 0; i < 32; i++) { const o = p; const c = o + (rng() - 0.48) * 14; const h = Math.max(o, c) + rng() * 6; const l = Math.min(o, c) - rng() * 6; const x = 6 + i * 9.6; const col = c >= o ? '#0ecb81' : '#f6465d'; s += `<line x1="${x + 3}" y1="${110 - h}" x2="${x + 3}" y2="${110 - l}" stroke="${col}" stroke-width="1"/><rect x="${x}" y="${110 - Math.max(o, c)}" width="6" height="${Math.max(1, Math.abs(c - o))}" fill="${col}"/>`; p = c; }
    return s + '</svg>';
  }

  // ---------- 영문·한글 짝그림과 설명 번호 ----------
  function biWrap(text, width = 245, size = 18) {
    const unit = (c) => /[\u1100-\u11ff\u2e80-\ua4cf\uac00-\ud7af]/.test(c) ? size : /[MW@%]/.test(c) ? size * .85 : /[il.,' :]/.test(c) ? size * .32 : size * .57;
    const measure = (t) => { let w = 0; for (const c of t) w += unit(c); return w; };
    const result = [];
    String(text || '').split('\n').forEach((para) => {
      let line = '';
      for (const word of (para.match(/\S+/g) || [])) {
        const next = line ? line + ' ' + word : word;
        if (measure(next) <= width) { line = next; continue; }
        if (line) result.push(line);
        line = '';
        for (const ch of word) { if (line && measure(line + ch) > width) { result.push(line); line = ''; } line += ch; }
      }
      result.push(line);
    });
    while (result.length > 1 && !result[result.length - 1]) result.pop();
    return result;
  }
  function biText(text, x, y, width, size, color = '#eaecef', weight = 400) {
    return `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" font-weight="${weight}">${biWrap(text, width, size).map((line, i) => `<tspan x="${x}" dy="${i ? size * 1.35 : 0}">${esc(line)}</tspan>`).join('')}</text>`;
  }
  function biRowHeight(row) {
    if (row.kind === 'nav') return 70;
    const labels = Math.max(biWrap(row.en).length, biWrap(row.ko).length);
    const values = row.valueEn || row.valueKo ? Math.max(biWrap(row.valueEn, 245, 16).length, biWrap(row.valueKo, 245, 16).length) : 0;
    const content = 20 + labels * 25 + (values ? values * 22 + 5 : 0) + 14;
    return Math.max(row.kind === 'camera' || row.kind === 'chart' ? 156 : row.kind === 'slider' ? 100 : 64, content + (['camera','chart','slider'].includes(row.kind) ? 80 : 0));
  }
  function biScreenSvg(frame, action, number, lang) {
    const rows = frame.rows || [], heights = rows.map(biRowHeight);
    const titleLines = Math.max(biWrap(frame.en, 264, 18).length, biWrap(frame.ko, 264, 18).length);
    const headBottom = Math.max(108, 83 + (titleLines - 1) * 25);
    const height = headBottom + 15 + heights.reduce((a, b) => a + b + 9, 0) + 64;
    const isEn = lang === 'en';
    let y = headBottom + 15;
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="${height}" viewBox="0 0 360 ${height}" role="img" lang="${isEn ? 'en' : 'ko'}"><title>${esc((isEn ? 'Learning illustration' : '학습용 모형') + ' · ' + number + ' · ' + frame[lang])}</title><rect x="2" y="2" width="356" height="${height - 4}" rx="25" fill="#0b0e11" stroke="#47515e" stroke-width="4"/><g font-family="Arial,Malgun Gothic,sans-serif"><text x="20" y="29" fill="#f0b90b" font-size="12" font-weight="700">${isEn ? (frame.kind === 'concept' ? 'CONCEPT · NOT A LIVE SCREEN' : 'MOCKUP · NOT A SCREENSHOT') : (frame.kind === 'concept' ? '개념 그림 · 실제 화면 아님' : '학습용 모형 · 실제 캡처 아님')}</text><text x="20" y="69" fill="#eaecef" font-size="27">‹</text>${biText(frame[lang], 51, 60, 264, 18, '#eaecef', 700)}<line x1="16" y1="${headBottom}" x2="344" y2="${headBottom}" stroke="#2b3139"/>`;
    rows.forEach((row, index) => {
      const h = heights[index], marked = action.targets.includes(row.id), label = row[lang], value = row[isEn ? 'valueEn' : 'valueKo'];
      const colors = { yellow: '#f0b90b', green: '#0ecb81', red: '#f6465d', gray: '#2b3139' };
      const buttonColor = colors[row.color] || colors.yellow;
      const fill = row.kind === 'button' ? buttonColor : row.kind === 'notice' ? '#121922' : '#1e2329';
      const ink = row.kind === 'button' && row.color !== 'gray' && row.color !== 'red' ? '#111820' : '#eaecef';
      const valInk = row.kind === 'button' && row.color !== 'gray' && row.color !== 'red' ? '#243038' : '#aeb8c5';
      svg += `<rect x="15" y="${y}" width="330" height="${h}" rx="9" fill="${fill}" stroke="${marked ? '#f0b90b' : '#35404b'}" stroke-width="${marked ? 3 : 1}"${row.kind === 'notice' ? ' stroke-dasharray="5 4"' : ''}/>`;
      if (row.kind === 'nav') {
        const nav = [['Home','홈'],['Markets','시장'],['Futures','선물'],['Assets','자산']];
        const ni = nav.findIndex(n => n[0] === row.en);
        if (ni < 0) throw new Error('지원하지 않는 모형 내비게이션: ' + row.en);
        nav.forEach((n, j) => { const nx = 18 + j * 82; svg += `<rect x="${nx}" y="${y + 5}" width="77" height="60" rx="7" fill="${j === ni ? '#3a3420' : '#1e2329'}"/><circle cx="${nx + 38}" cy="${y + 23}" r="5" fill="${j === ni ? '#f0b90b' : '#77828f'}"/><text x="${nx + 38}" y="${y + 52}" text-anchor="middle" fill="${j === ni ? '#f0b90b' : '#aeb8c5'}" font-size="13">${esc(n[isEn ? 0 : 1])}</text>`; });
        if (marked) svg += biMarker(30 + ni * 82, y + 15, number);
      } else {
        if (marked) svg += biMarker(33, y + 25, number);
        const ly = y + 27;
        svg += biText(label, 61, ly, 245, 18, ink, 700);
        const valueY = ly + biWrap(label).length * 25;
        if (value) svg += biText(value, 61, valueY, 245, 16, valInk);
        const gy = y + h - 69;
        if (row.kind === 'chart') {
          svg += `<line x1="62" y1="${gy + 54}" x2="316" y2="${gy + 54}" stroke="#47515e"/>`;
          [32,25,38,22,17,26,12,8].forEach((v,j) => { const gx=71+j*28,up=j%3!==1; svg+=`<line x1="${gx+6}" y1="${gy+v-7}" x2="${gx+6}" y2="${gy+v+24}" stroke="${up?'#0ecb81':'#f6465d'}" stroke-width="2"/><rect x="${gx}" y="${gy+v}" width="12" height="16" fill="${up?'#0ecb81':'#f6465d'}"/>`; });
        }
        if (row.kind === 'camera') svg += `<rect x="130" y="${gy}" width="96" height="57" rx="13" fill="none" stroke="#758294" stroke-dasharray="5 4"/><circle cx="178" cy="${gy+20}" r="11" fill="none" stroke="#aeb8c5" stroke-width="2"/><path d="M156 ${gy+49} Q178 ${gy+25} 200 ${gy+49}" fill="none" stroke="#aeb8c5" stroke-width="2"/>`;
        if (row.kind === 'slider') svg += `<line x1="69" y1="${gy+34}" x2="311" y2="${gy+34}" stroke="#697582" stroke-width="5"/><circle cx="92" cy="${gy+34}" r="9" fill="#f0b90b"/>`;
      }
      y += h + 9;
    });
    svg += `<text x="180" y="${height - 35}" text-anchor="middle" fill="#b4bec9" font-size="12">${isEn ? 'Illustrative layout · No real orders' : '위치는 모형 기준 · 실제 주문 없음'}</text><text x="180" y="${height - 17}" text-anchor="middle" fill="#82909e" font-size="11">${isEn ? 'Translation pair · Kim Min-su © 2026' : '영한 번역 짝그림 · 김민수 © 2026'}</text></g></svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  function biMarker(x, y, number) { return `<circle cx="${x}" cy="${y}" r="17" fill="#f0b90b" stroke="#0b0e11" stroke-width="2"/><text x="${x}" y="${y+6}" text-anchor="middle" fill="#111820" font-size="19" font-weight="700">${number}</text>`; }
  function renderBilingualGuide(root, s) {
    const guide = s.bilingual;
    if (!guide?.actions?.length) { root.innerHTML = '<div class="notice">영한 화면 자료를 불러오지 못했습니다. 자료를 확인해 주세요.</div>'; return; }
    let current = 0;
    root.innerHTML = `<section class="card bi-guide"><h2>영문 화면과 한글 풀이</h2><p class="small-print"><strong>학습용 모형 · 실제 캡처 아님.</strong> 번호를 누르면 해당 위치로 이동합니다. 영문 그림과 한글 풀이를 비교하세요.</p><details class="bi-how"><summary>그림과 번호 보는 법</summary><p>번호는 아래 ‘이렇게 합니다’와 같습니다. 번호를 누르면 필요한 화면과 위치가 함께 바뀝니다. 여러 화면에 걸친 과정은 나누어 보여 줍니다. 위치는 이 모형의 기준이며 현재 앱과 다를 수 있습니다. 한글 그림은 설명용 번역으로, 실제 한국어 앱 제공을 뜻하지 않습니다.</p></details><div class="bi-number-list" role="group" aria-label="설명 번호 선택">${guide.actions.map((a,i)=>`<button type="button" data-bi-number="${i}" aria-pressed="${i===0}" aria-label="${i+1}번 설명 위치 보기">${i+1}</button>`).join('')}</div><div id="bi-current" class="bi-current" role="status" tabindex="-1"></div><div class="bi-modes" role="group" aria-label="그림 보기 방식"><button type="button" data-bi-mode="both" aria-pressed="true">둘 다</button><button type="button" data-bi-mode="en" aria-pressed="false">영문만</button><button type="button" data-bi-mode="ko" aria-pressed="false">한글만</button></div><p class="small-print">작은 화면에서는 영문 그림 아래에 한글 풀이가 이어집니다. ‘영문만·한글만’으로 한 장씩 볼 수도 있습니다. ‘크게 보기’로 더 확대할 수 있습니다. 점선 상자는 교재 안내이며 실제 앱 문구가 아닙니다.</p><div class="bi-compare-scroll" role="region" aria-label="영문과 한글 비교 그림. 넓은 화면은 좌우, 작은 화면은 위아래로 놓입니다." tabindex="0"><div id="bi-pair" class="bi-pair" data-mode="both"></div></div><div id="bi-location" class="bi-location"></div><div class="step-nav"><button class="big-btn secondary" type="button" data-bi-nav="-1">‹ 이전 번호</button><button class="big-btn secondary" type="button" data-bi-nav="1">다음 번호 ›</button></div><p class="small-print">위쪽 ${Number(s.id)}단계는 전체 안내 순서, 그림의 1~${guide.actions.length}번은 이 단계 안의 설명 순서입니다. 노란 테두리와 같은 번호를 양쪽에서 비교하세요.</p></section>`;
    const show = (index, scroll = false) => {
      if (!Number.isInteger(index) || index < 0 || index >= guide.actions.length) return;
      current = index;
      const action = guide.actions[index], frame = guide.frames[action.frame], n = index + 1;
      if (!frame) { $('#bi-current', root).textContent = '이 번호의 화면 자료를 찾지 못했습니다.'; $('#bi-pair', root).innerHTML = ''; return; }
      const selected = frame.rows.filter(r => action.targets.includes(r.id));
      $('#bi-current', root).innerHTML = `<strong>${n}. ${esc(s.steps[index])}</strong><p class="bi-translation">${selected.map(r=>`<span lang="en">${esc(r.en)}</span> → ${esc(r.ko)}`).join('<br>')}</p>${frame.kind === 'concept' || /미확인/.test(s.verified) ? '<span class="badge warn">현재 앱 위치 미확인 · 개념 그림 포함</span>' : ''}`;
      $('#bi-location', root).innerHTML = `<p><strong>${n}번 위치:</strong> ${esc(action.location)}</p><p>${esc(action.note || '')}</p>${action.kind === 'check' ? '<p class="small-print">이 번호는 버튼을 누르라는 뜻이 아니라 확인·판단 사항을 가리킵니다.</p>' : ''}`;
      $('#bi-pair', root).innerHTML = ['en','ko'].map(lang=>{
        const src = biScreenSvg(frame, action, n, lang), name = lang === 'en' ? '영문' : '한글';
        return `<figure class="bi-side bi-side-${lang}"><figcaption><strong>${lang === 'en' ? 'English' : '한글 풀이'}</strong><span>${n}번 강조 위치</span></figcaption><img src="${esc(src)}" alt="${esc(name+' 학습용 모형, '+n+'번: '+s.steps[index]+' '+action.location)}" data-zoom="${esc(src)}"><button class="bi-zoom" type="button" data-zoom="${esc(src)}" data-zoom-alt="${esc(name+' 학습용 모형, '+n+'번 위치, '+frame.ko)}">${name} 크게 보기</button></figure>`;
      }).join('');
      $$('[data-bi-number]', root).forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.biNumber)===current)));
      $$('[data-bi-instruction]', view).forEach(b=>{const active=Number(b.dataset.biInstruction)===current;b.setAttribute('aria-pressed',String(active));b.parentElement.classList.toggle('is-active',active);});
      $('[data-bi-nav="-1"]', root).disabled = current === 0;
      $('[data-bi-nav="1"]', root).disabled = current === guide.actions.length - 1;
      if (scroll) { $('#bi-current', root).focus({preventScroll:true}); $('#bi-current', root).scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'}); }
    };
    $$('[data-bi-number]', root).forEach(b=>b.addEventListener('click',()=>show(Number(b.dataset.biNumber),true)));
    $$('[data-bi-nav]', root).forEach(b=>b.addEventListener('click',()=>show(current+Number(b.dataset.biNav),true)));
    $$('[data-bi-instruction]', view).forEach(b=>b.addEventListener('click',()=>show(Number(b.dataset.biInstruction),true)));
    $$('[data-bi-mode]', root).forEach(b=>b.addEventListener('click',()=>{ $('#bi-pair',root).dataset.mode=b.dataset.biMode;$$('[data-bi-mode]',root).forEach(x=>x.setAttribute('aria-pressed',String(x===b))); }));
    show(0);
  }

  function renderStepReferences(root, guide) {
    if (!root || !guide.references?.length) return;
    let current = 0;
    function draw(focusTitle = false) {
      const item = guide.references[current];
      const src = IMG(item.image);
      root.innerHTML = `<h2 class="part-head">공식 화면으로 확인하기</h2>
        <div class="notice"><strong>사진 속 코인과 숫자는 예시입니다</strong>${esc(guide.note)}</div>
        <div class="labels"><span class="badge">업비트 공식 참고 화면</span><span role="status">${current + 1} / ${guide.references.length}</span></div>
        <h3 class="reference-title" tabindex="-1">${esc(item.title)}</h3>
        <figure class="figure step-reference"><img src="${src}" alt="${esc(item.title + ' · 업비트 공식 도움말 예시 화면')}" data-zoom="${src}"><figcaption><span>${esc(item.caption)}</span><button class="zoom-btn" type="button" data-zoom="${src}">🔍 크게</button></figcaption></figure>
        <div class="step-nav reference-nav"><button class="big-btn secondary" type="button" data-reference="prev" ${current === 0 ? 'disabled' : ''}>‹ 앞 사진</button><button class="big-btn secondary" type="button" data-reference="next" ${current === guide.references.length - 1 ? 'disabled' : ''}>다음 사진 ›</button></div>
        <p class="small-print reference-source">출처: 업비트 고객센터 · 확인 ${esc(guide.checked)} · <a href="${esc(item.source)}" target="_blank" rel="noopener noreferrer">공식 설명</a> · <a href="${esc(item.original)}" target="_blank" rel="noopener noreferrer">원본 전체</a><br>공식 자료의 해당 화면 부분을 발췌·크기 조정했습니다. 화면 자료의 권리는 업비트·두나무 등 해당 권리자에게 있습니다.</p>`;
      root.querySelector('[data-reference="prev"]').addEventListener('click', () => { if (current > 0) { current--; draw(true); } });
      root.querySelector('[data-reference="next"]').addEventListener('click', () => { if (current + 1 < guide.references.length) { current++; draw(true); } });
      if (focusTitle) root.querySelector('.reference-title').focus({ preventScroll: true });
    }
    draw();
  }

  function renderStep(idx) {
    const s = STEPS[idx];
    if (!s) { location.hash = '#binance'; return; }
    setTop(`${idx + 1}/${STEPS.length} · ${s.phase}`, '#binance');
    const shotBase = `img/binance/${s.id}`;
    view.innerHTML = html`
      <div class="eyebrow">${esc(s.phase)} · ${idx + 1}단계</div>
      <h2 class="page-title">${esc(s.title)}</h2>
      <div class="kbd" style="font-size:0.9em;padding:6px 10px;line-height:1.4">${esc(s.menu)}</div>
      ${s.id === '09' ? '<div class="tip">실제 전송 전에는 <a href="#binance/9">10단계에서 받을 주소와 네트워크를 먼저 확인</a>하고 이 단계로 돌아오세요.</div>' : s.id === '10' ? '<div class="tip">본인 계정의 주소를 확인했다면 <a href="#binance/8">9단계 업비트 출금 화면으로 돌아가기</a></div>' : ''}
      <div id="shot"></div>
      <div class="card"><h2>이렇게 합니다</h2><ol class="instr ${s.bilingual ? 'bi-instructions' : ''}">${(s.steps || []).map((x, i) => `<li>${s.bilingual ? `<button type="button" data-bi-instruction="${i}" aria-pressed="${i === 0}" aria-controls="shot" aria-label="${i + 1}번 설명: ${esc(x)} 그림에서 위치 보기">${esc(x)}<small>그림에서 위치 보기</small></button>` : esc(x)}</li>`).join('')}</ol>
        ${(s.labels || []).length ? `<h3>화면에서 찾을 글자</h3><div class="labels">${s.labels.map((l) => `<span class="${l === s.hl ? 'hl' : ''}">${esc(l)}</span>`).join('')}</div>` : ''}
      </div>
      ${s.id === '14' ? '<a class="big-btn secondary" href="#timeframes">시간봉 차이와 큰 흐름 가이드</a>' : ''}
      ${s.guide ? '<div id="step-gallery"></div>' : ''}
      <div class="notice bad"><strong>⚠ 주의</strong>${esc(s.caution || '')}</div>
      ${(s.verified || (s.sources || []).length) ? `<div class="small-print">${esc(s.verified || '')} ${(s.sources || []).map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener">공식 문서</a>`).join(' · ')}</div>` : ''}
      <button class="big-btn ${S.bnb[s.id] ? 'ok' : 'accent'}" type="button" data-act="done">${S.bnb[s.id] ? '✓ 이해했어요 (확인됨)' : '이 화면 이해했어요'}</button>
      <div class="step-nav">${idx > 0 ? `<a class="big-btn secondary" href="#binance/${idx - 1}">‹ 이전</a>` : '<span style="flex:1"></span>'}${idx < STEPS.length - 1 ? `<a class="big-btn" href="#binance/${idx + 1}">다음 ›</a>` : '<a class="big-btn" href="#binance">목록으로</a>'}</div>
    `;
    // 실제 캡처가 있으면 모형 대신 표시
    const shot = $('#shot', view);
    const mock = () => { shot.innerHTML = `<div class="phone"><div class="status"><span>9:41</span><span>▮▮▮ 100%</span></div><div class="ph-top"><span>‹</span><span>${esc(s.screen?.top || '')}</span><span>⋯</span></div><div class="ph-body">${(s.screen?.body || []).map(el).join('')}</div></div><div class="shot-note">${s.guide ? 'USDT 기준의 학습용 화면 모형입니다. 실제 캡처는 아래 업비트 공식 참고 화면에서 확인하세요.' : '앱 배치를 본뜬 그림입니다. 실제 캡처가 아니며 버튼 위치·이름은 앱 버전에 따라 다를 수 있습니다.'}</div>`; };
    const tryExt = (exts) => {
      if (!exts.length) { mock(); return; }
      const im = new Image();
      im.onload = () => { shot.innerHTML = `<img class="real-shot" src="${shotBase}.${exts[0]}" alt="${esc(s.title)} 실제 화면"><div class="shot-note">실제 앱 화면 캡처</div>`; };
      im.onerror = () => tryExt(exts.slice(1));
      im.src = `${shotBase}.${exts[0]}`;
    };
    if (s.bilingual) renderBilingualGuide(shot, s);
    else if ((window.BINANCE_SHOTS || []).includes(s.id)) tryExt(['png', 'jpg', 'webp']); else mock();
    if (s.guide) renderStepReferences($('#step-gallery', view), s.guide);
    $('[data-act="done"]', view).addEventListener('click', () => {
      S.bnb[s.id] = !S.bnb[s.id]; save();
      if (S.bnb[s.id] && idx < STEPS.length - 1) { toast('다음 단계로'); location.hash = `#binance/${idx + 1}`; } else renderStep(idx);
    });
    window.scrollTo(0, 0);
  }

  // ---------- 모의 연습(시뮬레이션) ----------
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function randn(rng) { let u = 0, v = 0; while (u === 0) u = rng(); while (v === 0) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function genSeries(seed, n) {
    const rng = mulberry32(seed); let p = 100; const out = []; let drift = 0, vol = 0.012;
    for (let i = 0; i < n; i++) {
      if (i % 35 === 0) { drift = (rng() - 0.5) * 0.007; vol = 0.007 + rng() * 0.012; }
      const o = p; const r = drift + vol * randn(rng); const c = o * (1 + r);
      const h = Math.max(o, c) * (1 + Math.abs(randn(rng)) * vol * 0.55); const l = Math.min(o, c) * (1 - Math.abs(randn(rng)) * vol * 0.55);
      out.push({ o, h, l, c }); p = c;
    }
    return out;
  }
  const ema = (v, n) => { const k = 2 / (n + 1); let e = null; return v.map((x) => (e = e === null ? x : x * k + e * (1 - k))); };
  function rsi(v, n = 14) {
    const out = new Array(v.length).fill(null); let ag = 0, al = 0;
    for (let i = 1; i < v.length; i++) {
      const d = v[i] - v[i - 1], u = Math.max(d, 0), dn = Math.max(-d, 0);
      if (i <= n) { ag += u; al += dn; if (i === n) { ag /= n; al /= n; out[i] = al === 0 ? (ag === 0 ? 50 : 100) : 100 - 100 / (1 + ag / al); } }
      else { ag = (ag * (n - 1) + u) / n; al = (al * (n - 1) + dn) / n; out[i] = al === 0 ? (ag === 0 ? 50 : 100) : 100 - 100 / (1 + ag / al); }
    }
    return out;
  }
  const SIM = { series: [], cut: 0, ef: [], es: [], rs: [], sig: [], phase: 'decide', choice: null, reveal: 0, entry: 0, tp: 0, sl: 0, outcome: null, timer: null };
  const WIN = 60, FUT = 20, LEV = 2, TP_PCT = 0.03, SL_PCT = 0.015;

  function newRound() {
    clearInterval(SIM.timer);
    const seed = Math.floor(Math.random() * 1e9);
    const n = 260; SIM.series = genSeries(seed, n);
    const closes = SIM.series.map((b) => b.c);
    SIM.ef = ema(closes, 9); SIM.es = ema(closes, 21); SIM.rs = rsi(closes, 14);
    SIM.sig = closes.map((_, i) => { if (i < 22) return 0; const up = SIM.ef[i] > SIM.es[i] && SIM.ef[i - 1] <= SIM.es[i - 1]; const dn = SIM.ef[i] < SIM.es[i] && SIM.ef[i - 1] >= SIM.es[i - 1]; if (up && SIM.rs[i] > 50) return 1; if (dn && SIM.rs[i] < 50) return -1; return 0; });
    SIM.cut = WIN + 20 + Math.floor(Math.random() * (n - WIN - FUT - 25));
    SIM.phase = 'decide'; SIM.choice = null; SIM.reveal = 0; SIM.outcome = null;
  }

  function renderSim() {
    setTop('지표 모의 연습', '#home');
    if (!SIM.series.length) newRound();
    view.innerHTML = html`
      <div class="notice"><strong>교육용 예시 지표로 연습 중</strong>지금은 파란 선(9봉 평균)이 주황 선(21봉 평균)을 위로 넘고 RSI가 50 위면 ▲ 롱 후보, 반대면 ▼ 숏 후보로 표시합니다. <b>이 신호는 투자 조언이나 미래 수익 예측이 아닙니다.</b> 가상 캔들이며 실제 시세가 아닙니다.</div>
      <div class="sim-wrap">
        <canvas id="sim-c" class="sim-canvas" role="img" aria-label="가상 캔들과 9봉·21봉 평균선"></canvas>
        <canvas id="sim-r" class="sim-rsi" role="img" aria-label="가상 차트의 RSI 보조 지표"></canvas>
        <div class="sim-legend"><span><i style="background:#1a73e8"></i>짧은 평균 9</span><span><i style="background:#f28c28"></i>긴 평균 21</span><span>▲ 롱 후보 ▼ 숏 후보</span><span><i style="background:#1e8e3e"></i>TP <i style="background:#c5221f"></i>SL</span></div>
      </div>
      <div id="sim-panel"></div>
      <div class="card"><h2>규칙 (연습용)</h2><ul><li>레버리지 ${LEV}배 격리, 수수료·펀딩 미반영.</li><li>이익 실현 TP +${TP_PCT * 100}% (내 돈 +${TP_PCT * 100 * LEV}%), 손절 SL −${SL_PCT * 100}% (내 돈 −${SL_PCT * 100 * LEV}%).</li><li>결정 후 ${FUT}봉을 봅니다. 먼저 닿는 쪽으로 결과가 납니다. 한 봉에서 TP와 SL을 모두 건드리면 순서를 알 수 없어 보수적으로 SL을 먼저 적용합니다.</li><li>관망도 답입니다. 롱·숏 모두 TP에 닿지 않았을 때 관망은 점수를 받습니다.</li></ul></div>
      <div class="card"><h2>내 기록</h2><div class="stat-grid"><div><b>${S.sim.score}</b><span>점수</span></div><div><b>${S.sim.wins}/${S.sim.losses}</b><span>승/패</span></div><div><b>${S.sim.waits}</b><span>관망</span></div></div><div class="muted center">최고 ${S.sim.best}점 · ${S.sim.games}판</div><button class="big-btn ghost" type="button" data-act="reset-sim">기록 지우기</button></div>
    `;
    $('[data-act="reset-sim"]', view).addEventListener('click', () => { if (confirm('연습 기록을 지울까요?')) { S.sim = { games: 0, wins: 0, losses: 0, waits: 0, score: 0, best: 0 }; save(); renderSim(); } });
    renderSimPanel();
    requestAnimationFrame(drawSim);
    if (SIM.phase === 'reveal') startRevealTimer();
  }

  function renderSimPanel() {
    const p = $('#sim-panel', view); if (!p) return;
    const last = SIM.series[SIM.cut - 1];
    if (SIM.phase === 'decide') {
      const sigNow = SIM.sig.slice(SIM.cut - 3, SIM.cut).reverse().find((x) => x !== 0) || 0;
      p.innerHTML = `<div class="card"><div class="muted">마지막 종가 ${last.c.toFixed(2)} · 최근 신호: <b>${sigNow > 0 ? '▲ 롱 후보' : sigNow < 0 ? '▼ 숏 후보' : '없음'}</b> · RSI ${SIM.rs[SIM.cut - 1] != null ? SIM.rs[SIM.cut - 1].toFixed(0) : '-'}</div><div class="question">지금 어떻게 할까요?</div><div class="sim-actions"><button class="big-btn ok" type="button" data-c="long">▲ 롱</button><button class="big-btn danger" type="button" data-c="short">▼ 숏</button><button class="big-btn secondary" type="button" data-c="wait">관망</button></div></div>`;
      $$('[data-c]', p).forEach((b) => b.addEventListener('click', () => decide(b.dataset.c)));
    } else if (SIM.phase === 'reveal') {
      p.innerHTML = `<div class="card center"><div class="question">결과를 보는 중… ${SIM.reveal}/${FUT}봉</div><div class="muted">${SIM.choice === 'long' ? '▲ 롱' : SIM.choice === 'short' ? '▼ 숏' : '관망'} · 진입 ${SIM.entry.toFixed(2)}${SIM.choice !== 'wait' ? ` · TP ${SIM.tp.toFixed(2)} · SL ${SIM.sl.toFixed(2)}` : ''}</div></div>`;
    } else {
      const o = SIM.outcome;
      p.innerHTML = `<div class="card sim-result"><div class="feedback ${o.pts > 0 ? 'good' : o.pts < 0 ? 'bad' : ''}" style="margin-top:0"><strong>${esc(o.title)}</strong><div>${esc(o.text)}</div><div style="margin-top:6px">이번 판 점수 <b>${o.pts > 0 ? '+' : ''}${o.pts}</b> · 누적 ${S.sim.score}</div></div><button class="big-btn accent" type="button" data-act="next-round">다음 판 ▶</button></div>`;
      $('[data-act="next-round"]', p).addEventListener('click', () => { newRound(); renderSim(); });
    }
  }

  function decide(choice) {
    if (SIM.phase !== 'decide' || !['long', 'short', 'wait'].includes(choice)) return;
    const entry = SIM.series[SIM.cut - 1].c;
    SIM.choice = choice; SIM.entry = entry; SIM.phase = 'reveal'; SIM.reveal = 0;
    if (choice === 'long') { SIM.tp = entry * (1 + TP_PCT); SIM.sl = entry * (1 - SL_PCT); }
    else if (choice === 'short') { SIM.tp = entry * (1 - TP_PCT); SIM.sl = entry * (1 + SL_PCT); }
    renderSimPanel();
    startRevealTimer();
  }

  function startRevealTimer() {
    clearInterval(SIM.timer);
    SIM.timer = setInterval(() => {
      SIM.reveal++;
      if (SIM.reveal >= FUT) { clearInterval(SIM.timer); finish(); }
      renderSimPanel(); drawSim();
    }, 220);
  }

  function evalSide(side) { // 결과: {res:'tp'|'sl'|'end', pnl(내 돈 %), bar}
    const e = SIM.entry;
    for (let i = 0; i < FUT; i++) {
      const b = SIM.series[SIM.cut + i]; if (!b) break;
      if (side === 'long') { if (b.l <= e * (1 - SL_PCT)) return { res: 'sl', pnl: -SL_PCT * LEV * 100, bar: i + 1 }; if (b.h >= e * (1 + TP_PCT)) return { res: 'tp', pnl: TP_PCT * LEV * 100, bar: i + 1 }; }
      else { if (b.h >= e * (1 + SL_PCT)) return { res: 'sl', pnl: -SL_PCT * LEV * 100, bar: i + 1 }; if (b.l <= e * (1 - TP_PCT)) return { res: 'tp', pnl: TP_PCT * LEV * 100, bar: i + 1 }; }
    }
    const last = SIM.series[Math.min(SIM.cut + FUT - 1, SIM.series.length - 1)].c;
    const pnl = (side === 'long' ? last / e - 1 : 1 - last / e) * LEV * 100;
    return { res: 'end', pnl, bar: FUT };
  }

  function finish() {
    if (SIM.phase !== 'reveal') return;
    const L = evalSide('long'), Sh = evalSide('short');
    let o;
    if (SIM.choice === 'wait') {
      const good = L.res !== 'tp' && Sh.res !== 'tp';
      o = good ? { title: '관망, 좋은 판단', text: `롱이었으면 ${L.pnl.toFixed(1)}%, 숏이었으면 ${Sh.pnl.toFixed(1)}% (내 돈 기준). 뚜렷한 기회가 아니었습니다.`, pts: 3 } : { title: '관망', text: `이번엔 ${L.res === 'tp' ? '롱' : '숏'}이 TP에 닿았습니다. 그래도 기다린 것은 잘못이 아닙니다.`, pts: 0 };
      S.sim.waits++;
    } else {
      const r = SIM.choice === 'long' ? L : Sh;
      const pts = r.res === 'tp' ? 10 : r.res === 'sl' ? -10 : Math.round(r.pnl);
      const name = SIM.choice === 'long' ? '롱' : '숏';
      o = r.res === 'tp' ? { title: `${name} 성공 · TP 도달 (${r.bar}봉째)`, text: `내 돈 기준 +${r.pnl.toFixed(1)}%. 비용은 빠져 있습니다.`, pts }
        : r.res === 'sl' ? { title: `${name} 손절 · SL 도달 (${r.bar}봉째)`, text: `내 돈 기준 ${r.pnl.toFixed(1)}%. 손절은 계획대로 손실을 멈춘 것입니다.`, pts }
          : { title: `${name} · ${FUT}봉 뒤 ${r.pnl >= 0 ? '이익' : '손실'}`, text: `TP·SL 어디에도 닿지 않아 마지막 가격으로 계산: 내 돈 기준 ${r.pnl.toFixed(1)}%.`, pts };
      if (r.pnl > 0) S.sim.wins++; else S.sim.losses++;
    }
    S.sim.games++; S.sim.score += o.pts; S.sim.best = Math.max(S.sim.best, S.sim.score); save();
    SIM.outcome = o; SIM.phase = 'result';
    renderSim();
  }

  function drawSim() {
    const c = $('#sim-c'), r = $('#sim-r'); if (!c || !r) return;
    const dpr = window.devicePixelRatio || 1;
    const W = c.clientWidth, H = c.clientHeight; c.width = W * dpr; c.height = H * dpr;
    const RW = r.clientWidth, RH = r.clientHeight; r.width = RW * dpr; r.height = RH * dpr;
    const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const gr = r.getContext('2d'); gr.setTransform(dpr, 0, 0, dpr, 0, 0);
    const start = SIM.cut - WIN, endVis = SIM.cut + (SIM.phase === 'decide' ? 0 : SIM.reveal);
    const total = WIN + FUT; const padL = 8, padT = 10, padB = 8;
    const fsz = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fs')) || 20;
    const fpx = Math.max(14, Math.round(fsz * .72));
    g.font = fpx + 'px sans-serif';
    const padR = Math.ceil(g.measureText('0000.0').width) + 12;
    const bw = (W - padL - padR) / total;
    const vis = SIM.series.slice(start, endVis);
    let lo = Math.min(...vis.map((b) => b.l)), hi = Math.max(...vis.map((b) => b.h));
    if (SIM.choice && SIM.choice !== 'wait') { lo = Math.min(lo, SIM.sl, SIM.tp); hi = Math.max(hi, SIM.sl, SIM.tp); }
    const range = (hi - lo) || 1; lo -= range * 0.05; hi += range * 0.05;
    const y = (v) => padT + (H - padT - padB) * (1 - (v - lo) / (hi - lo));
    const x = (i) => padL + (i - start) * bw + bw / 2;
    g.clearRect(0, 0, W, H); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    // 눈금
    g.strokeStyle = '#eef1f3'; g.fillStyle = '#6b7780'; g.font = fpx + 'px sans-serif'; g.textAlign = 'left';
    for (let k = 0; k <= 4; k++) { const v = lo + (hi - lo) * k / 4; const yy = y(v); g.beginPath(); g.moveTo(padL, yy); g.lineTo(W - padR, yy); g.stroke(); g.fillText(v.toFixed(1), W - padR + 4, yy + 4); }
    // 미래 영역
    g.fillStyle = '#f3f5f7'; g.fillRect(x(SIM.cut) - bw / 2, padT, W - padR - (x(SIM.cut) - bw / 2), H - padT - padB);
    g.strokeStyle = '#9aa5ad'; g.setLineDash([5, 4]); g.beginPath(); g.moveTo(x(SIM.cut) - bw / 2, padT); g.lineTo(x(SIM.cut) - bw / 2, H - padB); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#4a5a63'; g.font = 'bold ' + fpx + 'px sans-serif'; g.textAlign = 'right'; g.fillText('지금 →', x(SIM.cut) - bw / 2 - 4, padT + 12);
    // EMA
    const line = (arr, col) => { g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); let first = true; for (let i = start; i < endVis; i++) { const v = arr[i]; if (v == null) continue; if (first) { g.moveTo(x(i), y(v)); first = false; } else g.lineTo(x(i), y(v)); } g.stroke(); g.lineWidth = 1; };
    line(SIM.ef, '#1a73e8'); line(SIM.es, '#f28c28');
    // 캔들
    for (let i = start; i < endVis; i++) {
      const b = SIM.series[i]; const up = b.c >= b.o; const col = up ? '#d93025' : '#1a73e8';
      g.strokeStyle = col; g.fillStyle = col; g.beginPath(); g.moveTo(x(i), y(b.h)); g.lineTo(x(i), y(b.l)); g.stroke();
      const top = y(Math.max(b.o, b.c)), bot = y(Math.min(b.o, b.c)); g.fillRect(x(i) - bw * 0.32, top, bw * 0.64, Math.max(1, bot - top));
      if (SIM.sig[i]) { g.fillStyle = SIM.sig[i] > 0 ? '#1e8e3e' : '#c5221f'; g.font = 'bold 14px sans-serif'; g.textAlign = 'center'; g.fillText(SIM.sig[i] > 0 ? '▲' : '▼', x(i), SIM.sig[i] > 0 ? y(b.l) + 16 : y(b.h) - 6); }
    }
    // TP/SL/진입
    if (SIM.choice && SIM.choice !== 'wait') {
      const hl = (v, col, label) => { g.strokeStyle = col; g.setLineDash([6, 4]); g.beginPath(); g.moveTo(x(SIM.cut - 1), y(v)); g.lineTo(W - padR, y(v)); g.stroke(); g.setLineDash([]); g.fillStyle = col; g.font = 'bold ' + fpx + 'px sans-serif'; g.textAlign = 'right'; g.fillText(label, W - padR - 4, y(v) - 3); };
      hl(SIM.tp, '#1e8e3e', 'TP'); hl(SIM.sl, '#c5221f', 'SL'); hl(SIM.entry, '#4a5a63', '진입');
    }
    // RSI
    gr.clearRect(0, 0, RW, RH); gr.fillStyle = '#fff'; gr.fillRect(0, 0, RW, RH);
    const ry = (v) => 6 + (RH - 12) * (1 - v / 100);
    [30, 50, 70].forEach((lv) => { gr.strokeStyle = lv === 50 ? '#d8dfe3' : '#e9c4c4'; gr.setLineDash([3, 3]); gr.beginPath(); gr.moveTo(padL, ry(lv)); gr.lineTo(RW - padR, ry(lv)); gr.stroke(); gr.setLineDash([]); gr.fillStyle = '#6b7780'; gr.font = Math.max(14, fpx - 1) + 'px sans-serif'; gr.textAlign = 'left'; gr.fillText(String(lv), RW - padR + 4, ry(lv) + 5); });
    gr.strokeStyle = '#0f4c5c'; gr.lineWidth = 2; gr.beginPath(); let f = true;
    for (let i = start; i < endVis; i++) { const v = SIM.rs[i]; if (v == null) continue; if (f) { gr.moveTo(x(i), ry(v)); f = false; } else gr.lineTo(x(i), ry(v)); }
    gr.stroke();
  }
  window.addEventListener('resize', () => { if (location.hash.startsWith('#sim')) drawSim(); });

  // Actual GOYA replay is isolated from the original example engine and cb:sim records.
  // 모의연습 iframe은 한 번만 만들고 숨김/표시만 바꾼다. 다른 탭에 갔다 돌아와도 연습이 그대로 이어진다.
  function goyaHost() {
    let host = document.getElementById('goya-host');
    if (!host) {
      host = document.createElement('section');
      host.id = 'goya-host'; host.className = 'goya-embed-shell'; host.hidden = true;
      host.setAttribute('aria-label', '지표 모의연습');
      view.insertAdjacentElement('afterend', host);
    }
    return host;
  }
  function renderGoyaPractice() {
    setTop('지표 모의연습', '#home');
    document.body.classList.add('goya-practice-route');
    const host = goyaHost();
    if (!host.querySelector('iframe')) {
      host.innerHTML = '<iframe id="goya-practice-frame" title="실제 기록 지표 모의연습" src="goya/index.html?embed=1&font=' + encodeURIComponent(S.settings.font || 'L') + '&v=20260924dev6' + (window.cbFrameHash || '') + '" style="width:100%;min-height:1000px;border:0;display:block" loading="eager"></iframe><p class="goya-example-link"><a href="#sim-example">기존 가상 차트 연습</a> · <a href="#home">배움터 홈</a></p>';
    }
    view.innerHTML = '';
    view.hidden = true;
    host.hidden = false;
  }
  window.addEventListener('message', (event) => {
    const frame = document.getElementById('goya-practice-frame');
    if (!frame || event.source !== frame.contentWindow || event.data?.type !== 'goya-sim-height') return;
    if (location.protocol !== 'file:' && event.origin !== location.origin) return;
    const h = Number(event.data.height);
    if (Number.isFinite(h)) frame.style.height = Math.max(720, Math.min(25000, Math.ceil(h))) + 'px';
  });

  // ---------- 라우터 ----------
  function route() {
    const raw = location.hash.replace(/^#/, '') || 'home';
    const [pathPart, query] = raw.split('?');
    const params = new URLSearchParams(query || '');
    const seg = pathPart.split('/');
    closeZoom(false);
    clearInterval(SIM.timer);
    document.body.classList.remove('goya-practice-route');
    const goyaHostEl = document.getElementById('goya-host');
    if (goyaHostEl) goyaHostEl.hidden = true;
    view.hidden = false;
    window.scrollTo(0, 0);
    switch (seg[0]) {
      case 'home': renderHome(); break;
      case 'learn': renderLearn(); break;
      case 'timeframes': renderTimeframes(); break;
      case 'lesson': { let id = seg[1] || ''; try { id = decodeURIComponent(id); } catch (_) { id = ''; } renderLesson(id); break; }
      case 'quiz': if (seg[1] === 'play') renderQuizPlay(params); else renderQuizHub(); break;
      case 'binance': if (seg[1] !== undefined && seg[1] !== '') renderStep(Number(seg[1])); else renderBinance(); break;
      case 'sim': renderGoyaPractice(); break;
      case 'sim-example': renderSim(); break;
      default: renderHome();
    }
    view.focus({ preventScroll: true });
  }
  window.addEventListener('hashchange', route);
  route();

  // ---------- PWA ----------
  // Standalone public build: no service worker or network font dependency.
})();
