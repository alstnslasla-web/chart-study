/* Binance Real Guide: static education only. 만든이 김민수 · 무단복제 금지 */
(function (global) {
  'use strict';
  const mounts = new WeakMap();
  const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
  const allowedHosts = new Set(['binance.com', 'www.binance.com', 'academy.binance.com']);
  function fail(message) { throw new Error(message); }
  function text(value, name, optional) {
    if (optional && value == null) return '';
    if (typeof value !== 'string') fail(name + ' 항목이 올바르지 않습니다.');
    return value;
  }
  function list(value, name) { if (!Array.isArray(value)) fail(name + ' 목록이 없습니다.'); return value; }
  function unique(value, seen, name) {
    if (typeof value !== 'string' || !idPattern.test(value) || seen.has(value)) fail(name + ' 식별자가 잘못되었거나 중복되었습니다.');
    seen.add(value); return value;
  }
  function sourceUrl(value) {
    let u;
    try { u = new URL(value); } catch (_) { fail('출처 주소를 확인할 수 없습니다.'); }
    if (typeof value !== 'string' || u.protocol !== 'https:' || !allowedHosts.has(u.hostname) || u.username || u.password || (u.port && u.port !== '443')) fail('허용되지 않은 출처 주소입니다.');
    // Never carry query credentials, referral parameters or fragments into links.
    u.search = ''; u.hash = ''; return u.href;
  }
  function imageSource(value) {
    if (typeof value !== 'string') fail('이미지 경로가 없습니다.');
    if (/^assets\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:png|webp)$/i.test(value) && !value.includes('..')) return value;
    if (/^data:image\/(?:png|webp);base64,[A-Za-z0-9+/]+={0,2}$/i.test(value)) return value;
    fail('안전한 PNG 또는 WebP 이미지 경로가 아닙니다.');
  }
  function validate(catalog) {
    if (!catalog || catalog.schemaVersion !== 1) fail('학습 자료의 형식이 맞지 않습니다.');
    const frameIds = new Set(), lessonIds = new Set();
    const frames = list(catalog.frames, '화면').map(function (f) {
      if (!f || typeof f !== 'object') fail('화면 정보가 올바르지 않습니다.');
      const id = unique(f.id, frameIds, '화면');
      if (!['actual-capture', 'doc-only'].includes(f.evidenceKind) || !['signed-in', 'public', 'not-observed'].includes(f.accessContext) || f.platform !== 'desktop-web' || f.uiLocale !== 'en' || f.redactionReviewed !== true) fail('화면의 출처 또는 가림 처리 확인이 필요합니다.');
      let image = null;
      if (f.evidenceKind === 'actual-capture') {
        if (f.redacted !== true || !f.image || f.accessContext === 'not-observed') fail('실제 캡처의 이미지 또는 열람 상태가 없습니다.');
        const im = f.image;
        if (!Number.isFinite(im.width) || !Number.isFinite(im.height) || im.width <= 0 || im.height <= 0 || im.width > 40000 || im.height > 40000) fail('이미지 크기가 올바르지 않습니다.');
        image = {src: imageSource(im.src), width: im.width, height: im.height, altKo: text(im.altKo, '이미지 설명')};
      } else if (f.image != null) {
        fail('문서로만 확인한 항목에는 화면 이미지를 넣을 수 없습니다.');
      }
      const targetIds = new Set();
      const targets = list(f.targets, '표시 위치').map(function (t) {
        if (!t || typeof t !== 'object') fail('표시 위치가 올바르지 않습니다.');
        const tid = unique(t.id, targetIds, '표시 위치');
        if (![t.x, t.y, t.w, t.h].every(Number.isFinite) || t.x < 0 || t.y < 0 || t.w <= 0 || t.h <= 0 || t.x + t.w > 1.000001 || t.y + t.h > 1.000001) fail('표시 위치는 화면 안의 비율 좌표여야 합니다.');
        return {id: tid, label: text(t.label, '위치 이름'), x: t.x, y: t.y, w: t.w, h: t.h};
      });
      return {id: id, evidenceKind: f.evidenceKind, accessContext: f.accessContext, capturedAt: text(f.capturedAt, '화면 확인일', true), sourceUrl: sourceUrl(f.sourceUrl), image: image, targets: targets, modifications: list(f.modifications, '이미지 변경').map(function (m) { return text(m, '이미지 변경 내용'); })};
    });
    const frameMap = new Map(frames.map(function (f) { return [f.id, f]; }));
    const lessons = list(catalog.lessons, '학습').map(function (l) {
      if (!l || typeof l !== 'object') fail('학습 정보가 올바르지 않습니다.');
      const id = unique(l.id, lessonIds, '학습');
      const stepIds = new Set();
      const steps = list(l.steps, '단계').map(function (s) {
        if (!s || typeof s !== 'object') fail('단계 정보가 올바르지 않습니다.');
        const sid = unique(s.id, stepIds, '단계');
        const frame = frameMap.get(s.frameId);
        if (!frame) fail('단계에 연결된 화면을 찾을 수 없습니다.');
        const tids = list(s.targetIds, '단계 표시 위치');
        if (new Set(tids).size !== tids.length || tids.some(function (tid) { return !frame.targets.some(function (t) { return t.id === tid; }); })) fail('단계의 표시 위치 연결이 잘못되었습니다.');
        return {id: sid, title: text(s.title, '단계 제목'), instruction: text(s.instruction, '안내'), expected: text(s.expected, '확인할 모습'), caution: text(s.caution, '단계 주의', true), stopBefore: text(s.stopBefore, '멈출 지점', true), frameId: frame.id, targetIds: tids.slice(), labels: list(s.labels, '용어').map(function (d) { return {en: text(d.en, '영어 용어'), ko: text(d.ko, '한국어 뜻'), explanation: text(d.explanation, '용어 설명')}; })};
      });
      if (!steps.length) fail('내용이 없는 학습 항목입니다.');
      return {id: id, group: text(l.group, '학습 묶음'), title: text(l.title, '학습 제목'), summary: text(l.summary, '학습 소개'), evidenceNote: text(l.evidenceNote, '근거 설명', true), legacyIds: list(l.legacyIds, '기존 학습 연결').map(function (v) { return text(v, '기존 학습 식별자'); }), sources: list(l.sources, '출처').map(function (s) { return {title: text(s.title, '출처 제목'), url: sourceUrl(s.url)}; }), cautions: list(l.cautions, '주의').map(function (c) { return text(c, '주의'); }), steps: steps};
    });
    if (!lessons.length) fail('아직 등록된 학습이 없습니다.');
    return {schemaVersion: 1, revision: text(catalog.revision, '자료 버전'), checkedAt: text(catalog.checkedAt, '자료 확인일'), title: text(catalog.title, '자료 제목'), intro: text(catalog.intro, '자료 소개'), lessons: lessons, frames: frames, frameMap: frameMap};
  }
  function el(tag, cls, value) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (value != null) node.textContent = value;
    return node;
  }
  function link(label, href, external) {
    const a = el('a', 'br-link', label); a.href = href;
    if (external) { a.target = '_blank'; a.rel = 'noopener noreferrer'; a.append(el('span', 'br-sr', ' (새 창)')); }
    return a;
  }
  function button(label, action, cls) {
    const b = el('button', cls || 'br-button', label); b.type = 'button'; b.addEventListener('click', action); return b;
  }
  function badge(n) { return el('span', 'br-number', String(n)); }
  function route(id) { return '#binance/real/' + encodeURIComponent(id); }
  function mount(root, options) {
    if (!(root instanceof Element)) throw new TypeError('학습 화면을 담을 요소가 필요합니다.');
    const old = mounts.get(root); if (old) old.destroy();
    options = options || {};
    let destroyed = false, stepIndex = 0, showNumbers = true, version = 0;
    let activeDialog = null, dialogTrigger = null;
    const hadClass = root.classList.contains('br-guide');
    root.classList.add('br-guide'); root.replaceChildren();
    function closeDialog() {
      if (!activeDialog) return;
      const dialog = activeDialog; activeDialog = null;
      if (dialog.open) dialog.close();
      dialog.remove();
      if (dialogTrigger && dialogTrigger.isConnected) dialogTrigger.focus();
      dialogTrigger = null;
    }
    const api = {destroy: function () {
      if (destroyed) return;
      destroyed = true; version++; closeDialog(); root.replaceChildren();
      root.classList.remove('br-large', 'br-xlarge'); if (!hadClass) root.classList.remove('br-guide');
      if (mounts.get(root) === api) mounts.delete(root);
    }};
    mounts.set(root, api);
    const shell = el('div', 'br-shell'); root.append(shell);
    const header = el('header', 'br-header');
    const brand = el('div', 'br-brand'); brand.append(el('span', 'br-kicker', 'BINANCE · PC 화면 읽기'), el('p', 'br-brand-title', '천천히, 한 화면씩'));
    const controls = el('div', 'br-controls');
    controls.setAttribute('role', 'group'); controls.setAttribute('aria-label', '글자 크기');
    const fontButtons = [['기본', 20, ''], ['크게', 24, 'br-large'], ['아주 크게', 28, 'br-xlarge']].map(function (size, i) {
      const b = button(size[0], function () { root.classList.remove('br-large', 'br-xlarge'); if (size[2]) root.classList.add(size[2]); fontButtons.forEach(function (other) { other.setAttribute('aria-pressed', String(other === b)); }); });
      b.setAttribute('aria-label', '글자 크기 ' + size[1] + '픽셀: ' + size[0]); b.setAttribute('aria-pressed', String(i === 0)); controls.append(b); return b;
    });
    header.append(brand, controls); shell.append(header);
    const main = el('main', 'br-main'); shell.append(main);
    const footer = el('footer', 'br-footer');
    footer.append(el('p', 'br-copyright', '만든이 김민수 · 무단복제 금지'), el('p', '', '원본 Binance 화면의 권리는 Binance에 있습니다. 이 자료는 학습을 위해 캡처, 자르기, 개인정보 가림, 번호 표시와 한국어 설명을 덧붙였습니다. 공식 한국어 화면이 아닙니다.'), el('p', '', '학습 전용 자료입니다. 실제 거래, 입출금, 계정 변경을 수행하지 않으며 거래소 API나 브라우저 저장 기능을 사용하지 않습니다.'));
    shell.append(footer);
    let data;
    try { data = validate(options.catalog); }
    catch (error) {
      api.error = error;
      main.append(el('h1', '', '학습 자료를 열 수 없습니다'), el('p', 'br-lead', error.message), el('p', '', '자료 파일과 실제 화면의 출처를 확인한 뒤 다시 열어 주세요. 임의로 만든 대체 화면은 표시하지 않습니다.'), link('학습 목록으로', '#binance/real'));
      return api;
    }
    const requested = options.lessonSlug == null ? '' : String(options.lessonSlug);
    const lesson = requested ? data.lessons.find(function (l) { return l.id === requested; }) : null;
    function notice(title, value, kind) {
      const n = el('section', 'br-notice ' + (kind || ''));
      n.append(el('h3', '', title), el('p', '', value)); return n;
    }
    function evidenceLabel(frame) {
      if (frame.evidenceKind === 'doc-only') return '공식 문서 확인 · 실제 화면 미확인';
      return frame.accessContext === 'signed-in' ? '실제 캡처 · 로그인 후 화면' : '실제 캡처 · 공개 화면';
    }
    function index() {
      main.append(el('p', 'br-eyebrow', '화면을 읽는 연습부터 시작하세요'), el('h1', '', data.title), el('p', 'br-lead', data.intro));
      main.append(notice('버튼을 누르는 대신, 위치와 뜻을 익혀요', '실제 Binance를 조작하지 않는 읽기 전용 학습입니다. 안내된 멈출 지점을 지켜 주세요. 암호자산은 가격 변동과 원금 손실 위험이 있습니다.', 'br-warm'));
      const counts = el('section', 'br-provenance'); counts.setAttribute('aria-label', '자료의 확인 범위');
      const signed = data.frames.filter(function (f) { return f.evidenceKind === 'actual-capture' && f.accessContext === 'signed-in'; }).length;
      const publicCount = data.frames.filter(function (f) { return f.evidenceKind === 'actual-capture' && f.accessContext === 'public'; }).length;
      const docCount = data.frames.filter(function (f) { return f.evidenceKind === 'doc-only'; }).length;
      [['로그인 후 화면 캡처', signed], ['공개 화면 캡처', publicCount], ['문서로만 확인', docCount]].forEach(function (pair) { const c = el('div', 'br-stat'); c.append(el('strong', '', String(pair[1]) + '개'), el('span', '', pair[0])); counts.append(c); });
      main.append(counts, el('p', 'br-meta', '자료 확인일: ' + data.checkedAt + ' · 버전: ' + data.revision), el('p', 'br-translation', '설명용 한국어 번역 · 실제 한국어 UI 아님'));
      const groups = new Map(); data.lessons.forEach(function (l) { if (!groups.has(l.group)) groups.set(l.group, []); groups.get(l.group).push(l); });
      let number = 0;
      groups.forEach(function (lessons, group) {
        const section = el('section', 'br-group'); section.append(el('h2', '', group));
        const items = el('ol', 'br-lessons');
        lessons.forEach(function (l) {
          number++;
          const li = el('li', 'br-lesson-item'); const a = link('', route(l.id)); a.className = 'br-lesson-link';
          const content = el('div', 'br-lesson-copy'); content.append(el('h3', '', l.title), el('p', '', l.summary), el('span', 'br-meta', l.steps.length + '단계 · 학습 열기'));
          a.append(badge(number), content, el('span', 'br-arrow', '→')); li.append(a); items.append(li);
        }); section.append(items); main.append(section);
      });
      const legacy = options.preview ? '#binance' : (typeof options.legacyHref === 'string' && /^#[A-Za-z0-9/_-]*$/.test(options.legacyHref) ? options.legacyHref : '#binance');
      main.append(link(options.preview ? '미리보기 처음으로' : '기존 학습 목록으로', legacy));
    }
    if (!requested) { index(); return api; }
    if (!lesson) { main.append(el('h1', '', '찾을 수 없는 학습입니다'), el('p', 'br-lead', '주소가 바뀌었거나 아직 준비되지 않은 학습입니다.'), link('학습 목록으로 돌아가기', '#binance/real')); return api; }
    const breadcrumb = el('nav', 'br-breadcrumb'); breadcrumb.setAttribute('aria-label', '학습 위치'); breadcrumb.append(link('전체 학습 목록', '#binance/real'), el('span', '', lesson.group));
    main.append(breadcrumb, el('h1', '', lesson.title), el('p', 'br-lead', lesson.summary));
    if (lesson.evidenceNote) { const evidenceDetails = el('details', 'br-evidence-details'); evidenceDetails.append(el('summary', '', '촬영 범위·출처 안내 펼치기'), el('p', 'br-evidence-note', lesson.evidenceNote)); main.append(evidenceDetails); }
    if (lesson.cautions.length) {
      const cautions = el('section', 'br-notice br-warm'); cautions.append(el('h2', '', '시작하기 전에'));
      const ul = el('ul'); lesson.cautions.forEach(function (c) { ul.append(el('li', '', c)); }); cautions.append(ul); main.append(cautions);
    }
    const stepNav = el('nav', 'br-step-nav'); stepNav.setAttribute('aria-label', '단계 바로가기'); const stepPicker = el('details', 'br-step-picker'); stepPicker.append(el('summary', '', '전체 ' + lesson.steps.length + '단계 목록 펼치기'), stepNav); main.append(stepPicker);
    const content = el('section', 'br-step-content'); main.append(content);
    const stepButtons = lesson.steps.map(function (s, i) {
      const b = button('', function () { go(i, true); }, 'br-step-button'); b.append(badge(i + 1), el('span', '', s.title));
      b.setAttribute('aria-label', (i + 1) + '단계: ' + s.title); stepNav.append(b); return b;
    });
    const sources = el('section', 'br-sources'); sources.append(el('h2', '', '공식 출처와 확인 범위'), el('p', '', '아래 링크는 공식 사이트의 읽기 자료입니다. 열면 별도 창으로 이동합니다. 현재 화면은 캡처 이후 달라졌을 수 있습니다.'));
    const sourceList = el('ul'); lesson.sources.forEach(function (s) { const li = el('li'); li.append(link(s.title, s.url, true)); sourceList.append(li); }); sources.append(sourceList, el('p', 'br-meta', '자료 확인일: ' + data.checkedAt + ' · 버전: ' + data.revision)); main.append(sources);
    function makePicture(frame, targets, stamp, expanded) {
      const wrapper = el('div', 'br-picture-wrap');
      wrapper.classList.toggle('br-without-numbers', !showNumbers);
      const status = el('p', 'br-image-status', '실제 화면을 불러오는 중입니다.'); status.setAttribute('role', 'status');
      const plane = el('div', 'br-image-plane'); plane.hidden = true;
      let pictureContainer = plane;
      if (!expanded && targets.length) {
        const W = frame.image.width, H = frame.image.height;
        const left = Math.min(...targets.map(t => t.x * W)), right = Math.max(...targets.map(t => (t.x + t.w) * W));
        const top = Math.min(...targets.map(t => t.y * H)), bottom = Math.max(...targets.map(t => (t.y + t.h) * H));
        const cw = Math.min(W, Math.max(280, right - left + 56)), ch = Math.min(H, Math.max(150, bottom - top + 64));
        const cx = Math.max(0, Math.min(W - cw, (left + right - cw) / 2)), cy = Math.max(0, Math.min(H - ch, (top + bottom - ch) / 2));
        if (cw < W * .9 || ch < H * .85) {
          const viewport = el('div', 'br-crop-viewport'); viewport.hidden = true;
          viewport.style.aspectRatio = cw + ' / ' + ch;
          plane.style.position = 'absolute'; plane.style.width = (W / cw * 100) + '%'; plane.style.maxWidth = 'none';
          plane.style.left = -(cx / cw * 100) + '%'; plane.style.top = -(cy / ch * 100) + '%';
          viewport.append(plane); pictureContainer = viewport;
        }
      }
      const image = el('img', 'br-image'); image.alt = frame.image.altKo + ' · 영어 PC 웹 화면. 한국어 뜻은 옆 또는 아래 설명을 참고하세요.';
      image.width = frame.image.width; image.height = frame.image.height; image.decoding = 'async'; image.loading = 'eager'; image.draggable = false;
      if (expanded) plane.style.width = Math.max(frame.image.width, 1000) + 'px';
      image.addEventListener('load', function () {
        if (destroyed || !root.isConnected || version !== stamp || !wrapper.isConnected) return;
        status.remove(); plane.hidden = false; pictureContainer.hidden = false;
      });
      image.addEventListener('error', function () {
        if (destroyed || !root.isConnected || version !== stamp || !wrapper.isConnected) return;
        plane.hidden = true; pictureContainer.hidden = true; status.textContent = '실제 캡처 파일을 찾거나 읽을 수 없습니다. 원본 자료 파일을 확인해 주세요. 대체 화면은 만들지 않습니다.'; status.classList.add('br-image-error');
      });
      plane.append(image);
      targets.forEach(function (target, i) {
        const outline = el('span', 'br-target'); outline.setAttribute('aria-hidden', 'true');
        outline.style.left = target.x * 100 + '%'; outline.style.top = target.y * 100 + '%'; outline.style.width = target.w * 100 + '%'; outline.style.height = target.h * 100 + '%';
        outline.append(badge(i + 1)); plane.append(outline);
      });
      wrapper.append(status, pictureContainer); image.src = frame.image.src; return wrapper;
    }
    function openImage(frame, targets, trigger) {
      closeDialog(); dialogTrigger = trigger;
      const dialog = el('dialog', 'br-dialog'); activeDialog = dialog;
      const top = el('div', 'br-dialog-top'); const title = el('h2', '', '실제 화면 크게 보기');
      // DOM references avoid globally colliding IDs across multiple mounted guides.
      dialog.setAttribute('aria-label', '실제 화면 크게 보기');
      const close = button('닫기', closeDialog, 'br-button br-primary'); close.autofocus = true;
      top.append(title, close); dialog.append(top, el('p', 'br-dialog-help', '화면이 넓으면 좌우로 움직여 보세요. 키보드에서는 아래 화면 영역을 선택한 뒤 방향키를 쓰세요. Esc 키로 닫을 수 있습니다.'));
      const viewport = el('div', 'br-dialog-viewport'); viewport.tabIndex = 0; viewport.setAttribute('role', 'region'); viewport.setAttribute('aria-label', '확대 화면, 방향키로 이동'); viewport.append(makePicture(frame, targets, version, true)); dialog.append(viewport);
      dialog.addEventListener('cancel', function (e) { e.preventDefault(); closeDialog(); });
      dialog.addEventListener('close', function () { if (activeDialog === dialog) closeDialog(); });
      root.append(dialog);
      if (typeof dialog.showModal === 'function') { dialog.showModal(); close.focus(); }
      else { dialog.remove(); activeDialog = null; trigger.focus(); const msg = el('p', 'br-image-error', '이 브라우저에서는 확대 창을 지원하지 않습니다. 최신 브라우저에서 열어 주세요.'); content.append(msg); }
    }
    function go(indexValue, focusHeading) {
      if (destroyed) return;
      closeDialog(); version++; stepIndex = Math.min(Math.max(indexValue, 0), lesson.steps.length - 1);
      content.replaceChildren();
      stepButtons.forEach(function (b, i) { if (i === stepIndex) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
      const step = lesson.steps[stepIndex], frame = data.frameMap.get(step.frameId);
      const targets = step.targetIds.map(function (id) { return frame.targets.find(function (t) { return t.id === id; }); });
      const progress = el('p', 'br-counter', '전체 ' + lesson.steps.length + '단계 중 ' + (stepIndex + 1) + '단계'); progress.setAttribute('role', 'status');
      const heading = el('h2', 'br-step-title', step.title); heading.tabIndex = -1;
      content.append(progress, heading, el('p', 'br-instruction', step.instruction));
      const evidence = el('div', 'br-evidence'); evidence.append(el('span', 'br-evidence-badge ' + (frame.evidenceKind === 'doc-only' ? 'br-doc-badge' : ''), evidenceLabel(frame)), el('span', 'br-meta', 'PC 웹 · 영어 화면'));
      content.append(evidence, el('p', 'br-translation', '설명용 한국어 번역 · 실제 한국어 UI 아님'));
      const studyGrid = el('div', 'br-study-grid' + (frame.image ? '' : ' br-study-doc'));
      const visualColumn = el('div', 'br-visual-column'), readingColumn = el('div', 'br-reading-column');
      studyGrid.append(visualColumn, readingColumn); content.append(studyGrid);
      if (frame.image) {
        const tools = el('div', 'br-image-tools');
        let enlarge; enlarge = button('전체 사진 크게 보기', function () { openImage(frame, targets, enlarge); }, 'br-button br-primary br-enlarge'); enlarge.setAttribute('aria-haspopup', 'dialog');
        const toggle = button(showNumbers ? '번호 표시 끄기' : '번호 표시 켜기', function () {
          showNumbers = !showNumbers; toggle.textContent = showNumbers ? '번호 표시 끄기' : '번호 표시 켜기'; toggle.setAttribute('aria-pressed', String(showNumbers));
          root.querySelectorAll('.br-picture-wrap').forEach(function (p) { p.classList.toggle('br-without-numbers', !showNumbers); });
        }); toggle.setAttribute('aria-pressed', String(showNumbers)); toggle.setAttribute('aria-label', '화면 위 번호와 테두리 표시 전환');
        tools.append(enlarge, toggle); visualColumn.append(tools);
        const figure = el('figure', 'br-figure'); figure.append(makePicture(frame, targets, version, false), el('figcaption', '', '실제 사진을 단계에 맞게 확대해 보여 줍니다. 번호는 학습용입니다. 전체 사진은 크게 보기로 확인하며, 사진 속 버튼은 작동하지 않습니다.')); visualColumn.append(figure);
      } else {
        visualColumn.append(notice('이 단계는 공식 문서로만 설명합니다', '직접 확인한 PC 화면이 없어 이미지를 표시하지 않습니다. 화면 위치와 버튼 모양을 추정하지 마세요.', 'br-doc-only'));
      }
      const metadata = el('div', 'br-frame-meta');
      metadata.append(el('p', '', (frame.evidenceKind === 'actual-capture' ? '캡처일: ' : '문서 확인일: ') + (frame.capturedAt || data.checkedAt)), link('이 화면의 공식 출처', frame.sourceUrl, true), el('p', '', '이미지 변경 내역: ' + (frame.image ? (frame.modifications.length ? frame.modifications.join(' · ') : '자료에 별도 변경 내역 없음') + ' · 학습 화면에 번호 및 테두리 덧붙임' : '이미지 없음')), el('p', '', frame.image ? '개인정보 가림 검토 완료. 확인일 이후 실제 메뉴나 위치가 달라질 수 있습니다.' : '실제 화면 확인을 대신하지 않는 문서 설명입니다.'));
      const photoDetails = el('details', 'br-photo-details'); photoDetails.append(el('summary', '', '출처·촬영일·가림 처리 확인'), metadata); visualColumn.append(photoDetails);
      if (targets.length && !step.labels.length) {
        const targetSection = el('section', 'br-target-list'); targetSection.append(el('h3', '', '화면에서 찾을 위치'));
        const targetList = el('ol'); targets.forEach(function (t, i) { const li = el('li'); li.append(badge(i + 1), el('span', '', t.label)); targetList.append(li); }); targetSection.append(targetList); readingColumn.append(targetSection);
      }
      if (step.labels.length) {
        const dictionary = el('section', 'br-dictionary'); dictionary.append(el('h3', '', '영어 버튼, 우리말로 읽어요'));
        const dl = el('dl');
        const orderedLabels = step.labels.map(function (label) {
          // A badge is shown only for a verifiable label match, never an assumed array position.
          const matching = targets.map(function (t, i) { const name = t.label.trim().toLowerCase(), en = label.en.trim().toLowerCase(), ko = label.ko.trim().toLowerCase(); return name === en || name === ko || name === (en + ' / ' + ko) || name === (en + ' · ' + ko) ? i + 1 : null; }).filter(Boolean);
          return {label: label, matching: matching};
        }).sort(function (a, b) { return (a.matching[0] || 10000) - (b.matching[0] || 10000); });
        orderedLabels.forEach(function (item) {
          const label = item.label, matching = item.matching;
          const row = el('div', 'br-word'); const dt = el('dt');
          matching.forEach(function (n) { dt.append(badge(n)); });
          const en = el('span', 'br-en', label.en); en.lang = 'en'; dt.append(en, el('span', 'br-ko', label.ko)); row.append(dt, el('dd', '', label.explanation)); dl.append(row);
        }); dictionary.append(dl); readingColumn.append(dictionary);
      }
      readingColumn.append(notice('이렇게 보이면 맞아요', step.expected || '공식 출처와 화면 내용을 다시 비교해 주세요.', 'br-expected'));
      if (step.caution) readingColumn.append(notice('주의해서 읽어 주세요', step.caution, 'br-warm'));
      readingColumn.append(notice('여기서 멈추세요', step.stopBefore || '이 자료에서 화면만 확인하세요. 실제 계정에서 거래, 입출금, 설정 변경 버튼을 누르지 마세요.', 'br-stop'));
      const navigation = el('nav', 'br-bottom-nav'); navigation.setAttribute('aria-label', '학습 단계 이동');
      const previous = button('← 이전 단계', function () { go(stepIndex - 1, true); }, 'br-button br-nav-button'); previous.disabled = stepIndex === 0; navigation.append(previous);
      if (stepIndex < lesson.steps.length - 1) navigation.append(button('다음 단계 →', function () { go(stepIndex + 1, true); }, 'br-button br-primary br-nav-button'));
      else { const done = link('학습 목록으로', '#binance/real'); done.className = 'br-button br-primary br-nav-button'; navigation.append(done); }
      content.append(navigation);
      if (stepIndex === lesson.steps.length - 1) {
        const finish = el('section', 'br-finish'); finish.append(el('h3', '', '이 학습의 마지막 단계입니다'), el('p', '', '뜻이 헷갈리면 위의 단계 번호를 눌러 다시 읽어 보세요.'));
        const next = data.lessons[data.lessons.indexOf(lesson) + 1];
        if (next) { const nextLink = link('다음 학습: ' + next.title + ' →', route(next.id)); nextLink.className = 'br-button'; finish.append(nextLink); }
        content.append(finish);
      }
      if (focusHeading) { heading.focus({preventScroll: true}); progress.scrollIntoView({block: 'start', behavior: 'auto'}); }
    }
    go(0, false);
    return api;
  }
  global.BinanceRealGuide = Object.freeze({mount: mount});
})(window);
