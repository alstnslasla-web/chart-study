(function (global) {
  'use strict';
  var HOUR = 3600;
  function number(value, fallback) { return Number.isFinite(Number(value)) ? Number(value) : (fallback || 0); }
  function money(value, signed) { var n = number(value); return (signed && n > 0 ? '+' : '') + n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function price(value) { var n = number(value); return n.toLocaleString('ko-KR', { maximumFractionDigits: n < 1 ? 6 : n < 100 ? 4 : 2 }); }
  function stamp(seconds, dateOnly) {
    if (!Number.isFinite(Number(seconds))) return '—';
    var d = new Date(Number(seconds) * 1000 + 9 * HOUR * 1000), z = function (x) { return String(x).padStart(2, '0'); };
    return z(d.getUTCMonth() + 1) + '/' + z(d.getUTCDate()) + (dateOnly ? '' : ' ' + z(d.getUTCHours()) + ':' + z(d.getUTCMinutes()));
  }
  var EXIT_SHORT = { stop_loss: '손절', trailing_stop: '추적 손절', take_profit: '익절', liquidation: '강제청산', end_of_sample: '기간 말 정리' };
  function signalMark(event) {
    var source = event.source, value = event.signal;
    if (source === 'ut_signal2' && /^(L|S)$/.test(value)) return { label: value === 'L' ? 'LL' : 'SS', long: value === 'L', family: 'Smart' };
    if (source === 'analysis_signal' && /^(L|S)[23]$/.test(value)) return { label: value, long: value[0] === 'L', family: 'Premium' };
    if (source === 'rls_signal' && /^(LRL|SRS)$/.test(value)) return { label: value === 'LRL' ? 'RL' : 'RS', long: value === 'LRL', family: '교차', cross: true };
    if (source === 'cross_signal' && /^(L|S) 진입$/.test(value)) return { label: value[0] === 'L' ? '×L' : '×S', long: value[0] === 'L', family: '교차', cross: true };
    return null;
  }
  function create(options) {
    options = options || {};
    var host = options.host;
    if (!host || !host.appendChild) throw new Error('월 재생 화면의 host가 필요합니다.');
    var doc = host.ownerDocument || global.document, root = doc.createElement('section');
    root.className = 'month-replay'; root.setAttribute('aria-label', '한 달 차트 다시보기');
    root.innerHTML = '<div class="mr-top"><div><p class="mr-kicker">기록을 따라가는 한 달</p><h3 data-mr="title">차트 다시보기</h3></div><span class="mr-state" data-mr="state">준비</span></div>' +
      '<div class="mr-market"><div><span data-mr="ticker">—</span><small data-mr="timeframe">1시간봉 · 저장 시세</small></div><div class="mr-price"><strong data-mr="price">—</strong><time data-mr="time">—</time></div></div>' +
      '<div class="mr-chart-wrap"><canvas data-mr="canvas" role="img" aria-label="아직 재생을 시작하지 않은 차트"></canvas><div class="mr-chart-empty" data-mr="empty">저장된 차트를 준비합니다.</div><div class="mr-chart-tag">진행한 시점까지만 표시</div></div>' +
      '<div class="mr-legend"><span><i class="mr-swatch mr-up"></i>상승</span><span><i class="mr-swatch mr-down"></i>하락</span><span><i class="mr-swatch mr-goya"></i>GOYA</span><span>LL/SS · L2/L3/S2/S3 · RL/RS</span><span data-mr="bb-legend" hidden>볼린저 15분 · 중단/상하단</span></div>' +
      '<div class="mr-progress"><progress data-mr="progress" max="100" value="0" aria-label="한 달 재생 진행률"></progress><div><span data-mr="progress-text">준비 중</span><span data-mr="period">—</span></div></div>' +
      '<div class="mr-controls"><button type="button" class="mr-primary" data-mr="play">▶ 재생</button><button type="button" data-mr="step">한 봉씩 →</button><label>재생 속도<select data-mr="speed"><option value="2">2봉 / 초</option><option value="8" selected>8봉 / 초</option><option value="24">24봉 / 초</option><option value="96">96봉 / 초 · 빠르게</option></select></label><button type="button" class="mr-restart" data-mr="restart">처음부터</button></div>' +
      '<p class="mr-note" data-mr="note">1시간봉 마감 단위 재생 · 실제 틱 영상 아님. 체결 순간에는 잠깐 멈춰 보여 줍니다.</p>' +
      '<div class="mr-event" data-mr="event" aria-live="polite" aria-atomic="true"><span class="mr-event-type" data-mr="event-type">관찰</span><div><strong data-mr="event-title">재생을 누르면 한 달이 흘러갑니다.</strong><p data-mr="event-detail">진입과 청산을 차트에서 순서대로 확인하세요.</p></div></div>' +
      '<div class="mr-account"><div class="mr-equity"><span>현재 평가 자산</span><strong data-mr="equity">—</strong><small>USDT · 현재 봉 마감 기준</small></div><div class="mr-stats"><div><span>누적 PNL · 평가 포함</span><b data-mr="net">—</b></div><div><span>실현 PNL · 청산 완료</span><b data-mr="realized">—</b></div><div><span>미실현 PNL · 보유 중</span><b data-mr="unrealized">—</b></div><div><span>누적 수수료</span><b data-mr="fees">—</b></div></div></div>' +
      '<p class="mr-position" data-mr="position">보유 포지션 없음</p><p class="mr-pending" data-mr="pending" hidden></p>' +
      '<details class="mr-log"><summary>지금까지의 최근 체결 <span data-mr="trade-count">0건</span></summary><ol data-mr="log"><li class="mr-log-empty">아직 체결이 없습니다.</li></ol></details><p class="mr-footnote">PNL은 수수료를 반영한 모의 손익입니다. 미실현 PNL에는 진입 수수료가 반영되며, 실제 청산 수익과 구분합니다.</p><a class="mr-result-link" data-mr="result-link" href="#month-results" hidden>최종 PNL과 거래 결과 보기 ↓</a>';
    host.appendChild(root);
    var el = {}; root.querySelectorAll('[data-mr]').forEach(function (node) { el[node.getAttribute('data-mr')] = node; });
    var candleSeconds = HOUR, timeframeLabel = '1시간봉';
    var frames = [], frameIndex = -1, playing = false, destroyed = false, completed = false, speed = 8;
    var timer = 0, raf = 0, eventQueue = [], shownEvents = [], activeEvent = null, current = null, settings = {}, coverage = {};
    var eventUntil = 0, effectUntil = 0, pulseStart = 0, lastPaintWidth = 0, listeners = [];
    var reduced = global.matchMedia ? global.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    function listen(target, type, fn) { target.addEventListener(type, fn); listeners.push(function () { target.removeEventListener(type, fn); }); }
    function now() { return global.performance && global.performance.now ? global.performance.now() : Date.now(); }
    function text(key, value) { el[key].textContent = value; }
    function cancelTimer() { if (timer) global.clearTimeout(timer); timer = 0; }
    function cancelPaint() { if (raf) global.cancelAnimationFrame(raf); raf = 0; }
    function schedule(delay) {
      cancelTimer();
      if (!playing || destroyed) return;
      timer = global.setTimeout(tick, Math.max(0, delay));
    }
    function isTrade(event) { return event && (event.type === 'entry' || event.type === 'exit'); }
    function eventTitle(event) {
      if (event.type === 'entry') return event.side === 'short' ? 'SELL · 숏 진입' : 'BUY · 롱 진입';
      if (event.type === 'exit') return event.side === 'short' ? 'BUY · 숏 청산' : 'SELL · 롱 청산';
      if (event.type === 'signal' && event.signal) { var mark = signalMark(event.signal); if (mark) return mark.family + ' · ' + mark.label; }
      return event.label || (event.type === 'order' ? '다음 봉 시가에 주문 예약' : '새 지표 신호 확인');
    }
    function eventDetail(event) {
      var parts = [stamp(event.time) + ' KST'];
      if (Number.isFinite(event.price)) parts.push(price(event.price) + ' USDT');
      if (event.type === 'exit' && Number.isFinite(event.netPnl)) parts.push('실현 PNL ' + money(event.netPnl, true) + ' USDT');
      if (event.label && isTrade(event)) parts.push(event.label);
      if (event.precision === 'bar_close_bound') parts.push('봉 내 체결 · 마감 시각 표기');
      if (event.precision === 'close') parts.push('마지막 봉 종가 정리');
      if (event.ambiguous) parts.push('같은 봉 익절·손절 · 순서 미확정 · 손절로 계산');
      return parts.join(' · ');
    }
    function showEvent(event, animate) {
      activeEvent = event;
      if (!event) return;
      var trade = isTrade(event), kind = event.type === 'entry' ? '진입 체결' : event.type === 'exit' ? '청산 체결' : event.type === 'order' ? '주문 대기' : '지표 확인';
      text('event-type', kind); text('event-title', eventTitle(event)); text('event-detail', eventDetail(event));
      el.event.className = 'mr-event mr-event-' + (trade ? event.type : 'observe');
      if (trade) { shownEvents.push(event); renderLog(); }
      if (animate && !reduced.matches && trade) {
        pulseStart = now(); effectUntil = pulseStart + 740;
        el.event.classList.remove('mr-event-arrive');
        void el.event.offsetWidth;
        el.event.classList.add('mr-event-arrive');
      }
      queueDraw();
    }
    function showQueuedEvent(animate) {
      if (!eventQueue.length) return false;
      var event = eventQueue.shift();
      showEvent(event, animate);
      eventUntil = now() + (isTrade(event) ? 850 : 1000 / speed);
      return true;
    }
    function renderLog() {
      var recent = shownEvents.filter(isTrade).slice(-8).reverse();
      text('trade-count', shownEvents.filter(isTrade).length + '건');
      el.log.replaceChildren();
      if (!recent.length) { var empty = doc.createElement('li'); empty.className = 'mr-log-empty'; empty.textContent = '아직 체결이 없습니다.'; el.log.appendChild(empty); return; }
      recent.forEach(function (event) {
        var li = doc.createElement('li'), title = doc.createElement('strong'), detail = doc.createElement('span');
        title.textContent = eventTitle(event); detail.textContent = eventDetail(event);
        li.appendChild(title); li.appendChild(detail); el.log.appendChild(li);
      });
    }
    function pnl(key, value) { text(key, money(value, true) + ' USDT'); el[key].className = number(value) > 0 ? 'mr-positive' : number(value) < 0 ? 'mr-negative' : ''; }
    function renderState() {
      el.play.disabled = !frames.length || completed; el.step.disabled = !frames.length || completed;
      el.restart.disabled = !frames.length;
      el.play.setAttribute('aria-pressed', playing ? 'true' : 'false');
      text('play', playing ? 'Ⅱ 일시정지' : completed ? '재생 완료' : '▶ 재생');
      text('step', eventQueue.length ? (isTrade(eventQueue[0]) ? '다음 체결 장면 →' : '다음 장면 →') : frames.length && frameIndex >= frames.length - 1 ? '결과 보기 ↓' : '한 봉씩 →');
      text('state', completed ? '재생 완료' : playing ? '재생 중' : frameIndex > 0 ? '일시정지' : '재생 준비');
      root.dataset.playing = String(playing); root.dataset.complete = String(completed);
      el['result-link'].hidden = !completed;
    }
    function renderFrame(frame) {
      current = frame;
      var s = frame.stats || {}, p = frame.position, bars = frame.bars || [], last = frame.current || bars[bars.length - 1];
      text('ticker', frame.ticker || ''); text('title', (frame.ticker || '') + ' · 한 달 다시보기');
      text('price', last ? price(last.c) : '—'); text('time', stamp(frame.cutoff) + ' KST 마감');
      text('equity', money(frame.equity));
      pnl('net', s.netPnl); pnl('realized', s.realizedPnl); pnl('unrealized', s.unrealizedNetPnl); text('fees', money(s.fees) + ' USDT');
      var pct = frames.length > 1 ? frameIndex / (frames.length - 1) * 100 : 0;
      el.progress.value = pct; text('progress-text', Math.floor(pct) + '% · ' + (frameIndex + 1) + ' / ' + frames.length + '봉');
      text('position', p ? (p.side === 'short' ? '숏 보유' : '롱 보유') + ' · 진입가 ' + price(p.entryPrice) + ' · ' + number(frame.settings && frame.settings.leverage || settings.leverage, 1) + '배' + (Array.isArray(p.tranches) ? ' · '+p.tranches.length+'/3 분할 체결' : '') : '보유 포지션 없음 · 다음 조건을 기다립니다.');
      text('pending', frame.pending ? (frame.pending.label || '주문 예약 중 · 다음 ' + timeframeLabel + ' 시가에서 모의 체결합니다.') : ''); el.pending.hidden = !frame.pending;
      el.empty.hidden = !!last;
      el.canvas.setAttribute('aria-label', (frame.ticker || '') + ' ' + timeframeLabel + '. ' + stamp(frame.cutoff) + ' KST 마감까지 재생. 종가 ' + (last ? price(last.c) : '없음') + '. ' + el.position.textContent);
      eventQueue = (frame.events || []).filter(function (e) {
        return number(e.time) <= number(frame.cutoff) && (e.type !== 'signal' || (e.signal && e.signal.group === 'none' && signalMark(e.signal)));
      }).slice();
      // Signals from the same hourly close appear together; every fill gets its own readable moment.
      var trades = eventQueue.filter(isTrade), nonTrades = eventQueue.filter(function (e) { return !isTrade(e); });
      // 체결이 없는 봉: 마지막 신호 카드와 주문 예약 카드는 둘 다 보여 준다(신호가 주문에 가려지지 않게).
      var lastSignal = nonTrades.filter(function (e) { return e.type === 'signal'; }).slice(-1), lastOrder = nonTrades.filter(function (e) { return e.type === 'order'; }).slice(-1);
      eventQueue = trades.length ? eventQueue : lastSignal.concat(lastOrder);
      eventUntil = 0; showQueuedEvent(true); renderState(); queueDraw();
    }
    function finish() {
      if (completed || destroyed) return;
      playing = false; completed = true; cancelTimer();
      el.progress.value = 100; text('progress-text', '100% · ' + frames.length + ' / ' + frames.length + '봉');
      text('note', current && current.finishReason && current.finishReason !== 'archive_end' ? '재생 가능한 기록 끝에 도착했습니다. 아래에서 자료 범위와 최종 PNL을 확인하세요.' : '한 달 재생이 끝났습니다. 아래에서 최종 PNL과 거래별 결과를 확인하세요.');
      renderState();
      if (typeof options.onComplete === 'function') options.onComplete({ frame: current, frameIndex: frameIndex, frameCount: frames.length });
    }
    function tick() {
      timer = 0;
      if (!playing || destroyed) return;
      if (doc.hidden) { pause('hidden'); return; }
      if (eventUntil > now()) { schedule(eventUntil - now()); return; }
      if (showQueuedEvent(true)) { schedule(Math.max(1000 / speed, eventUntil - now())); return; }
      if (frameIndex >= frames.length - 1) { finish(); return; }
      frameIndex++; renderFrame(frames[frameIndex]);
      schedule(Math.max(1000 / speed, eventUntil - now()));
    }
    function play() {
      if (destroyed || playing || completed || !frames.length || doc.hidden) return;
      playing = true; renderState(); schedule(Math.max(1000 / speed, eventUntil - now()));
    }
    function pause(reason) {
      if (destroyed) return;
      var wasPlaying = playing;
      playing = false; cancelTimer(); renderState();
      // 재생 중이었을 때만 안내를 바꾼다(완료·대기 상태의 안내는 그대로).
      if (reason === 'hidden' && wasPlaying && !completed) text('note', '화면을 벗어나 재생을 멈췄습니다. 돌아오면 재생 버튼으로 이어 보세요.');
    }
    function step() {
      if (destroyed || completed || !frames.length) return;
      pause();
      // Do not skip same-candle entry and exit just because a user steps manually.
      if (showQueuedEvent(false)) { renderState(); return; }
      if (frameIndex >= frames.length - 1) { finish(); return; }
      frameIndex++; renderFrame(frames[frameIndex]);
      if (frameIndex >= frames.length - 1 && !eventQueue.length && !(frames[frameIndex].events || []).length) finish();
    }
    function restart() {
      if (destroyed || !frames.length) return;
      pause(); cancelPaint(); completed = false; shownEvents = []; eventQueue = []; activeEvent = null; eventUntil = 0; effectUntil = 0;
      frameIndex = 0; renderLog();
      text('event-type', '관찰'); text('event-title', '처음 기록부터 다시 봅니다.'); text('event-detail', '진입과 청산을 차트에서 순서대로 확인하세요.'); el.event.className = 'mr-event';
      text('note', timeframeLabel + ' 마감 단위 재생 · 실제 틱 영상 아님. 체결 순간에는 잠깐 멈춰 보여 줍니다.');
      renderFrame(frames[0]);
      if (typeof options.onRestart === 'function') options.onRestart();
    }
    function load(data) {
      if (destroyed) return;
      pause(); cancelPaint(); data = data || {};
      candleSeconds = [300,900,3600].includes(data.candleSeconds) ? data.candleSeconds : HOUR; timeframeLabel = candleSeconds === 300 ? '5분봉' : candleSeconds === 900 ? '15분봉' : '1시간봉'; text('timeframe', timeframeLabel + (candleSeconds === HOUR ? ' · 저장 시세' : ' · 15분 볼린저 / 1시간 신호')); el['bb-legend'].hidden=candleSeconds===HOUR;
      frames = Array.isArray(data.frames) ? data.frames : []; settings = data.settings || {}; coverage = data.coverage || {};
      completed = false; shownEvents = []; eventQueue = []; activeEvent = null; eventUntil = 0; effectUntil = 0; frameIndex = frames.length ? 0 : -1;
      text('period', frames.length ? stamp(frames[0].cutoff, true) + ' → ' + stamp(frames[frames.length - 1].cutoff, true) : '기록 없음');
      text('event-type', '관찰'); text('event-title', '한 달을 시간 순서대로 따라갑니다.'); text('event-detail', '최종 결과는 마지막 봉까지 재생한 뒤 표시됩니다.'); el.event.className = 'mr-event';
      text('note', timeframeLabel + ' 마감 단위 재생 · 실제 틱 영상 아님. 체결 순간에는 잠깐 멈춰 보여 줍니다.'); renderLog();
      if (frames.length) renderFrame(frames[0]); else {
        current = null; el.empty.hidden = false; text('empty', '재생할 ' + timeframeLabel + ' 기록이 없습니다.');
        // 이전 재생의 숫자가 남지 않게 판을 비운다.
        text('ticker', '—'); text('title', '차트 다시보기'); text('price', '—'); text('time', '—'); text('equity', '—');
        ['net', 'realized', 'unrealized'].forEach(function (key) { text(key, '—'); el[key].className = ''; }); text('fees', '—');
        text('position', '보유 포지션 없음'); text('pending', ''); el.pending.hidden = true; el.progress.value = 0; text('progress-text', '준비 중'); text('trade-count', '0건');
        el.canvas.setAttribute('aria-label', '아직 재생을 시작하지 않은 차트');
        renderState(); queueDraw();
      }
    }
    function queueDraw() {
      if (destroyed || raf) return;
      raf = global.requestAnimationFrame(function () { raf = 0; if (!destroyed) { draw(); if (!reduced.matches && effectUntil > now() && !doc.hidden) queueDraw(); } });
    }
    function draw() {
      var canvas = el.canvas, ctx = canvas.getContext('2d'); if (!ctx) return;
      var rect = canvas.getBoundingClientRect(), w = rect.width || lastPaintWidth || 640, h = rect.height || 400, dpr = Math.min(global.devicePixelRatio || 1, 2); lastPaintWidth = w;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      if (!current) return;
      var mobile = w < 600, visibleCount = mobile ? 40 : 80;
      // Draw only the supplied current frame. Future frames never enter scale, labels or markers.
      var bars = (current.bars || []).filter(function (bar) { return number(bar.time) + candleSeconds <= number(current.cutoff); }).slice(-visibleCount);
      if (!bars.length) return;
      var left = 12, right = mobile ? 78 : 100, top = 32, bottom = h - 44, plotWidth = Math.max(50, w - left - right);
      var lows = bars.map(function (b) { return b.l; }), highs = bars.map(function (b) { return b.h; });
      bars.forEach(function (b) { if (Number.isFinite(b.goya)) { lows.push(b.goya); highs.push(b.goya); } if (b.bb) { if(Number.isFinite(b.bb.lower))lows.push(b.bb.lower); if(Number.isFinite(b.bb.upper))highs.push(b.bb.upper); } });
      if (current.position && Number.isFinite(current.position.entryPrice)) { lows.push(current.position.entryPrice); highs.push(current.position.entryPrice); }
      var fixedStop=current.position&&current.position.stopLoss||current.pending&&current.pending.stopLoss;
      // 시간봉 재생에서도 초기·추적 손절선과 익절선을 그린다. 그 프레임까지 확정된 값만 쓴다(미래 고저 참조 없음).
      var stopLine=current.position&&Number.isFinite(current.position.stopLoss)?current.position.stopLoss:(candleSeconds!==HOUR&&Number.isFinite(fixedStop)?fixedStop:NaN);
      // 추적 손절을 쓰는 포지션만 ‘초기/추적’으로 부른다. 추적이 없으면(연구실 포함) 끝까지 그대로인 ‘고정 손절’이다.
      var trailing=current.position&&current.position.settings&&current.position.settings.trailPct>0;
      var stopName=current.position&&current.position.stopKind==='trailing'?'추적 손절 ':trailing?'초기 손절 ':'고정 손절 ';
      var stopPath=candleSeconds===HOUR&&current.position&&Array.isArray(current.stopPath)&&current.stopPath.length?current.stopPath:null;
      if(stopPath)stopPath.forEach(function(seg){if(Number.isFinite(seg.value)){lows.push(seg.value);highs.push(seg.value);}});
      var tpLine=current.position&&Number.isFinite(current.position.takeProfit)?current.position.takeProfit:NaN;
      if(Number.isFinite(stopLine)){lows.push(stopLine);highs.push(stopLine);}
      if(Number.isFinite(tpLine)){lows.push(tpLine);highs.push(tpLine);}
      if(candleSeconds!==HOUR){(current.pending&&current.pending.remaining||[]).forEach(function(order){if(Number.isFinite(order.limit)){lows.push(order.limit);highs.push(order.limit);}});}
      var low = Math.min.apply(null, lows), high = Math.max.apply(null, highs), pad = Math.max((high - low) * .23, Math.abs(high) * .004, 0.00000001); low -= pad; high += pad;
      var first = bars[0].time, last = bars[bars.length - 1].time, timeSpan = Math.max(candleSeconds, last - first + 2 * candleSeconds); // 오른쪽 끝에 다음 봉 자리 한 칸: 다음 시가 주문·다음 봉부터 적용되는 손절선을 여기에 보인다
      function x(t) { return left + (t - first + candleSeconds * .5) / timeSpan * plotWidth; }
      function y(value) { return bottom - (value - low) / (high - low) * (bottom - top); }
      ctx.font = '14px "Malgun Gothic", sans-serif'; ctx.textBaseline = 'middle';
      for (var tickIndex = 0; tickIndex <= 4; tickIndex++) {
        var tickValue = low + (high - low) * tickIndex / 4, tickY = y(tickValue);
        ctx.strokeStyle = '#34373d'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(left, tickY); ctx.lineTo(w - right, tickY); ctx.stroke();
        ctx.fillStyle = '#b6b8bb'; ctx.textAlign = 'left'; ctx.fillText(price(tickValue), w - right + 8, tickY, right - 10);
      }
      var timeTicks = mobile ? [bars[0], bars[bars.length - 1]] : [bars[0], bars[Math.floor((bars.length - 1) / 2)], bars[bars.length - 1]];
      timeTicks.forEach(function (bar, index) {
        var xx = x(bar.time); ctx.strokeStyle = '#303238'; ctx.beginPath(); ctx.moveTo(xx, top); ctx.lineTo(xx, bottom); ctx.stroke();
        ctx.fillStyle = '#b6b8bb'; ctx.textAlign = index === 0 ? 'left' : index === timeTicks.length - 1 ? 'right' : 'center';
        if (index === 0 || bar !== timeTicks[index - 1]) ctx.fillText(stamp(bar.time, mobile), xx, h - 17);
      });
      var cw = Math.max(2, Math.min(11, plotWidth * candleSeconds / timeSpan * .62));
      bars.forEach(function (bar) {
        var xx = x(bar.time), color = bar.c >= bar.o ? '#f58a7c' : '#74b8f2';
        ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(xx, y(bar.h)); ctx.lineTo(xx, y(bar.l)); ctx.stroke();
        ctx.fillRect(xx - cw / 2, Math.min(y(bar.o), y(bar.c)), cw, Math.max(1.5, Math.abs(y(bar.o) - y(bar.c))));
      });
      ctx.strokeStyle = '#e5aed1'; ctx.lineWidth = 1.7; ctx.beginPath(); var pen = false, previous = null;
      bars.forEach(function (bar) {
        if (!Number.isFinite(bar.goya)) { pen = false; return; }
        if (pen && previous && bar.time - previous.time === candleSeconds) ctx.lineTo(x(bar.time), y(bar.goya)); else ctx.moveTo(x(bar.time), y(bar.goya));
        pen = true; previous = bar;
      }); ctx.stroke();
      ['upper','middle','lower'].forEach(function (key) {
        var started=false; ctx.strokeStyle=key==='middle'?'#d4b577':'#749995';ctx.lineWidth=key==='middle'?1.6:1;ctx.beginPath();
        bars.forEach(function(bar){var v=bar.bb&&bar.bb[key];if(!Number.isFinite(v)){started=false;return;}if(started)ctx.lineTo(x(bar.time),y(v));else ctx.moveTo(x(bar.time),y(v));started=true;});ctx.stroke();
      });
      var closeY = y(bars[bars.length - 1].c); ctx.setLineDash([3, 4]); ctx.strokeStyle = '#a5a9ae'; ctx.beginPath(); ctx.moveTo(left, closeY); ctx.lineTo(w - right, closeY); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#e9e4d8'; ctx.fillRect(w - right + 3, closeY - 12, right - 6, 24); ctx.fillStyle = '#22252a'; ctx.textAlign = 'left'; ctx.font = 'bold 14px "Malgun Gothic", sans-serif'; ctx.fillText(price(bars[bars.length - 1].c), w - right + 8, closeY, right - 12);
      var barMap = new Map(bars.map(function (b) { return [b.time, b]; })), occupied = [], seen = new Set();
      function label(value, xx, yy, color, fill) {
        ctx.font = 'bold 14px "Malgun Gothic", sans-serif';
        var labelWidth = ctx.measureText(value).width + 10, lx = Math.max(left + labelWidth / 2, Math.min(w - right - labelWidth / 2, xx));
        yy = Math.max(top + 12, Math.min(bottom - 12, yy));
        // 비켜 갈 방향은 처음 한 번만 정한다(가운데를 넘나들며 두 자리 사이를 오가지 않게).
        var laneStep = yy < (top + bottom) / 2 ? 22 : -22;
        for (var lane = 0; lane < 6; lane++) { if (!occupied.some(function (b) { return Math.abs(b.x - lx) < (b.width + labelWidth) / 2 + 2 && Math.abs(b.y - yy) < 22; })) break; yy += laneStep; }
        yy = Math.max(top + 12, Math.min(bottom - 12, yy)); occupied.push({ x: lx, y: yy, width: labelWidth });
        ctx.fillStyle = fill || '#212328'; ctx.fillRect(lx - labelWidth / 2, yy - 10, labelWidth, 20); ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.fillText(value, lx, yy);
      }
      (current.signals || []).forEach(function (event) {
        // 1시간 신호는 그 시간봉이 끝나는 봉(5분봉이면 :55 봉)에 표시한다.
        var anchor = candleSeconds === HOUR ? event.time : number(event.time) + HOUR - candleSeconds;
        if ((event.group && event.group !== 'none') || number(event.time) + HOUR > number(current.cutoff) || !barMap.has(anchor)) return;
        var mark = signalMark(event); if (!mark) return;
        var key = event.time + ':' + mark.label; if (seen.has(key)) return; seen.add(key);
        var bar = barMap.get(anchor), xx = x(bar.time), yy = mark.long ? y(bar.l) + 8 : y(bar.h) - 8, color = mark.cross ? '#efc76f' : mark.long ? '#a4d9b9' : '#f3b2a9';
        ctx.fillStyle = color; ctx.beginPath();
        if (mark.cross) { ctx.moveTo(xx, yy - 5); ctx.lineTo(xx + 5, yy); ctx.lineTo(xx, yy + 5); ctx.lineTo(xx - 5, yy); }
        else { var dir = mark.long ? 1 : -1; ctx.moveTo(xx, yy - dir * 5); ctx.lineTo(xx - 5, yy + dir * 4); ctx.lineTo(xx + 5, yy + dir * 4); }
        ctx.closePath(); ctx.fill(); label(mark.label, xx, yy + (mark.long ? 17 : -17), color);
      });
      if (current.position) {
        var entryY = y(current.position.entryPrice); ctx.strokeStyle = '#e8b14f'; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.moveTo(left, entryY); ctx.lineTo(w - right, entryY); ctx.stroke(); ctx.setLineDash([]);
        label('진입 ' + price(current.position.entryPrice), left + 88, entryY - 13, '#f7d899');
      }
      if(candleSeconds!==HOUR){
        (current.pending&&current.pending.remaining||[]).forEach(function(order){if(!Number.isFinite(order.limit))return;var ly=y(order.limit);ctx.strokeStyle='#bd9b55';ctx.setLineDash([2,5]);ctx.beginPath();ctx.moveTo(left,ly);ctx.lineTo(w-right,ly);ctx.stroke();ctx.setLineDash([]);label('대기 '+order.number+'/3',left+48,ly-12,'#e5c479');});
      }
      // 손절·익절 글자는 진입선의 반대쪽에 둔다(진입 글자와 겹치지 않게).
      var entryPrice=current.position&&Number.isFinite(current.position.entryPrice)?current.position.entryPrice:null;
      var awayFromEntry=function(value){return entryPrice!==null&&value>entryPrice?-13:13;};
      if(stopPath){
        // 손절선을 값이 유효했던 구간에만 계단 모양으로 그린다. 지금 값을 이미 지난 봉 위에 소급해 긋지 않는다.
        var slot=plotWidth*candleSeconds/timeSpan,lastStart=left;
        ctx.strokeStyle='#dc7d84';ctx.setLineDash([5,5]);ctx.lineWidth=1.4;
        stopPath.forEach(function(seg,i){
          if(!Number.isFinite(seg.value))return;
          var next=stopPath[i+1],x0=Math.max(left,x(seg.time)-slot/2),x1=next?Math.min(w-right,x(next.time)-slot/2):w-right;
          if(x1<=left||x0>=w-right)return;
          var yy=y(seg.value);ctx.beginPath();ctx.moveTo(x0,yy);ctx.lineTo(x1,yy);
          if(next&&Number.isFinite(next.value))ctx.lineTo(x1,y(next.value));
          ctx.stroke();lastStart=x0;
        });
        ctx.setLineDash([]);ctx.lineWidth=1;
        if(Number.isFinite(stopLine))label(stopName+price(stopLine),Math.max(left+92,lastStart+70),y(stopLine)+awayFromEntry(stopLine),'#f2a0a7');
      } else if(Number.isFinite(stopLine)){var sy=y(stopLine);ctx.strokeStyle='#dc7d84';ctx.setLineDash([5,5]);ctx.beginPath();ctx.moveTo(left,sy);ctx.lineTo(w-right,sy);ctx.stroke();ctx.setLineDash([]);label(stopName+price(stopLine),left+92,sy+awayFromEntry(stopLine),'#f2a0a7');}
      if(Number.isFinite(tpLine)){var ty=y(tpLine);ctx.strokeStyle='#6fb98f';ctx.setLineDash([5,5]);ctx.beginPath();ctx.moveTo(left,ty);ctx.lineTo(w-right,ty);ctx.stroke();ctx.setLineDash([]);label('익절 '+price(tpLine),left+92,ty+awayFromEntry(tpLine),'#a8dcbd');}
      shownEvents.forEach(function (event) {
        var eventBarTime = Number.isFinite(event.barTime) ? event.barTime : event.precision === 'bar_close_bound' || event.precision === 'close' ? event.time - candleSeconds : event.time;
        var bar = barMap.get(eventBarTime); if (!bar || !Number.isFinite(event.price)) return;
        var xx = x(eventBarTime), yy = y(event.price), buy = event.type === 'entry' ? event.side !== 'short' : event.side === 'short';
        var color = event.type === 'exit' ? '#f3d791' : buy ? '#f5a59b' : '#8ec7f5';
        ctx.strokeStyle = color; ctx.fillStyle = '#212328'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(xx, yy, event.type === 'exit' ? 5 : 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        label(event.type === 'exit' ? (EXIT_SHORT[event.reason] || '청산') : buy ? 'BUY' : 'SELL', xx, yy + (buy ? 34 : -34), color);
        if (activeEvent === event && effectUntil > now() && !reduced.matches) {
          var phase = Math.min(1, (now() - pulseStart) / 740); ctx.globalAlpha = (1 - phase) * .8; ctx.lineWidth = 2; ctx.strokeStyle = color;
          ctx.beginPath(); ctx.arc(xx, yy, 8 + phase * 23, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
        }
      });
    }
    listen(el.play, 'click', function () { if (playing) pause(); else play(); });
    listen(el.step, 'click', step); listen(el.restart, 'click', restart);
    listen(el.speed, 'change', function () { speed = [2, 8, 24, 96].indexOf(Number(el.speed.value)) >= 0 ? Number(el.speed.value) : 8; if (playing) schedule(Math.max(1000 / speed, eventUntil - now())); });
    listen(doc, 'visibilitychange', function () { if (doc.hidden) pause('hidden'); });
    listen(global, 'pagehide', function () { pause('hidden'); });
    if (reduced.addEventListener) listen(reduced, 'change', function () { effectUntil = 0; el.event.classList.remove('mr-event-arrive'); queueDraw(); });
    var resizeObserver = global.ResizeObserver ? new global.ResizeObserver(queueDraw) : null;
    if (resizeObserver) resizeObserver.observe(el.canvas); else listen(global, 'resize', queueDraw);
    renderState();
    return {
      load: load, play: play, pause: pause, restart: restart,
      getState: function () { return { playing: playing, completed: completed, frameIndex: frameIndex, frameCount: frames.length, speed: speed, pendingEvents: eventQueue.length, shownTradeEvents: shownEvents.length, cutoff: current ? current.cutoff : null }; },
      destroy: function () { if (destroyed) return; pause(); destroyed = true; cancelTimer(); cancelPaint(); listeners.forEach(function (fn) { fn(); }); if (resizeObserver) resizeObserver.disconnect(); frames = []; current = null; eventQueue = []; shownEvents = []; root.remove(); }
    };
  }
  global.GoyaMonthReplay = { create: create };
})(window);
