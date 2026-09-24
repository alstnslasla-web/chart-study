(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const STORE_KEY = 'cb:goya-sim:v1';
  const MONTH_KEY = 'cb:goya-sim:v1:monthly'; // 한 달 전략 결과 전용. STORE_KEY 는 연습 요약(부모 앱 홈 카드가 decisionCount·tradeCount 를 읽음)만 담는다.
  const RUN_KEY = 'cb:goya-sim:v1:run';
  const MAX_ACTIONS = 20000;
  const HOUR = 3600;
  const actionLabels = { long: '롱 진입', short: '숏 진입', close: '청산', wait: '관망', cancel: '예약 취소' };
  const reasonLabels = { manual: '청산 예약', opposite_signal: '반대 신호 청산', take_profit: '익절', stop_loss: '손절', liquidation: '단순 모형 강제청산' };
  const exitLabels = { opposite_smart: '① 반대 Smart LL / SS에 청산', opposite_complete: '② 반대 세 조건 완성까지 보유 · 장기 보유 실험', tp_sl: '가격 TP / SL로 청산' };
  // CSV·안내문에 앱 내부 코드(long, open, after_data_gap 등)가 그대로 나가지 않게 쓰는 한글 이름. 파일 이름 앞 짧은 이름은 exitShort.
  const sideNames = { long: '롱', short: '숏' };
  const precisionNames = { open: '봉 시가 체결', bar_close_bound: '봉 내부 체결 · 마감 시각 표기' };
  const skipNames = { position_open: '포지션 보유', position_exists: '포지션 보유', order_pending: '주문 대기', no_next_open: '다음 시가 없음', before_start: '시작 이전', data_gap: '자료 공백', simulation_finished: '연습 종료', duplicate_completion: '동시 조건 중복', invalid_completion: '유효하지 않은 조건', after_data_gap: '자료 공백으로 멈춘 뒤', after_insolvency: '자금 소진으로 멈춘 뒤', outside_closed_archive: '보관 기간 밖', end_no_next_bar: '기록 끝 · 다음 봉 없음', insolvent: '자금 소진', completion_bar_missing: '조건 봉 자료 없음' };
  const exitShort = { opposite_smart: '반대신호청산', opposite_complete: '세조건보유', tp_sl: '가격익절손절' };
  // 누른 버튼 바로 아래 안내 줄. 맨 위 알림 줄(#status)은 그대로 두고, 마지막으로 누른 곳의 줄에도 같은 문구를 쓴다. 흐린 버튼의 이유도 여기에 보인다.
  const zoneNotes = { playback: ['playback-note', 'action-note on-dark'], decision: ['decision-feedback', 'action-note decision-feedback'], export: ['export-note', 'action-note'], month: ['export-month-note', 'action-note'], comparison: ['comparison-note', 'action-note'] };
  function uiPx(n) { const root = document.documentElement; let base = 16; try { if (root && typeof getComputedStyle === 'function') base = parseFloat(getComputedStyle(root).fontSize) || 16; } catch (_) { base = 16; } return Math.max(14, Math.round(n * base / 16)); }
  function applyFontSetting(font) { const f = ['M', 'L', 'XL'].includes(font) ? font : 'L'; const root = document.documentElement; if (!root || !root.dataset) return; if (root.dataset.font === f) return; root.dataset.font = f; if (state.snapshot) queueDraw(); if (state.month) drawEquity(); queueScrollCheck(); }
  const state = { engine: null, snapshot: null, data: null, ticker: 'ZECUSDT', loadVersion: 0, timer: null, notes: [], hover: null, chart: null, chartFrame: 0, mapping: 'bothrs', saved: null, warningCodes: new Set(), mode: 'quiz', scenarios: null, caseIndex: 0, answered: false, month: null, visitedCases: new Set(), quizRun: null, carryBalance: null, run: null, runStopped: false, runWarning: '', zoneNote: null, csvSaved: null, scrollFrame: 0 };
  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n, max = 2) => Number.isFinite(Number(n)) ? Number(n).toLocaleString('ko-KR', { minimumFractionDigits: max === 2 ? 2 : 0, maximumFractionDigits: max }) : '—';
  const price = n => fmt(n, n >= 100 ? 2 : n >= 1 ? 4 : 7);
  function kst(epoch, year = false) {
    if (!Number.isFinite(Number(epoch))) return '—';
    const text = new Date(Number(epoch) * 1000 + 9 * HOUR * 1000).toISOString();
    return (year ? text.slice(0, 10) : text.slice(5, 10)) + ' ' + text.slice(11, 16);
  }
  // 표 칸 안 날짜('09-20')가 좁은 화면에서 '09-' / '20'으로 갈라지지 않게 묶는다.
  const nwDates = html => html.replace(/\b\d{2}-\d{2}\b/g, '<span class="nw">$&</span>');
  // 표의 시각 칸: 좁은 화면에서는 날짜와 시각 사이에서만 줄을 바꾼다. 'KST'는 칸마다 쓰지 않고 표 머리글에 한 번 적는다(휴대폰에서 손익 칸 자리를 넓힌다).
  function timeCell(epoch, tail = '') { const [day, hour] = kst(epoch).split(' '); return hour ? '<span class="nw">' + day + '</span> <span class="nw">' + hour + escape(tail) + '</span>' : escape(day + tail); }
  function localDate(epoch) { return new Date(epoch * 1000 + 9 * HOUR * 1000).toISOString().slice(0, 16); }
  function epochOfInput(value) { return Date.parse(value + '+09:00') / 1000; }
  function readSettings() {
    const initialBalance = state.carryBalance === null ? Number($('initial-balance').value) : state.carryBalance;
    return window.GoyaSimEngine.validateSettings({ initialBalance, leverage: Number($('leverage').value), allocationPct: Number($('allocation').value), exitMode: $('exit-mode').value, takeProfitPct: Number($('take-profit').value), stopLossPct: Number($('stop-loss').value), feeBps: 4, slippageBps: 2 });
  }
  function caseCount(ticker) {
    const counts = window.GOYA_SIM_CASES && window.GOYA_SIM_CASES.counts;
    const row = counts && counts[ticker] && counts[ticker][$('cross-mapping').value];
    return row ? (Number(row.long) || 0) + (Number(row.short) || 0) : 0;
  }
  function updateTickerOptions() {
    const selected = $('ticker').value || state.ticker;
    $('ticker').innerHTML = window.GOYA_SIM_CATALOG.symbols.map(item => {
      const count = caseCount(item.ticker);
      return '<option value="' + escape(item.ticker) + '">' + escape(item.ticker) + ' · ' + (count ? '사례 ' + count : '사례 없음') + '</option>';
    }).join('');
    $('ticker').value = selected;
  }
  function defaultTicker() {
    const symbols = window.GOYA_SIM_CATALOG.symbols;
    if (!window.GOYA_SIM_CASES) return symbols.some(item => item.ticker === 'ZECUSDT') ? 'ZECUSDT' : symbols[0].ticker;
    return symbols.reduce((best, item) => caseCount(item.ticker) > caseCount(best.ticker) ? item : best).ticker;
  }
  function nextTicker() {
    const symbols = window.GOYA_SIM_CATALOG.symbols, current = symbols.findIndex(item => item.ticker === state.ticker);
    for (let offset = 1; offset < symbols.length; offset++) {
      const ticker = symbols[(current + offset) % symbols.length].ticker;
      if (caseCount(ticker) > 0) return ticker;
    }
    return null;
  }
  function canMoveTicker() {
    const s = state.snapshot;
    return state.mode === 'quiz' && s && state.answered && nextCaseIndex() < 0 && !s.position && !s.pending && !!nextTicker();
  }
  function goNextTicker() {
    if (!canMoveTicker()) return;
    const ticker = nextTicker(), carryBalance = state.snapshot.equity;
    if (!safeRun(() => window.GoyaSimEngine.validateSettings({ ...readSettings(), initialBalance: carryBalance }))) return;
    discardRun();
    loadTicker(ticker, { carryBalance });
  }
  function removeSavedRun() { try { localStorage.removeItem(RUN_KEY); } catch (_) {} }
  function discardRun() {
    removeSavedRun(); state.run = null; state.runStopped = false; state.runWarning = ''; state.carryBalance = null;
  }
  function beginRun() {
    const s = state.engine.snapshot();
    state.run = { version: 1, ticker: state.ticker, mapping: $('cross-mapping').value, mode: state.mode, settings: s.settings, startIndex: s.index, carryBalance: state.carryBalance, actions: [], savedAt: new Date().toISOString() };
    state.runStopped = false; state.runWarning = '';
  }
  function saveRun() {
    if (!state.run || state.runStopped || state.mode === 'month') return;
    state.run.savedAt = new Date().toISOString();
    try { localStorage.setItem(RUN_KEY, JSON.stringify(state.run)); state.runWarning = ''; }
    catch (_) { state.runWarning = '이 기기에서는 이어하기 저장이 제한됩니다. CSV로 보관하세요.'; }
  }
  function recordActions(...actions) {
    if (!state.run || state.runStopped || state.mode === 'month') return;
    if (state.run.actions.length + actions.length > MAX_ACTIONS) {
      state.runStopped = true; removeSavedRun();
      state.runWarning = '기록이 너무 길어 이어하기 저장을 멈췄습니다. CSV로 보관하세요.';
      return;
    }
    state.run.actions.push(...actions); saveRun();
  }
  function readSavedRun() {
    const run = JSON.parse(localStorage.getItem(RUN_KEY) || 'null');
    if (run === null) return null;
    if (run.version !== 1 || !window.GOYA_SIM_CATALOG.symbols.some(item => item.ticker === run.ticker) ||
        !['bothrs','rls','cross'].includes(run.mapping) || !['quiz','manual'].includes(run.mode) ||
        !Number.isInteger(run.startIndex) || run.startIndex < 0 || !run.settings || typeof run.settings !== 'object' ||
        !Array.isArray(run.actions) || run.actions.length > MAX_ACTIONS) throw new Error('저장 형식 오류');
    run.settings = window.GoyaSimEngine.validateSettings(run.settings);
    if (run.carryBalance !== null && (!Number.isFinite(run.carryBalance) || run.carryBalance !== run.settings.initialBalance)) throw new Error('이월 잔액 오류');
    for (const action of run.actions) {
      if (!action || (action.k !== 's' && action.k !== 'a') ||
          (action.k === 's' && (!['long','short','close','wait'].includes(action.a) || typeof action.n !== 'string' || action.n.length > 300)) ||
          (action.k === 'a' && (!Number.isInteger(action.n) || action.n < 0 || action.n > 10000))) throw new Error('저장 행동 오류');
    }
    return run;
  }
  function restoreRun(run) {
    const engine = window.GoyaSimEngine.create({ ticker: run.ticker, bars: state.data.bars, signals: state.data.signals, completions: state.scenarios.completions, startIndex: run.startIndex, settings: run.settings, archiveEnd: Date.parse(window.GOYA_SIM_CATALOG.anchorUTC) / 1000 });
    let snapshot = engine.snapshot(), caseIndex = -1, answered = false;
    const visitedCases = new Set();
    function visitCases() {
      state.scenarios.cases.forEach((item, index) => {
        if (item.index <= snapshot.index) {
          if (item.index >= run.startIndex) visitedCases.add(index);
          if (index > caseIndex) { caseIndex = index; answered = false; }
        }
      });
      if (caseIndex >= 0) visitedCases.add(caseIndex);
    }
    visitCases();
    if (run.mode === 'quiz' && caseIndex < 0) throw new Error('저장된 연습 조건이 없습니다.');
    for (const action of run.actions) {
      if (action.k === 's') { snapshot = engine.submit(action.a, action.n); answered = true; }
      else {
        const previousIndex = snapshot.index;
        // n=0 records a gap stop without inventing a candle; the engine requires advance(1).
        snapshot = engine.advance(action.n || 1);
        if (snapshot.index - previousIndex !== action.n || (action.n === 0 && snapshot.finishReason !== 'data_gap')) throw new Error('저장된 진행 구간이 자료와 다릅니다.');
        visitCases();
      }
    }
    state.engine = engine; state.run = run; state.carryBalance = run.carryBalance; state.caseIndex = caseIndex; state.visitedCases = visitedCases;
    state.notes = snapshot.decisions.map(item => item.note || ''); state.mode = run.mode; updateModeView();
    const fields = { leverage: 'leverage', allocationPct: 'allocation', exitMode: 'exit-mode', takeProfitPct: 'take-profit', stopLossPct: 'stop-loss' };
    Object.entries(fields).forEach(([key, id]) => { $(id).value = String(run.settings[key]); });
    if (run.carryBalance === null) $('initial-balance').value = String(run.settings.initialBalance);
    $('start-date').value = localDate(state.data.bars[run.startIndex].time + HOUR);
    if (run.mode === 'quiz') presentCase(caseIndex);
    state.answered = answered;
    if (run.mode === 'quiz' && answered) { $('quiz-feedback').textContent = '이 조건의 판단을 복원했습니다. 다음 봉을 보며 연습을 이어가세요.'; $('quiz-feedback').classList.add('answered'); }
    render(snapshot);
    notify('이전 연습을 이어서 진행합니다 · 판단 ' + snapshot.decisions.length + '회 · 평가 자산 ' + fmt(snapshot.equity) + ' USDT', 'success');
  }
  function exitDescription(settings) {
    const brackets = [];
    if (settings.takeProfitPct > 0) brackets.push('추가 익절 ' + settings.takeProfitPct + '%');
    if (settings.stopLossPct > 0) brackets.push('추가 손절 ' + settings.stopLossPct + '%');
    return (exitLabels[settings.exitMode] || '청산 규칙 미선택') + ' · ' + (brackets.length ? brackets.join(' / ') : '가격 TP·SL 사용 안 함');
  }
  function tradeReason(trade) {
    return (reasonLabels[trade.reason] || trade.reason) + (trade.exitTrigger ? ' · ' + trade.exitTrigger.label + ' 확인 ' + kst(trade.exitTrigger.availableAt) + ' KST' : '');
  }
  function mappingLabel(mapping) { return mapping === 'bothrs' ? 'RS 교차 · 우리 연구 규칙' : mapping === 'rls' ? '비교 연구 RL / RS' : mapping === 'cross' ? '비교 연구 Cross 진입' : '미선택'; }
  // 판단 기록(화면)과 기록 CSV가 같은 문구를 쓴다. 취소된 예약·자동 청산은 내가 누른 판단처럼 보이지 않게 따로 적는다.
  function decisionText(d, i) {
    const note = d.note || state.notes[i] || '';
    if (d.status === 'cancelled') {
      const auto = d.orderReason === 'opposite_signal';
      return { action: actionLabels.cancel, reason: (d.reason === 'data_gap' ? '자료 공백으로 ' : d.reason === 'archive_end' ? '기록 끝이라 ' : '') + (auto ? '자동 청산' : actionLabels[d.action] || '주문') + ' 예약 취소' + (note ? (auto ? ' · ' : ' · 메모: ') + note : '') };
    }
    if (d.automatic) return { action: '자동 청산', reason: note || '반대 신호 확인 · 다음 봉 시가 청산 예약' };
    return { action: actionLabels[d.action] || d.action, reason: note || (d.action === 'wait' ? '관망을 선택했습니다.' : '다음 봉 시가 체결 예약') };
  }
  // CSV 숫자 칸은 화면과 같은 자리로 표시만 반올림한다(계산값은 그대로). 쉼표·지수 표기 없이 써서 엑셀이 숫자로 읽는다.
  function csvNum(n, digits = 2) { if (n === '' || n == null || !Number.isFinite(Number(n))) return ''; const text = Number(n).toFixed(digits).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, ''); return text === '-0' ? '0' : text; }
  const csvPrice = n => csvNum(n, n >= 100 ? 2 : n >= 1 ? 4 : 7);
  // 시각 칸 끝에 ' KST'를 붙여 글자로 남긴다. 엑셀이 날짜로 바꾸면 기본 열 너비에서 '#######'로 보인다.
  const csvTime = epoch => epoch == null || epoch === '' || !Number.isFinite(Number(epoch)) ? '' : kst(epoch, true) + ' KST';
  const csvSide = side => sideNames[side] || side || '';
  const bpsPct = bps => String(Number((Number(bps) / 100).toFixed(4)));
  function costText(settings) { return '수수료 편도 ' + bpsPct(settings.feeBps) + '% · 슬리피지 편도 ' + bpsPct(settings.slippageBps) + '%'; }
  function bracketText(settings) { return settings.takeProfitPct > 0 || settings.stopLossPct > 0 ? (settings.takeProfitPct > 0 ? '추가 익절 ' + settings.takeProfitPct + '%' : '추가 익절 꺼짐') + ' · ' + (settings.stopLossPct > 0 ? '추가 손절 ' + settings.stopLossPct + '%' : '추가 손절 꺼짐') : '추가 익절·손절 꺼짐'; }
  function analyzeCases() { state.scenarios = window.GoyaScenarios.analyze(state.data, $('cross-mapping').value); }
  function startCase(index) {
    if (!state.data) return;
    stop(); state.caseIndex = index; state.answered = false; state.notes = []; state.hover = null; state.visitedCases = new Set(); state.quizRun = null; $('decision-note').value = '';
    $('quiz-feedback').classList.remove('answered'); $('next-case').disabled = true;
    if (!state.scenarios || !state.scenarios.cases.length) {
      state.engine = null; state.snapshot = null; disableForLoad(); $('new-run').disabled = true; $('run-month').disabled = false;
      $('current-time').textContent = '완성 조건 없음'; $('ohlc').textContent = '현재 종목에는 선택한 규칙으로 연습할 완성 조건이 없습니다.'; $('position-state').textContent = '시작된 연습 계좌 없음'; $('rule-result').textContent = '현재 규칙의 완성 조건 없음';
      $('chart-empty').textContent = '선택한 규칙으로 완성된 연습 조건이 없습니다.';
      $('case-number').textContent = '선택한 규칙의 확인 결과'; $('case-prompt').textContent = '이 종목의 보관 기간에는 현재 규칙으로 연습 가능한 완성 조건이 없습니다.';
      $('case-evidence').innerHTML = ''; $('quiz-feedback').textContent = '다른 코인을 선택하거나, 자유 연습에서 신호를 직접 관찰해 보세요. 없는 조건을 만들어 넣지 않습니다.';
      notify('선택한 종목과 규칙에서 연습 가능한 완성 조건을 찾지 못했습니다. 다른 코인 또는 자유 연습을 선택해 주세요.');
      return;
    }
    const item = state.scenarios.cases[index];
    if (!item) return;
    safeRun(() => {
      state.engine = window.GoyaSimEngine.create({ ticker: state.ticker, bars: state.data.bars, signals: state.data.signals, completions: state.scenarios.completions, startIndex: item.index, settings: readSettings(), archiveEnd: Date.parse(window.GOYA_SIM_CATALOG.anchorUTC)/1000 });
      beginRun();
      presentCase(index);
      notify('세 조건이 모인 시점부터 시작합니다. 먼저 포지션 방향을 선택해 주세요. 이후 판단과 손익은 같은 연습 계좌에 누적됩니다.');
    });
  }
  function presentCase(index) {
      const item = state.scenarios.cases[index];
      if (!item || !state.engine) return;
      stop(); state.caseIndex = index; state.answered = false; state.visitedCases.add(index); state.hover = null; state.fitCase = true;
      $('decision-note').value = ''; $('quiz-feedback').classList.remove('answered');
      const snapshot = state.engine.snapshot();
      $('case-number').textContent = '실제 신호 조건 · 연습 ' + (index + 1) + ' · 누적 계좌 유지';
      $('case-prompt').textContent = kst(item.availableAt, true) + ' KST에 세 조건이 모두 확인되었습니다. 판단을 선택한 뒤 실제 과거 가격을 순서대로 진행합니다.';
      const ordered = item.steps.slice().sort((a,b) => a.time-b.time || ({smart:0,premium:1,cross:2}[a.role] - {smart:0,premium:1,cross:2}[b.role]));
      $('case-evidence').innerHTML = ordered.map((step,i) => {
        const labels = step.labels.map(l => step.role === 'smart' ? (l==='L'?'LL':l==='S'?'SS':l) : l==='SRS'?'RS':l==='LRL'?'RL':l);
        const title = step.role === 'smart' ? 'Smart 시작' : step.role === 'premium' ? 'Premium 단계' : '교차 신호';
        return '<div><span class="evidence-order">' + (i+1) + '</span><span class="evidence-title">' + title + '</span><strong>' + escape(labels.join(' · ')) + '</strong><small>' + kst(step.availableAt) + ' 확인</small></div>';
      }).join('');
      $('quiz-feedback').textContent = snapshot.pending && snapshot.pending.reason === 'opposite_signal' ? '반대 신호를 확인해 기존 포지션 청산이 자동 예약되었습니다. 관망을 선택하고 다음 봉에서 청산 결과를 확인하세요. 반대 방향으로 자동 재진입하지는 않습니다.' : snapshot.position ? '앞서 진입한 포지션을 보유 중입니다. 설정한 반대 신호가 나오면 자동 청산합니다. 이번 조건에서는 청산 예약 또는 관망을 선택하세요.' : '세 조건을 읽고 ' + (window.innerWidth>1000?'오른쪽':'아래') + '에서 롱·숏·관망을 선택하세요. 선택한 다음부터 가격을 진행할 수 있습니다.';
      render(snapshot);
  }
  function nextCaseIndex() {
    if (!state.snapshot || !state.scenarios) return -1;
    return state.scenarios.cases.findIndex((item, index) => !state.visitedCases.has(index) && item.index > state.snapshot.index);
  }
  function goNextCase() {
    if (!state.snapshot || !state.answered) return;
    const index = nextCaseIndex();
    if (index >= 0) { stop(); advance(state.scenarios.cases[index].index - state.snapshot.index); }
  }
  function changeMode(mode) {
    if (mode === state.mode) return;
    stop();
    if (state.mode === 'quiz' && state.engine) state.quizRun = { engine: state.engine, notes: state.notes, caseIndex: state.caseIndex, answered: state.answered, visitedCases: state.visitedCases, feedback: $('quiz-feedback').textContent, run: state.run, carryBalance: state.carryBalance, runStopped: state.runStopped, runWarning: state.runWarning };
    state.mode = mode;
    updateModeView();
    if (!state.data) return;
    if (mode === 'quiz') {
      analyzeCases();
      if (state.quizRun) {
        const run = state.quizRun; state.engine = run.engine; state.notes = run.notes; state.visitedCases = run.visitedCases; state.run = run.run; state.carryBalance = run.carryBalance; state.runStopped = run.runStopped; state.runWarning = run.runWarning;
        presentCase(run.caseIndex); state.answered = run.answered; $('quiz-feedback').textContent = run.feedback; $('quiz-feedback').classList.toggle('answered', run.answered); render(state.engine.snapshot());
        if (state.run && (state.run.actions.length || state.carryBalance !== null)) saveRun();
        notify('내 연습 계좌와 판단 기록을 이어갑니다. 자동 전략 결과와는 별도의 계좌입니다.');
      } else { discardRun(); startCase(0); }
    }
    else if (mode === 'manual') newRun();
    else { $('run-month').disabled=false; notify('선택한 한 종목의 한 달 전략 결과를 계산합니다. 설정을 확인한 뒤 실행해 주세요.'); if(state.month)drawEquity(); }
  }
  function updateModeView() {
    const mode = state.mode;
    ['quiz','month','manual'].forEach(key => { $('mode-'+key).classList.toggle('active',key===mode); $('mode-'+key).setAttribute('aria-pressed',String(key===mode)); });
    $('quiz-question').hidden = mode !== 'quiz'; $('workspace').hidden = mode === 'month'; $('review').hidden = mode === 'month'; $('monthly').hidden = mode !== 'month'; $('date-label').hidden = mode !== 'manual'; $('new-run').hidden = mode === 'month';
    $('new-run').textContent = mode === 'quiz' ? '이 조건부터 새 계좌로' : '새 연습 시작';
    $('next-ticker').disabled = !canMoveTicker();
    queueScrollCheck();
  }
  function clearMonth() { state.month = null; $('month-results').hidden=true; $('month-empty').hidden=false; $('month-empty').innerHTML='실행을 누르면 전체 기간의 모의 결과가 표시됩니다.<br>실제 계좌의 수익이 아닌, 보관 시세에 체결 가정을 적용한 계산입니다.'; }
  function runMonth() {
    if (!state.data) return;
    stop();
    safeRun(() => {
      analyzeCases();
      const options = { ticker: state.ticker, bars: state.data.bars, signals: state.data.signals, completions: state.scenarios.completions, settings: readSettings(), archiveEnd: Date.parse(window.GOYA_SIM_CATALOG.anchorUTC)/1000 };
      const comparison = ['opposite_smart', 'opposite_complete'].map(exitMode => window.GoyaSimEngine.runStrategy({ ...options, settings: { ...options.settings, exitMode } }));
      const result = comparison.find(item => item.settings.exitMode === options.settings.exitMode) || window.GoyaSimEngine.runStrategy(options);
      state.month = { result, comparison, mapping: $('cross-mapping').value, unusable: state.scenarios.unusable, generatedAt: new Date().toISOString() };
      renderMonth();
      notify(state.ticker + ' 한 종목의 한 달 전략 시뮬레이션을 계산했습니다. 실제 계좌 수익이 아닌 모의 결과입니다.', 'success');
    });
  }
  function renderMonth() {
    const {result:r,mapping,unusable} = state.month, s=r.summary, settings=r.settings;
    $('month-results').hidden=false; $('month-empty').hidden=true;
    $('month-rule').textContent=r.ticker + ' 한 종목 · ' + mappingLabel(mapping) + ' · 증거금 '+settings.allocationPct+'% · '+settings.leverage+'배 · '+exitDescription(settings);
    renderExitComparison();
    const items=[['최종 평가 자산',fmt(s.finalEquity)+' USDT','초기 '+fmt(s.initialBalance)+' USDT'],['누적 순손익',(s.netPnl>0?'+':'')+fmt(s.netPnl)+' USDT','계좌 수익률 '+fmt(s.returnPct)+'% · 미실현 포함'],['완료 거래',s.tradeCount+'회','진입 체결 '+s.filledCount+'회'],['실현 순손익',fmt(s.realizedPnl)+' USDT','청산을 마친 거래 · 수수료 반영'],['미실현 평가손익',fmt(s.unrealizedNetPnl)+' USDT','열린 포지션 · 진입 수수료 반영'],['총 수수료',fmt(s.fees)+' USDT','진입·청산 수수료 합계'],['최대 낙폭',fmt(s.maxDrawdownPct)+'%','마감 봉 평가 자산 기준'],['건너뛴 조건',s.skippedCount+'개','보유·대기·사용 불가 등']];
    $('month-stats').innerHTML=items.map(([title,value,note],i)=>'<div><span>'+title+'</span><strong'+(i===1?' class="'+(s.netPnl>=0?'positive':'negative')+'"':'')+'>'+value+'</strong><small>'+note+'</small></div>').join('');
    // 기간 머리글은 첫 봉의 시작 시각부터 마지막 봉의 마감 시각까지다. 그래프 아래 날짜는 봉 마감 시각이라 기준을 함께 적는다.
    $('month-period').textContent=kst(r.coverage.from,true)+' 봉부터 '+kst(r.coverage.to,true)+' 마감까지 KST · 그래프 날짜는 봉이 끝난 시각';
    const skips={};(r.skippedCompletions||[]).forEach(item=>skips[item.reason]=(skips[item.reason]||0)+1);
    const skipsText=Object.entries(skips).map(([reason,count])=>(skipNames[reason]||reason)+' '+count+'개').join(' · ');
    $('month-result-note').textContent='세 조건 완성 '+(state.scenarios?state.scenarios.completions.length:'—')+'개 중 예약 '+s.acceptedCount+'회.'+(skipsText?' 건너뜀: '+skipsText+'.':'')+' 자료 공백·다음 시가 부족으로 사전 제외 '+(unusable||[]).length+'개.'+(s.openPosition?' 미청산 '+(s.openPosition.side==='long'?'롱':'숏')+' 포지션은 마지막 종가로 평가했으며 강제로 청산하지 않았습니다.':'')+(r.coverage.completeToArchive?'':' 원본 공백 또는 자금 상태로 전체 보관 기간 끝까지 진행하지 못했습니다.')+' 순손익은 비용과 미실현 평가를 반영한 모의 값입니다.';
    $('month-trades').innerHTML=r.trades.length?r.trades.map(t=>'<tr><td>'+timeCell(t.entryAt,' →')+'<br>'+timeCell(t.exitAt)+'</td><td><span class="nw">'+(t.side==='long'?'롱':'숏')+' / '+settings.leverage+'배</span><br><small>'+nwDates(escape(tradeReason(t)))+'</small></td><td>'+price(t.entryPrice)+' → '+price(t.exitPrice)+'<br><small>증거금 '+fmt(t.margin)+' / 명목 '+fmt(t.notional)+'</small></td><td>수수료 '+fmt(t.fees)+'<br><b class="'+(t.netPnl>=0?'positive':'negative')+'">'+fmt(t.netPnl)+' USDT</b>'+(t.ambiguous?'<br><small>같은 봉: 손절 우선</small>':'')+'</td></tr>').join(''):'<tr><td colspan="4" class="empty-row">완료된 거래가 없습니다. 완성 조건이 없거나 포지션이 아직 청산되지 않았을 수 있습니다.</td></tr>';
    drawEquity(); queueScrollCheck();
    try { localStorage.setItem(MONTH_KEY,JSON.stringify({version:1,mode:'monthly',ticker:r.ticker,mapping,settings,summary:s,coverage:r.coverage,savedAt:state.month.generatedAt})); } catch(_){}
  }
  function renderExitComparison() {
    const list = state.month.comparison, first = list[0], second = list[1];
    const difference = first.summary.netPnl - second.summary.netPnl;
    const tied = Math.abs(difference) < 0.0000001;
    const openEnded = list.some(item => item.summary.openPosition);
    const best = tied || openEnded ? null : difference > 0 ? first : second;
    $('exit-comparison-note').textContent = (openEnded ? '한쪽 이상이 청산 없이 포지션을 보유한 채 기록이 끝나 실현 손익으로는 비교할 수 없습니다. 미청산 평가액은 참고값이며 우위를 정하지 않습니다.' : tied ? '두 청산 방식의 순손익이 같습니다.' : exitLabels[best.settings.exitMode] + ' 방식의 이 기간 순손익이 ' + fmt(Math.abs(difference)) + ' USDT 더 높습니다.') + ' 같은 종목·기간·증거금·레버리지·비용으로 비교했습니다. 미청산 포지션은 마지막 종가로 평가하며, 순손익이 높아도 실현 수익을 뜻하지는 않습니다. 과거 한 달 비교이며 앞으로의 우열은 알 수 없습니다.';
    $('exit-comparison').innerHTML = list.map(item => {
      const s = item.summary, stats = item.snapshot.stats, selected = item.settings.exitMode === state.month.result.settings.exitMode;
      // 선택 버튼은 방식 이름 바로 아래에 둔다(좁은 화면에서 이름과 버튼이 함께 보이게). data-label 은 좁은 화면에서 칸 이름으로 보인다.
      // 완료 거래가 있는데 마지막 포지션만 열려 있으면 '청산 없음'이 아니라 '마지막 포지션 보유 중'이다.
      return '<tr' + (selected ? ' class="selected-rule"' : '') + '><td data-label="청산 시점"><span class="comparison-name">' + escape(exitLabels[item.settings.exitMode]) + '</span>' + (best === item ? '<span class="comparison-badge">이 기간 우위</span>' : s.openPosition ? '<span class="comparison-badge">' + (s.tradeCount > 0 ? '마지막 포지션 보유 중' : '청산 없음 · 보유 지속') + '</span>' : tied ? '<span class="comparison-badge">동일 결과</span>' : '') + '<button class="button comparison-select" data-exit-mode="' + item.settings.exitMode + '"' + (selected ? ' disabled' : '') + '>' + (selected ? '아래 결과 표시 중' : '이 방식 결과 보기') + '</button></td><td data-label="순손익 · 평가 포함"><strong class="' + (s.netPnl >= 0 ? 'positive' : 'negative') + '">' + fmt(s.netPnl) + ' USDT</strong><small>수익률 ' + fmt(s.returnPct) + '%</small></td><td data-label="실현 / 미실현"><span>' + fmt(stats.realizedPnl) + '</span><small>미실현 ' + fmt(stats.unrealizedNetPnl) + ' USDT</small></td><td data-label="완료 거래"><span>' + s.tradeCount + '회</span><small>미청산 ' + (s.openPosition ? '1건' : '없음') + '</small></td></tr>';
    }).join('');
  }
  function showComparisonMode(mode) {
    if (!state.month) return;
    const result = state.month.comparison.find(item => item.settings.exitMode === mode);
    if (!result) return;
    // 결과 표시만 바꾼다. 위 연습 설정(#exit-mode)은 건드리지 않는다(자유 연습·새 계좌가 말없이 ②로 시작하지 않게).
    state.month.result = result; renderMonth();
    const scroller = $('comparison-scroll'); if (scroller) scroller.scrollLeft = 0;
    // 누른 버튼이 다시 그려져 사라지므로 키보드 초점을 비교표 제목으로 옮긴다(화면은 움직이지 않는다).
    const heading = $('comparison-heading'); if (heading && typeof heading.focus === 'function') { heading.setAttribute('tabindex', '-1'); try { heading.focus({ preventScroll: true }); } catch (_) {} }
    notify('아래 한 달 결과를 ' + exitLabels[mode] + ' 방식으로 보여 드립니다. 위 연습 설정(포지션 정리 기준)은 바뀌지 않습니다.', '', 'comparison');
  }
  function drawEquity() {
    if(!state.month||state.mode!=='month')return;
    const canvas=$('equity-chart'),ctx=canvas.getContext('2d'),points=state.month.result.equityCurve;if(!ctx||!points.length)return;
    const width=Math.max(280,canvas.getBoundingClientRect().width),height=230,dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=width*dpr;canvas.height=height*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
    const pad={l:14,r:80,t:18,b:35},ph=height-pad.t-pad.b;let lo=Math.min(...points.map(p=>p.equity)),hi=Math.max(...points.map(p=>p.equity));const extra=Math.max((hi-lo)*.2,1);lo-=extra;hi+=extra;
    ctx.font=uiPx(11)+'px "Malgun Gothic",sans-serif';ctx.textBaseline='middle';
    // 오른쪽 여백: 큰 글씨(XL)에서 '10,220.43' 같은 축 라벨 끝이 잘리지 않게 실제 글자 폭으로 잡는다(테스트 스텁은 measureText 가 undefined 를 돌려줄 수 있음).
    const textW=text=>{const m=typeof ctx.measureText==='function'?ctx.measureText(text):null;return (m&&m.width)||0;};
    const labels=[0,1,2,3].map(i=>fmt(lo+(hi-lo)*i/3)),labelW=labels.reduce((w,text)=>Math.max(w,textW(text)),0);
    pad.r=Math.max(80,Math.ceil(labelW+17));
    const pw=width-pad.l-pad.r;
    const x=i=>pad.l+i/Math.max(points.length-1,1)*pw,y=value=>pad.t+(hi-value)/(hi-lo)*ph;
    for(let i=0;i<4;i++){const yy=y(lo+(hi-lo)*i/3);ctx.strokeStyle='#e0e4d9';ctx.beginPath();ctx.moveTo(pad.l,yy);ctx.lineTo(width-pad.r,yy);ctx.stroke();ctx.fillStyle='#596970';ctx.fillText(labels[i],width-pad.r+9,yy);}
    ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(x(i),y(p.equity)):ctx.moveTo(x(i),y(p.equity)));ctx.strokeStyle='#17645c';ctx.lineWidth=2;ctx.stroke();ctx.lineTo(x(points.length-1),height-pad.b);ctx.lineTo(x(0),height-pad.b);ctx.closePath();ctx.fillStyle='rgba(23,100,92,.08)';ctx.fill();
    // 아래 날짜 두 개: 좁은 화면·큰 글씨에서 겹치면 끝 날짜를 오른쪽 끝(축 라벨 칸 아래 빈 곳)으로 옮기고, 그래도 겹치면 끝 날짜를 생략한다.
    const firstDate=kst(points[0].time),lastDate=kst(points[points.length-1].time),firstEnd=pad.l+textW(firstDate)+8;let lastX=width-pad.r;if(firstEnd>lastX-textW(lastDate))lastX=width-8;
    ctx.fillStyle='#596970';ctx.fillText(firstDate,pad.l,height-13);ctx.textAlign='right';if(firstEnd<=lastX-textW(lastDate))ctx.fillText(lastDate,lastX,height-13);
  }
  function exportMonth() {
    if(!state.month)return;
    const {result:r,mapping,unusable}=state.month, st=r.settings, mode=st.exitMode, lev=st.leverage;
    // 청산모드(설정 코드) 열은 그대로 두고 맨 끝 '청산방식' 열에 한글 이름을 적는다. 숫자 칸은 화면과 같은 자리로만 반올림한다.
    const trigger=x=>x?[x.label,csvTime(x.time),csvTime(x.availableAt)]:['','',''], tail=m=>[m,'','','',exitLabels[m]||m], notEntered='진입 안 함 · 진입시각 칸은 조건 확인 시각';
    const period=res=>'진입·청산 칸은 계산 기간 시작·끝 · 순손익은 미실현 포함'+(res.coverage.completeToArchive?'':' · '+(res.coverage.finishedReason==='data_gap'?'자료 공백으로 ':res.coverage.finishedReason==='insolvent'?'모의 자금 소진으로 ':'')+csvTime(res.coverage.to)+'에서 계산 중단');
    const rows=[['구분','종목','방향','진입시각_KST','청산시각_KST','레버리지','증거금','명목금액','진입가','청산가','수수료','순손익_USDT','청산이유','비고','청산모드','반대신호','반대신호_표시봉_KST','반대신호_확인_KST','청산방식']];
    r.trades.forEach(t=>rows.push(['완료거래',r.ticker,csvSide(t.side),csvTime(t.entryAt),csvTime(t.exitAt),lev,csvNum(t.margin),csvNum(t.notional),csvPrice(t.entryPrice),csvPrice(t.exitPrice),csvNum(t.fees),csvNum(t.netPnl),tradeReason(t),t.ambiguous?'동일 봉 익절·손절: 손절 우선':precisionNames[t.exitTimePrecision]||t.exitTimePrecision,mode,...trigger(t.exitTrigger),exitLabels[mode]||mode]));
    if(r.summary.openPosition){const p=r.summary.openPosition;rows.push(['미청산',r.ticker,csvSide(p.side),csvTime(p.entryAt),'',lev,csvNum(p.margin),csvNum(p.notional),csvPrice(p.entryPrice),'',csvNum(p.entryFee),'','미청산 평가','미실현(진입 수수료 빼기 전) '+fmt(p.unrealizedPnl)+' USDT · 진입 수수료 반영 '+fmt(r.summary.unrealizedNetPnl)+' USDT',...tail(mode)]);}
    (r.skippedCompletions||[]).forEach(item=>rows.push(['제외조건',r.ticker,csvSide(item.completion.direction),csvTime(item.completion.availableAt),'',lev,'','','','','','',skipNames[item.reason]||item.reason,notEntered,...tail(mode)]));
    (unusable||[]).forEach(item=>rows.push(['사전제외',r.ticker,csvSide(item.direction),csvTime(item.availableAt),'',lev,'','','','','','',item.reason?skipNames[item.reason]||item.reason:'자료 부족',notEntered,...tail(mode)]));
    rows.push(['요약',r.ticker,'',csvTime(r.coverage.from),csvTime(r.coverage.to),lev,'','','','',csvNum(r.summary.fees),csvNum(r.summary.netPnl),'최종평가 '+fmt(r.summary.finalEquity)+' USDT',period(r)+' / '+mappingLabel(mapping)+' / 증거금 '+st.allocationPct+'% / '+bracketText(st)+' / '+costText(st)+' / 펀딩비 제외 / 단순 격리 청산 모형',...tail(mode)]);
    state.month.comparison.forEach(item=>rows.push(['청산방식비교',r.ticker,'',csvTime(item.coverage.from),csvTime(item.coverage.to),item.settings.leverage,'','','','',csvNum(item.summary.fees),csvNum(item.summary.netPnl),'실현 '+fmt(item.summary.realizedPnl)+' USDT / 미실현 '+fmt(item.summary.unrealizedNetPnl)+' USDT(진입 수수료 반영)',period(item)+' / 과거 기간 비교',...tail(item.settings.exitMode)]));
    // 파일 이름: 설정 코드 앞에 짧은 한글 이름, 끝에 저장 시각(KST)을 붙여 설정을 바꿔 다시 저장해도 이름이 겹치지 않게 한다.
    downloadRows(rows,'한달전략시뮬레이션_'+r.ticker+'_'+lev+'배_'+(exitShort[mode]?exitShort[mode]+'_':'')+mode+'_저장'+kst(Date.now()/1000).replace(/[-:]/g,'').replace(' ','-')+'.csv',$('export-month'),'한 달 결과를 CSV 파일로 저장했습니다.');
  }
  // 엑셀 수식 실행 막기: = + - @ 탭·줄바꿈으로 시작하는 글자 앞에 작은따옴표를 붙인다('- LL 봤음'이 #NAME?이 되지 않게). 음수 손익 같은 순수 숫자는 그대로 둔다.
  function csvText(rows){function cell(v){let text=String(v==null?'':v);if(/^[=+\-@\t\r\n]/.test(text)&&!/^-?\d+(\.\d+)?$/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';}return '\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n');}
  function blobDownload(name,text){const blob=new Blob([text],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  // 앱(WebView) 안에서는 window.cbSave 로 네이티브에 저장을 맡기고 같은 id 의 응답을 기다린다. 브라우저에서는 blob 내려받기.
  const SAVE_TIMEOUT_MS = 15000, SAVE_LATE_MS = 5 * 60 * 1000;
  const pendingSaves = new Map();
  let saveSeq = 0, saveBridge = null;
  function nativeSaveBridge() { const bridge = window.cbSave; return bridge && typeof bridge.postMessage === 'function' ? bridge : null; }
  function saveResult(ok, native, fileName, message) { return { ok: !!ok, native: !!native, fileName: fileName || '', message: message || '' }; }
  function onNativeSaveReply(event) {
    let reply = null;
    try { reply = JSON.parse(typeof event.data === 'string' ? event.data : ''); } catch (_) { return; }
    if (!reply || typeof reply.id !== 'string') return;
    const pending = pendingSaves.get(reply.id);
    if (!pending) return;
    pendingSaves.delete(reply.id); clearTimeout(pending.timer);
    const result = saveResult(reply.ok === true, true, typeof reply.fileName === 'string' ? reply.fileName : '', typeof reply.message === 'string' ? reply.message : '');
    // 시간 초과 뒤 늦게 온 응답(옛 기기의 저장 위치 선택 화면)도 결과 문구로 알린다(누른 버튼 아래 줄에도).
    if (pending.late) { if (pending.lateDone) pending.lateDone(result); else notify(result.message || (result.ok ? '파일을 저장했어요.' : '파일을 저장하지 못했어요.'), result.ok ? 'success' : 'error'); }
    else pending.done(result);
  }
  function listenNativeSaves(bridge) {
    if (bridge === saveBridge) return;
    saveBridge = bridge;
    if (typeof bridge.addEventListener === 'function') bridge.addEventListener('message', onNativeSaveReply); else bridge.onmessage = onNativeSaveReply;
  }
  function inAndroidApp() { return typeof navigator !== 'undefined' && /ChartBaeumteoApp\//.test(navigator.userAgent || ''); }
  function saveTextFile(name, text, done, lateDone) {
    done = typeof done === 'function' ? done : () => {};
    const bridge = nativeSaveBridge();
    // 앱(APK) 안인데 저장 통로가 없으면(아주 오래된 WebView) 내려받기가 조용히 막히므로, 성공처럼 보이지 않게 바로 알린다.
    if (!bridge && inAndroidApp()) { done(saveResult(false, true, '', '이 휴대폰의 앱에서는 파일 저장이 안 돼요. 결과는 화면에서 확인해 주세요.')); return; }
    if (!bridge) { blobDownload(name, text); done(saveResult(true, false, name, '')); return; }
    listenNativeSaves(bridge);
    const id = 'cb-save-' + Date.now() + '-' + (++saveSeq);
    const pending = { done, late: false, timer: 0, lateDone: typeof lateDone === 'function' ? lateDone : null };
    pending.timer = setTimeout(() => {
      pending.late = true; pending.timer = setTimeout(() => pendingSaves.delete(id), SAVE_LATE_MS);
      done(saveResult(false, true, '', '저장 결과를 받지 못했어요. 저장 화면이 열려 있으면 마저 진행하고, 아니면 잠시 뒤 다시 눌러 주세요.'));
    }, SAVE_TIMEOUT_MS);
    pendingSaves.set(id, pending);
    try { bridge.postMessage(JSON.stringify({ id, name, mime: 'text/csv', text })); }
    catch (_) { pendingSaves.delete(id); clearTimeout(pending.timer); done(saveResult(false, true, '', '앱에 저장 요청을 보내지 못했어요.')); }
  }
  // 저장 버튼을 잠근 채 저장하고, 결과를 맨 위 알림 줄과 누른 버튼 바로 아래 줄에 함께 알린다(화면을 다른 곳으로 옮기지 않는다).
  // 웹(blob 내려받기)은 successText 와 파일 이름·다운로드 폴더 안내를, 앱(APK)은 앱이 돌려준 문구(저장 위치 포함)를 쓴다.
  function downloadRows(rows, name, button, successText) {
    if (state.saving) return;
    const zone = button && button.id === 'export' ? 'export' : button && button.id === 'export-month' ? 'month' : null, s = zone === 'export' ? state.snapshot : null;
    const at = s ? { engine: state.engine, index: s.index, decisions: s.decisions.length, trades: s.trades.length } : null;
    state.saving = true; if (button) button.disabled = true;
    notify('파일을 저장하고 있어요…', '', zone);
    const report = result => {
      if (!result.ok) notify(result.message || '파일을 저장하지 못했어요.', 'error', zone);
      else {
        const saved = result.fileName || name;
        if (at) { state.csvSaved = { ...at, name: saved }; if (state.snapshot) saveSummary(); }
        notify(result.native ? result.message || '파일을 저장했어요.' : (successText ? successText + ' ' : '') + '다운로드(내려받기) 폴더에서 “' + saved + '” 파일을 찾아 보세요.', 'success', zone);
      }
      revealZone(zone);
    };
    const finish = result => {
      state.saving = false;
      if (button) button.disabled = button.id === 'export' ? exportDisabled() : false;
      report(result);
    };
    try { saveTextFile(name, csvText(rows), finish, report); } catch (_) { finish(saveResult(false, false, '', '파일을 저장하지 못했어요.')); }
  }
  function exportDisabled() { const s = state.snapshot || (state.engine && state.engine.snapshot && state.engine.snapshot()); return !s || (!s.decisions.length && !s.trades.length && !s.position); }
  // zone: 누른 버튼 줄(playback·decision·export·month). 주면 그 줄에도 같은 문구(noteText 가 있으면 그 문구)를 쓰고, 안 주면 버튼 줄의 지난 문구를 지운다.
  function notify(text, kind, zone, noteText) {
    const warning = state.runWarning ? ' ' + state.runWarning : '';
    $('status').setAttribute('aria-live', zone && zoneNotes[zone] ? 'off' : 'polite'); // 버튼 아래 줄이 읽어 주므로 맨 위 줄은 조용히
    $('status').textContent = text + warning; $('status').className = 'status' + (kind ? ' ' + kind : '');
    state.zoneNote = zone && zoneNotes[zone] ? { zone, text: (noteText || text) + warning, kind: kind || '' } : null;
    renderNotes();
  }
  function decisionWhere() { return window.innerWidth > 1000 ? '오른쪽' : '아래'; }
  function finishNote(s) { return ({ data_gap: '다음 시간봉이 누락되어', insolvent: '모의 자금이 소진되어' }[s.finishReason] || '보관 기록의 끝이라') + ' 더 진행할 수 없습니다.' + (exportDisabled() ? '' : ' 판단 기록은 아래 “기록 CSV 저장”으로 보관할 수 있어요.'); }
  // 흐린(누를 수 없는) 버튼의 이유. 터치폰에서는 title 이 보이지 않으므로 버튼 줄 아래에 글로 보인다(aria-describedby 로 버튼과 연결).
  function zoneReason(zone) {
    const s = state.snapshot;
    if (!s || state.mode === 'month') return '';
    if (zone === 'playback') return s.finished ? finishNote(s) : state.mode === 'quiz' && !state.answered ? decisionWhere() + ' “지금의 판단”에서 롱·숏·관망을 먼저 고르세요. 고른 다음부터 가격을 진행할 수 있어요.' : '';
    if (zone === 'export') return !state.saving && exportDisabled() ? '판단을 한 번 기록하면 CSV로 저장할 수 있어요.' : '';
    return '';
  }
  // 버튼을 직접 눌렀을 때만 그 아래 줄이 화면 밖이면 살짝 올려 보인다(자동 진행 중에는 화면을 움직이지 않는다).
  function revealZone(zone) { const el = zone && zoneNotes[zone] ? $(zoneNotes[zone][0]) : null; if (!el || !el.textContent || typeof el.scrollIntoView !== 'function') return; try { el.scrollIntoView({ block: 'nearest' }); } catch (_) {} }
  function renderNotes() {
    Object.entries(zoneNotes).forEach(([zone, [id, base]]) => {
      const el = $(id); if (!el) return;
      const own = state.zoneNote && state.zoneNote.zone === zone ? state.zoneNote : null, text = own ? own.text : zoneReason(zone);
      if (el.textContent !== text) el.textContent = text;
      el.className = base + (own && own.kind ? ' ' + own.kind : '');
    });
  }
  // 좁은 화면에서 표가 넘치면 표 위에 '옆으로 밀어 …' 안내를 보이고 가장자리 그림자(.is-scrollable)를 붙인다.
  function markScroll(box, hint, text) {
    if (!box || !hint) return;
    const over = box.scrollWidth - box.clientWidth > 2;
    if (box.classList) box.classList.toggle('is-scrollable', over);
    if (over && hint.textContent !== text) hint.textContent = text;
    hint.hidden = !over;
  }
  function checkScrolls() {
    state.scrollFrame = 0;
    markScroll($('comparison-scroll'), $('comparison-hint'), '옆으로 밀어 나머지 칸 보기 →');
    markScroll($('month-trades-scroll'), $('month-trades-hint'), '옆으로 밀어 손익 보기 →');
    const trades = !$('trades-panel').hidden;
    markScroll($(trades ? 'trades-panel' : 'journal-panel'), $('review-hint'), trades ? '옆으로 밀어 손익 보기 →' : '옆으로 밀어 이유 보기 →');
  }
  function queueScrollCheck() { if (state.scrollFrame || typeof requestAnimationFrame !== 'function') return; state.scrollFrame = requestAnimationFrame(checkScrolls); }
  function stop() { if (state.timer) clearInterval(state.timer); state.timer = null; $('play').textContent = '▶ 자동 진행'; $('play').setAttribute('aria-pressed', 'false'); }
  function safeRun(fn, zone) { try { return fn(); } catch (error) { stop(); notify(error.message || '연습 중 오류가 발생했습니다.', 'error', zone); revealZone(zone); return null; } }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.src = src;
      script.onload = () => { script.remove(); resolve(); };
      script.onerror = () => { script.remove(); reject(new Error('종목 자료를 불러오지 못했습니다. data 폴더가 함께 있는지 확인해 주세요.')); };
      document.head.appendChild(script);
    });
  }
  function disableForLoad() {
    ['long', 'short', 'close', 'wait', 'next-hour', 'next-six', 'play', 'new-run', 'export', 'run-month', 'next-case', 'next-ticker', 'finish-month'].forEach(id => $(id).disabled = true);
    $('next-ticker').title = '';
    $('current-price').textContent = '—'; $('current-time').textContent = '자료를 불러오는 중'; $('ohlc').textContent = '새 종목의 자료를 확인하고 있습니다.';
    $('equity').textContent = '—'; $('net-pnl').textContent = '—'; $('position-state').textContent = '자료를 확인하고 있습니다.'; $('pending-state').hidden=true;
    $('pending-state').textContent = ''; $('net-pnl').className = ''; $('progress').textContent = '—'; $('order-note').textContent = '';
    $('decision-note').value = ''; $('journal-count').textContent = '0'; $('trades-count').textContent = '0';
    $('journal-body').innerHTML = '<tr><td colspan="3" class="empty-row">현재 종목의 연습을 준비하고 있습니다.</td></tr>';
    $('trades-body').innerHTML = '<tr><td colspan="4" class="empty-row">현재 종목에서 체결한 거래가 없습니다.</td></tr>';
    $('saved-summary').textContent = '새 연습의 판단과 손익은 같은 계좌에 누적됩니다.';
    $('rule-steps').innerHTML = ''; $('rule-result').textContent = '현재 종목의 신호 확인 중'; $('rule-result').className = 'rule-result';
    $('rule-hint').textContent = ''; $('case-evidence').innerHTML = ''; $('case-number').textContent = '실제 신호 조건';
    $('case-prompt').textContent = '현재 종목에서 세 조건이 모인 시점을 찾고 있습니다.'; $('quiz-feedback').textContent = ''; $('quiz-feedback').classList.remove('answered');
    $('practice-summary').textContent = '내 판단으로 진행한 누적 결과가 여기에 표시됩니다.';
    $('chart-heading').innerHTML = escape(state.ticker) + ' <span class="timeframe">1시간봉</span>';
    state.snapshot = null; state.hover = null; state.chart = null; state.fitCase=true; drawChart(); $('chart-empty').textContent = '차트를 불러오는 중입니다.'; $('chart-empty').hidden = false;
  }
  async function loadTicker(ticker, options = {}) {
    stop(); state.ticker = ticker; $('ticker').value = ticker; state.data=null; state.engine=null; state.quizRun=null; state.notes=[]; state.scenarios=null; state.visitedCases=new Set(); state.caseIndex=0; state.answered=false; state.run=null; state.runStopped=false; state.runWarning=''; state.carryBalance=options.carryBalance == null ? null : options.carryBalance; clearMonth(); const version = ++state.loadVersion; disableForLoad();
    notify(ticker + '의 실제 보관 기록을 불러오고 있습니다.');
    try {
      if (!window.GOYA_SIM_DATA || !window.GOYA_SIM_DATA[ticker]) await (window.cbLoadScript || loadScript)('data/' + encodeURIComponent(ticker) + '.js');
      if (version !== state.loadVersion) return;
      const data = window.GOYA_SIM_DATA && window.GOYA_SIM_DATA[ticker];
      if (!data || !data.bars || !data.bars.length) throw new Error('이 종목의 시간봉 기록이 없습니다.');
      state.data = data;
      const initial = Math.min(120, data.bars.length - 1);
      $('start-date').min = localDate(data.bars[0].time + HOUR);
      $('start-date').max = localDate(data.bars[data.bars.length - 1].time + HOUR);
      $('start-date').value = localDate(data.bars[initial].time + HOUR);
      $('new-run').disabled = false; $('run-month').disabled = false;
      clearMonth(); analyzeCases();
      if (options.restore) {
        try { restoreRun(options.restore); return; }
        catch (_) { discardRun(); state.engine=null; state.snapshot=null; state.notes=[]; options.warning='이전 연습 기록을 복원하지 못해 지우고 새로 시작합니다.'; }
      }
      if (state.mode === 'quiz') startCase(0);
      else if (state.mode === 'manual') newRun(initial);
      else notify(ticker + ' 기록 준비 완료. 실행 버튼을 누르면 선택한 한 종목의 전체 기간을 계산합니다.');
      if (options.carryBalance != null && state.engine) { saveRun(); notify(ticker + '로 이동했습니다. 이전 종목의 잔액 ' + fmt(state.carryBalance) + ' USDT를 이어서 사용합니다.', 'success'); }
      if (options.warning) notify(options.warning, 'error');
    } catch (error) {
      if (version !== state.loadVersion) return;
      if (options.restore) { discardRun(); state.mode='quiz'; updateModeView(); return loadTicker(defaultTicker(), { warning: '이전 연습 자료를 불러오지 못해 기록을 지우고 새로 시작합니다.' }); }
      $('current-time').textContent='자료 준비 실패'; $('ohlc').textContent=error.message; $('chart-empty').textContent='이 종목의 기록을 불러오지 못했습니다.'; notify(error.message, 'error');
    }
  }
  function newRun(forcedIndex) {
    if (!state.data) return;
    discardRun();
    if (state.mode === 'quiz') { startCase(state.caseIndex); return; }
    stop();
    const selected = epochOfInput($('start-date').value);
    const bars = state.data.bars;
    let index = Number.isInteger(forcedIndex) ? forcedIndex : bars.findLastIndex ? bars.findLastIndex(b => b.time + HOUR <= selected) : bars.map(b => b.time + HOUR <= selected).lastIndexOf(true);
    if (!Number.isFinite(selected) || index < 0 || selected > bars[bars.length - 1].time + HOUR) { notify('시작 시각을 자료 범위 안에서 골라 주세요.', 'error'); return; }
    safeRun(() => {
      state.engine = window.GoyaSimEngine.create({ ticker: state.ticker, bars, signals: state.data.signals || [], completions: state.scenarios.completions, startIndex: index, settings: readSettings(), archiveEnd: Date.parse(window.GOYA_SIM_CATALOG.anchorUTC) / 1000 });
      beginRun();
      state.notes = []; state.hover = null; state.fitCase = true; state.warningCodes.clear(); $('decision-note').value = '';
      render(state.engine.snapshot());
      notify(state.ticker + ' 새 연습을 시작했습니다. 지금까지 확인한 ' + (index + 1) + '개 봉을 보고 판단해 보세요.', 'success');
      if (state.snapshot.finished) showFinish();
    });
  }
  function submit(action) {
    if (!state.engine) return;
    stop();
    safeRun(() => {
      const note = $('decision-note').value.trim();
      const next = state.engine.submit(action, note);
      recordActions({ k: 's', a: action, n: note });
      state.notes[next.decisions.length - 1] = note;
      let graded = '';
      if (state.mode === 'quiz' && !state.answered) {
        state.answered = true;
        const scenario = state.scenarios.cases[state.caseIndex];
        const expected = scenario.direction === 'long' ? '롱' : '숏';
        graded = action === 'close' ? '기존 포지션의 청산을 예약했습니다. 이번 조건의 규칙상 방향은 ' + expected + '이며, 다음 봉에서 청산 결과를 확인합니다.' : action === 'wait' ? '관망을 선택했습니다. 이 조건의 규칙상 방향은 ' + expected + '입니다. 다음 차트를 보며 보유 또는 관망 판단을 복기하세요.' : action === scenario.direction ? '규칙상 방향과 일치합니다: ' + expected + '. 이제 다음 봉부터 실제 과거 가격을 확인하세요. 방향 일치가 수익을 보장하지는 않습니다.' : '이 조건의 규칙상 방향은 ' + expected + '입니다. 선택한 방향으로 모의 체결하고 실제 가격의 결과를 비교해 보세요.';
        $('quiz-feedback').textContent = graded;
        $('quiz-feedback').classList.add('answered');
      }
      $('decision-note').value = ''; render(next);
      // 채점 문구는 맨 위 질문 카드에 있어 휴대폰에서는 화면 밖이므로, 누른 판단 카드 안에도 같은 문구를 보인다.
      notify(action === 'wait' ? '관망 판단을 기록했습니다(판단 기록 ' + next.decisions.length + '개). 다음 봉을 보며 판단을 이어가세요.' : (actionLabels[action] || action) + '을 예약했습니다. 다음 1시간 진행 시 다음 봉 시가에 모의 체결합니다.', 'success', 'decision', graded);
      revealZone('decision');
    }, 'decision');
  }
  function tradeNote(t) { return (reasonLabels[t.reason] || '청산') + ' 처리 · 이번 거래 순손익 ' + fmt(t.netPnl) + ' USDT' + (t.ambiguous ? ' · 같은 봉 익절·손절 도달: 손절 우선' : ''); }
  // zone: 진행을 누른 곳(재생 줄이면 'playback'). 질문 카드의 진행 버튼은 바로 위 알림 줄만 쓴다.
  function advance(count, zone) {
    if (!state.engine || state.snapshot.finished || (state.mode === 'quiz' && !state.answered)) return;
    safeRun(() => {
      const before = state.snapshot, prior = before.trades.length;
      const next = state.mode === 'quiz' ? nextCaseIndex() : -1;
      const nextItem = next >= 0 ? state.scenarios.cases[next] : null;
      const steps = nextItem ? Math.min(count, nextItem.index - state.snapshot.index) : count;
       const result = state.engine.advance(steps), progressed = result.index - state.snapshot.index;
       const actions = progressed > 0 ? [{ k: 'a', n: progressed }] : [];
       // A gap can end a run without advancing; replay that terminal check separately.
       if (result.finishReason === 'data_gap') actions.push({ k: 'a', n: 0 });
       recordActions(...actions);
       render(result);
      // 진행 중에 생긴 체결·청산을 멈춘 이유 앞에 함께 알린다(새 질문이나 기록 끝에서 멈춰도 손익을 놓치지 않게).
      const s = state.snapshot, added = s.trades.length - prior, last = s.trades[s.trades.length - 1];
      const closed = added > 0 ? (added > 1 ? '거래 ' + added + '건 청산 · 마지막 거래 ' : '') + tradeNote(last) : '';
      const opened = s.position && (!before.position || before.position.entryAt !== s.position.entryAt) ? (s.position.side === 'long' ? '롱' : '숏') + ' 진입 체결 · 진입가 ' + price(s.position.entryPrice) : '';
      const reserved = s.pending && s.pending.reason === 'opposite_signal' && !(before.pending && before.pending.reason === 'opposite_signal') ? '반대 ' + (s.pending.trigger && s.pending.trigger.label || '신호') + ' 확인 · 다음 봉 시가에 자동 청산 예약' : '';
      const done = [closed, opened, reserved].filter(Boolean).join(' · ');
      if (nextItem && s.index === nextItem.index && !s.finished) {
        presentCase(next);
        notify((done ? done + '. ' : '') + '새 세 조건이 완성되어 진행을 멈췄습니다. 누적 자산과 기존 포지션은 그대로입니다. 위 질문을 읽고 ' + decisionWhere() + ' “지금의 판단”에서 고르세요.', '', zone);
        return;
      }
      if (s.finished) showFinish(zone, done);
      else if (done) notify(done, added > 0 && last.netPnl >= 0 ? 'success' : '', zone);
      else notify(kst(s.cutoff) + ' KST까지 확인했습니다. 새로운 신호와 가격을 관찰하세요.', '', zone);
    }, zone);
  }
  function showFinish(zone, done) {
    stop(); const s = state.snapshot;
    const lastDecision = s.decisions[s.decisions.length - 1], gapCancelled = !!lastDecision && lastDecision.status === 'cancelled' && lastDecision.reason === 'data_gap';
    const reason = s.finishReason === 'data_gap' ? '다음 시간봉이 누락되어 여기에서 연습을 멈췄습니다.' + (gapCancelled ? ' 대기 주문은 취소했습니다.' : '') : s.finishReason === 'insolvent' ? '모의 자금이 소진되어 연습을 종료했습니다.' : '보관 기록의 끝에 도착했습니다. 판단 기록을 저장하고 복기해 보세요.';
    notify((done ? done + '. ' : '') + reason + (s.position ? ' 미청산 포지션은 마지막 종가로 평가합니다.' : ''), s.finishReason === 'data_gap' ? 'error' : 'success', zone);
  }
  function render(s) {
    state.snapshot = s;
    $('chart-empty').hidden = true; $('new-run').disabled = false;
    $('chart-heading').innerHTML = escape(s.ticker) + ' <span class="timeframe">1시간봉</span>';
    $('current-price').textContent = price(s.current.c);
    $('current-time').textContent = kst(s.cutoff) + ' KST · 봉 마감';
    $('equity').innerHTML = fmt(s.equity) + ' <small>USDT</small>';
    $('net-pnl').textContent = (s.stats.netPnl > 0 ? '+' : '') + fmt(s.stats.netPnl) + ' USDT';
    $('net-pnl').className = s.stats.netPnl > 0 ? 'positive' : s.stats.netPnl < 0 ? 'negative' : '';
    $('practice-summary').textContent = '내 판단의 누적 결과 · 초기 ' + fmt(s.settings.initialBalance) + ' USDT → 평가 자산 ' + fmt(s.equity) + ' USDT · 수익률 ' + fmt(s.stats.returnPct) + '% · 완료 거래 ' + s.trades.length + '회 · 수수료 ' + fmt(s.stats.fees) + ' USDT. 한 달 자동 전략 결과와 별도로 계산합니다.';
    const p = s.position;
    $('position-state').innerHTML = p ? '<span>' + (p.side === 'long' ? '롱' : '숏') + ' 보유 · ' + fmt(p.qty, 6) + '개</span><small>진입 ' + price(p.entryPrice) + ' · 미실현 ' + fmt(p.unrealizedPnl) + ' USDT<br>익절 ' + (p.takeProfit == null ? '꺼짐' : price(p.takeProfit)) + ' / 손절 ' + (p.stopLoss == null ? '꺼짐' : price(p.stopLoss)) + '</small>' : '보유 포지션 없음';
    renderPending(s);
    $('long').disabled = $('short').disabled = s.finished || !!s.pending || !!p;
    $('close').disabled = s.finished || !!s.pending || !p;
    $('wait').disabled = s.finished;
    ['next-hour', 'next-six', 'play'].forEach(id => $(id).disabled = s.finished || (state.mode === 'quiz' && !state.answered));
    $('next-case').disabled = s.finished || !state.answered || nextCaseIndex() < 0;
    $('next-ticker').disabled = !canMoveTicker();
    $('next-ticker').title = p ? '보유 포지션을 정리한 뒤 이동할 수 있습니다' : s.pending ? '대기 주문이 처리된 뒤 이동할 수 있습니다' : state.mode === 'quiz' && state.answered && nextCaseIndex() >= 0 ? '이 종목 조건을 모두 마친 뒤 이동할 수 있습니다' : '';
    $('finish-month').disabled = s.finished || !state.answered;
    $('export').disabled = state.saving || exportDisabled();
    $('order-note').innerHTML = '증거금 ' + fmt(s.settings.allocationPct, 1) + '% · 레버리지 ' + s.settings.leverage + '배<br>' + escape(exitDescription(s.settings)) + '<br>반대 신호 확인 뒤 다음 봉 시가 청산 · 자동 전환 없음';
    if (p) $('position-state').innerHTML += '<small>증거금 ' + fmt(p.margin) + ' / 명목금액 ' + fmt(p.notional) + ' USDT</small>';
    $('progress').textContent = (s.index + 1) + ' / ' + state.data.bars.length + '봉 확인';
    updateReadout(state.hover == null ? s.current : state.chart && state.chart.bars[state.hover] || s.current);
    renderRule(); renderJournal(); drawChart(); saveSummary(); renderNotes(); queueScrollCheck();
  }
  // 예약 뒤 무엇을 눌러야 체결되는지 대기 상자에 함께 적는다(휴대폰에서는 '다음 1시간' 버튼이 판단 카드보다 위에 있다).
  function renderPending(s) {
    $('pending-state').hidden = !s.pending;
    if (!s.pending) return;
    const where = (window.innerWidth > 1000 ? '왼쪽' : '위쪽') + ' 차트 아래의 “다음 1시간\u00a0→”을 누르면 체결됩니다.';
    $('pending-state').textContent = (s.pending.reason === 'opposite_signal' ? '반대 ' + (s.pending.trigger && s.pending.trigger.label || '신호') + ' 확인 · 자동 청산' : actionLabels[s.pending.action] || s.pending.action) + ' 대기 · ' + kst(s.pending.expectedFillTime) + '에 시작하는 다음 봉에서 체결 · ' + (state.mode === 'quiz' && !state.answered ? '이번 판단을 고른 뒤 ' : '') + where;
  }
  function renderRule() {
    const s = state.snapshot, mapping = $('cross-mapping').value;
    const names = ['Smart LL 또는 SS', '같은 방향 L2·L3 또는 S2·S3', '선택한 교차 신호'];
    let active = null;
    if (mapping && s && window.GoyaSequence) {
      const cross = mapping === 'bothrs' ? { source: 'rls_signal', long: ['SRS'], short: ['SRS'] } : mapping === 'rls' ? { source: 'rls_signal', long: ['LRL'], short: ['SRS'] } : { source: 'cross_signal', long: ['L 진입'], short: ['S 진입'] };
      const result = window.GoyaSequence.evaluate(s.signals, s.cutoff, { group: 'none', availabilityDelaySeconds: HOUR, allowSameStartBar: false, cross });
      active = result.cycles.length ? result.cycles[result.cycles.length - 1] : null;
      $('rule-hint').textContent = mapping === 'bothrs' ? '롱·숏 모두 RS를 교차로 보는 우리 연구 규칙입니다. Premium 단계와 RS의 순서는 바뀌어도 됩니다.' : '비교 연구용 대응입니다. 기본 우리 연구 규칙과 다르며 원 지표 제공자의 공식 규칙으로 확인된 대응은 아닙니다.';
    } else $('rule-hint').textContent = 'RS/RL과 별도 Cross는 다른 자료입니다. 기준을 고르기 전에는 완성 여부를 판정하지 않습니다.';
    const valid = active && active.direction !== 'ambiguous';
    const facts = valid ? [active.smart && active.smart[0], active.premium, active.cross] : [];
    if (valid) {
      const isLong = active.direction === 'long'; names[0] = 'Smart ' + (isLong ? 'LL · 롱 시작' : 'SS · 숏 시작'); names[1] = 'Premium ' + (isLong ? 'L2 또는 L3' : 'S2 또는 S3'); names[2] = mapping === 'bothrs' ? 'RS 교차 · 우리 연구 규칙' : mapping === 'rls' ? 'Premium ' + (isLong ? 'RL' : 'RS') : 'Cross ' + (isLong ? 'L 진입' : 'S 진입');
    }
    $('rule-steps').innerHTML = names.map((name, i) => {
      const fact = facts[i], label = fact && fact.evidence ? fact.evidence.map(e => e.label).join(' · ') : '';
      const detail = fact ? kst(fact.time + HOUR) + ' 확인' + (label ? ' · ' + label : '') : i === 0 ? '시작 신호 기다림' : i === 1 ? '둘 중 하나 확인' : '2·3번은 어느 쪽이 먼저여도 됩니다';
      return '<li' + (fact ? ' class="done"' : '') + '><span>' + (fact ? '✓' : i + 1) + '</span><div><b>' + escape(name) + '</b><small>' + escape(detail) + '</small></div></li>';
    }).join('');
    const complete = valid && active.status === 'complete';
    $('rule-result').className = 'rule-result' + (complete ? ' complete' : '');
    $('rule-result').textContent = !mapping ? '교차 신호 기준 미선택' : !active ? 'Smart 시작 신호 기다림' : !valid ? '같은 봉의 반대 신호 · 방향 판정 보류' : complete ? '세 조건 확인 · ' + kst(active.availableAt) + ' KST' : (active.direction === 'long' ? '롱' : '숏') + ' 조건 관찰 중 · ' + facts.filter(Boolean).length + '/3 확인';
  }
  function renderJournal() {
    const s = state.snapshot;
    $('journal-count').textContent = s.decisions.length;
    $('journal-body').innerHTML = s.decisions.length ? s.decisions.map((d, i) => ({ d, i })).reverse().map(({d,i}) => { const text = decisionText(d, i); return '<tr><td>' + timeCell(d.time) + '</td><td>' + escape(text.action) + '</td><td>' + escape(text.reason) + '</td></tr>'; }).join('') : '<tr><td colspan="3" class="empty-row">아직 판단 기록이 없습니다. 차트를 보고 롱·숏·관망을 선택해 보세요.</td></tr>';
    const rows = [];
    s.trades.forEach(t => { rows.push({ time: t.entryAt, order: 0, label: (t.side === 'long' ? '롱' : '숏') + ' 진입', px: t.entryPrice, qty: t.qty, fee: t.entryFee, pnl: null }); rows.push({ time: t.exitAt, order: 1, label: tradeReason(t), px: t.exitPrice, qty: t.qty, fee: t.exitFee, pnl: t.netPnl, warning: t.ambiguous ? '동시 도달 · 손절 우선' : t.exitTimePrecision === 'bar_close_bound' ? '봉 내부 체결 · 마감 시각 표기' : '' }); });
    if (s.position) { const p = s.position; rows.push({ time: p.entryAt, order: 0, label: (p.side === 'long' ? '롱' : '숏') + ' 진입', px: p.entryPrice, qty: p.qty, fee: p.entryFee, pnl: null }); }
    rows.sort((a, b) => b.time - a.time || b.order - a.order);
    $('trades-count').textContent = rows.length;
    $('trades-body').innerHTML = rows.length ? rows.map(t => '<tr><td>' + timeCell(t.time) + '</td><td>' + nwDates(escape(t.label)) + (t.warning ? '<br><small>' + escape(t.warning) + '</small>' : '') + '</td><td>' + price(t.px) + '<br><small>' + fmt(t.qty, 6) + '개</small></td><td>수수료 ' + fmt(t.fee, 4) + (t.pnl !== null ? '<br><b class="' + (t.pnl >= 0 ? 'positive' : 'negative') + '">순손익 ' + fmt(t.pnl) + '</b>' : '') + '</td></tr>').join('') : '<tr><td colspan="4" class="empty-row">아직 체결된 거래가 없습니다. 예약 후 다음 봉을 진행하면 체결을 확인할 수 있습니다.</td></tr>';
  }
  function saveSummary() {
    const s = state.snapshot;
    const summary = { version: 1, savedAt: new Date().toISOString(), ticker: s.ticker, cutoff: s.cutoff, mapping: $('cross-mapping').value, exitMode:s.settings.exitMode, equity: s.equity, stats: s.stats, decisionCount: s.decisions.length, tradeCount: s.trades.length, finished: s.finished, finishReason: s.finishReason };
    // 방금 기록 CSV를 저장했고 그 뒤로 진행·판단이 없으면 'CSV 저장함 · 파일 이름'을, 아니면 보관 안내를 붙인다.
    const c = state.csvSaved, csv = c && c.engine === state.engine && c.index === s.index && c.decisions === s.decisions.length && c.trades === s.trades.length ? ' CSV 저장함 · ' + c.name : ' 전체 기록은 CSV로 보관하세요.';
    try { localStorage.setItem(STORE_KEY, JSON.stringify(summary)); $('saved-summary').textContent = '현재 연습 요약 저장됨 · ' + s.ticker + ' · 판단 ' + s.decisions.length + '회 · 완료 거래 ' + s.trades.length + '회 · 순손익 ' + fmt(s.stats.netPnl) + ' USDT.' + csv; }
    catch (_) { $('saved-summary').textContent = '이 기기에서는 요약 저장이 제한됩니다.' + csv; }
    if (state.runWarning) $('saved-summary').textContent += ' ' + state.runWarning;
  }
  function exportCsv() {
    if (!state.snapshot) return;
    stop(); // 자동 진행 중이면 멈춘다(다음 진행 알림이 저장 결과 문구를 곧바로 지우지 않게)
    const s = state.snapshot, mode = s.settings.exitMode, mapping = mappingLabel($('cross-mapping').value), modeName = exitLabels[mode] || mode;
    // 청산모드(설정 코드) 열은 그대로 두고, 맨 끝에 한글 '청산방식'과 거래의 '진입시각_KST'를 더한다.
    const trigger = x => x ? [x.label, csvTime(x.time), csvTime(x.availableAt)] : ['', '', ''];
    const rows = [['구분', '종목', '시각_KST', '행동', '진입가', '청산가', '수량', '진입수수료', '청산수수료', '순손익_USDT', '판단이유_처리', '교차기준', '체결시각정밀도','청산모드','반대신호','반대신호_표시봉_KST','반대신호_확인_KST','청산방식','진입시각_KST']];
    s.decisions.forEach((d, i) => { const text = decisionText(d, i); rows.push(['판단', s.ticker, csvTime(d.time), text.action, '', '', '', '', '', '', text.reason, mapping, '봉 마감', mode, ...trigger(d.trigger), modeName, '']); });
    s.trades.forEach(t => rows.push(['완료거래', s.ticker, csvTime(t.exitAt), csvSide(t.side), csvPrice(t.entryPrice), csvPrice(t.exitPrice), csvNum(t.qty, 6), csvNum(t.entryFee, 4), csvNum(t.exitFee, 4), csvNum(t.netPnl), tradeReason(t) + (t.ambiguous ? ' / 익절·손절 같은 봉: 손절 우선' : ''), mapping, precisionNames[t.exitTimePrecision] || t.exitTimePrecision, mode, ...trigger(t.exitTrigger), modeName, csvTime(t.entryAt)]));
    if (s.position) { const p = s.position; rows.push(['미청산', s.ticker, csvTime(p.entryAt), csvSide(p.side), csvPrice(p.entryPrice), '', csvNum(p.qty, 6), csvNum(p.entryFee, 4), '', '', '평가손익 ' + fmt(p.unrealizedPnl) + ' USDT(진입 수수료 빼기 전) / 실제 청산 아님', mapping, precisionNames.open, mode, '', '', '', modeName, csvTime(p.entryAt)]); }
    rows.push(['요약', s.ticker, csvTime(s.cutoff), '', '', '', '', '', '', csvNum(s.stats.netPnl), '평가자산 ' + fmt(s.equity) + ' USDT / 초기 ' + fmt(s.settings.initialBalance) + ' USDT / 증거금 ' + s.settings.allocationPct + '% / 레버리지 ' + s.settings.leverage + '배 / ' + costText(s.settings) + ' / ' + bracketText(s.settings), mapping, '', mode, '', '', '', modeName, '']);
    downloadRows(rows, '지표모의연습_' + s.ticker + '_' + (exitShort[mode] ? exitShort[mode] + '_' : '') + mode + '_' + kst(s.cutoff, true).replace(/[- :]/g, '') + '.csv', $('export'), '판단·완료 거래·미청산 상태·계산 가정을 CSV로 저장했습니다.');
  }
  function signalLabel(event) {
    if (event.source === 'ut_signal2' && (event.signal === 'L' || event.signal === 'S')) return { label: event.signal === 'L' ? 'LL' : 'SS', long: event.signal === 'L', lane: 0 };
    if (event.source === 'analysis_signal' && /^(L|S)[23]$/.test(event.signal)) return { label: event.signal, long: event.signal[0] === 'L', lane: 1 };
    if (event.source === 'rls_signal' && ['LRL', 'SRS'].includes(event.signal)) return { label: event.signal === 'LRL' ? 'RL' : 'RS', long: event.signal === 'LRL', lane: 1, cross: true };
    if ($('cross-mapping').value === 'cross' && event.source === 'cross_signal' && ['L 진입', 'S 진입'].includes(event.signal)) return { label: event.signal === 'L 진입' ? '×L' : '×S', long: event.signal === 'L 진입', lane: 1, cross: true };
    return null;
  }
  function stepLabel(step) {
    return step.labels.map(label => step.role === 'smart' ? label === 'L' ? 'LL' : label === 'S' ? 'SS' : label : label === 'SRS' ? 'RS' : label === 'LRL' ? 'RL' : label).join(' · ');
  }
  function chartSteps() {
    if (!state.snapshot || !state.scenarios) return [];
    const s = state.snapshot, cases = state.scenarios.cases;
    const selected = state.mode === 'quiz' ? cases[state.caseIndex] : cases.filter(item => item.availableAt <= s.cutoff).slice(-1)[0];
    if (!selected || selected.availableAt > s.cutoff) return [];
    return selected.steps.filter(step => step.availableAt <= s.cutoff).slice().sort((a,b) => a.time-b.time || ({smart:0,premium:1,cross:2}[a.role]-{smart:0,premium:1,cross:2}[b.role])).map((step,index) => ({ ...step, number:index+1, label:stepLabel(step), direction:selected.direction, color:step.role === 'cross' ? '#f0cd79' : selected.direction === 'long' ? '#90d0a5' : '#ef9990' }));
  }
  function focusBars(snapshot, steps) {
    let count = Number($('zoom').value) || 96;
    if (state.fitCase && steps.length) {
      const first = snapshot.bars.findIndex(bar => bar.time >= Math.min(...steps.map(step => step.time)));
      if (first >= 0) count = Math.max(24, snapshot.bars.length - first + 5);
      $('zoom').max = Math.max(744, count); $('zoom').value = count;
    }
    $('zoom-value').textContent = count + '봉';
    return snapshot.bars.slice(-count);
  }
  function queueDraw() { if (state.chartFrame) return; state.chartFrame = requestAnimationFrame(() => { state.chartFrame = 0; drawChart(); }); }
  function drawChart() {
    const canvas = $('chart'), wrap = $('chart-wrap'), ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = wrap.getBoundingClientRect(), width = Math.max(240, rect.width), height = rect.height || 485, dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
    const s = state.snapshot;
    if (!s) { $('chart-signal-key').innerHTML=''; $('focus-case').disabled=true; return; }
    const steps = chartSteps(), bars = focusBars(s, steps); if (!bars.length) return;
    const mobile = width < 500, left = mobile ? 13 : 22, top = steps.length ? 112 : 30, bottom = height - 39;
    const firstTime = bars[0].time, lastTime = bars[bars.length - 1].time, span = Math.max(HOUR, lastTime - firstTime + HOUR);
    let low = Math.min(...bars.map(b => b.l)), high = Math.max(...bars.map(b => b.h));
    if ($('show-goya').checked) bars.forEach(b => { if (Number.isFinite(b.goya) && b.goya > 0) { low = Math.min(low, b.goya); high = Math.max(high, b.goya); } });
    const pad = Math.max((high - low) * .23, high * .004); low -= pad; high += pad;
    ctx.font = uiPx(mobile ? 10 : 11) + 'px "Malgun Gothic",sans-serif';
    const priceMeasure = typeof ctx.measureText === 'function' ? ctx.measureText(price(high)) : null;
    const right = Math.max(mobile ? 66 : 90, Math.ceil(((priceMeasure && priceMeasure.width) || 0) + 16)), plotW = width - left - right;
    const x = time => left + ((time - firstTime + HOUR / 2) / span) * plotW;
    const y = value => bottom - (value - low) / (high - low) * (bottom - top);
    state.chart = { bars, x, y, left, right, firstTime, span, width, height, plotW, bottom, steps };
    $('focus-case').disabled = !steps.length;
    $('focus-case').setAttribute('aria-pressed', String(!!state.fitCase));
    $('chart-signal-key').innerHTML = steps.map(step => '<div class="signal-key-item"><b style="color:'+step.color+'">'+step.number+' · '+escape(step.label)+(step.role==='cross'?' · 교차':'')+'</b><span>표시 봉 '+kst(step.time)+'&nbsp;KST</span><span>확인 '+kst(step.availableAt)+'&nbsp;KST</span></div>').join('') || '<p>완성 조건이 나타나면 해당 세 신호 위치를 함께 강조합니다.</p>';
    canvas.setAttribute('aria-label', '실제 1시간봉. '+(steps.length ? steps.map(step => step.number+'번 '+step.label+' 표시 봉 '+kst(step.time,true)+' KST, 확인 '+kst(step.availableAt,true)+' KST').join('. ') : '확인한 과거 신호를 표시합니다.')+'. 미래 신호는 숨겨져 있습니다.');
    ctx.font = uiPx(mobile ? 10 : 11) + 'px "Malgun Gothic",sans-serif'; ctx.textBaseline = 'middle';
    for (let tick = 0; tick <= 5; tick++) {
      const value = low + (high - low) * tick / 5, yy = y(value);
      ctx.strokeStyle = '#2a404d'; ctx.lineWidth = .8; ctx.beginPath(); ctx.moveTo(left, yy); ctx.lineTo(width - right, yy); ctx.stroke();
      ctx.fillStyle = '#9eb3bd'; ctx.textAlign = 'left'; ctx.fillText(price(value), width - right + 8, yy, right-10);
    }
    // 시간축 글자: 실제 글자 폭으로 겹침을 확인해 눈금 수를 줄인다(큰 글씨·좁은 차트에서 글자가 붙지 않게).
    const measured = typeof ctx.measureText === 'function' ? ctx.measureText('00-00 00:00') : null, labelW = (measured && measured.width) || 72, GAP = 16;
    const box = (xx, al) => al === 'left' ? [xx, xx + labelW] : al === 'right' ? [xx - labelW, xx] : [xx - labelW / 2, xx + labelW / 2];
    const layout = div => Array.from({ length: div + 1 }, (_, t) => { const b = bars[Math.round((bars.length - 1) * t / div)], al = t === 0 ? 'left' : t === div ? 'right' : 'center'; return { b, xx: x(b.time), al }; });
    const fits = ts => ts.every((tk, i) => !i || box(tk.xx, tk.al)[0] - box(ts[i - 1].xx, ts[i - 1].al)[1] >= GAP);
    let division = Math.min(mobile ? 2 : 4, Math.max(1, Math.floor(plotW / (labelW * 1.5 + GAP))));
    while (division > 1 && !fits(layout(division))) division--;
    let ticks = layout(division); if (!fits(ticks)) ticks = [ticks[ticks.length - 1]];
    ticks.forEach(tk => {
      ctx.strokeStyle = '#243b47'; ctx.beginPath(); ctx.moveTo(tk.xx, top); ctx.lineTo(tk.xx, bottom); ctx.stroke();
      ctx.fillStyle = '#9eb3bd'; ctx.textAlign = tk.al; ctx.fillText(kst(tk.b.time), tk.xx, height - 15);
    });
    const candleW = Math.max(1, Math.min(9, plotW * HOUR / span * .65));
    bars.forEach((b, i) => {
      const xx = x(b.time), color = b.c >= b.o ? '#ef6966' : '#65aaf0'; ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(xx, y(b.h)); ctx.lineTo(xx, y(b.l)); ctx.stroke(); ctx.fillRect(xx - candleW / 2, Math.min(y(b.o), y(b.c)), candleW, Math.max(1, Math.abs(y(b.o) - y(b.c))));
      if (i && b.time - bars[i - 1].time > HOUR) { const gapX = x((b.time + bars[i - 1].time) / 2); ctx.fillStyle = '#ccb789'; ctx.save(); ctx.translate(gapX, top + 12); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'right'; ctx.fillText('원본 봉 누락', 0, 0); ctx.restore(); }
    });
    if ($('show-goya').checked) { ctx.strokeStyle = '#df7db4'; ctx.lineWidth = 1.6; ctx.beginPath(); let pen = false; bars.forEach((b, i) => { if (!Number.isFinite(b.goya) || b.goya <= 0) { pen = false; return; } const xx = x(b.time), yy = y(b.goya); if (pen && (!i || b.time - bars[i - 1].time === HOUR)) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); pen = true; }); ctx.stroke(); }
    const latest = bars[bars.length - 1], currentY = y(latest.c);
    ctx.strokeStyle = '#84a9b3'; ctx.setLineDash([3,4]); ctx.beginPath(); ctx.moveTo(left, currentY); ctx.lineTo(width-right,currentY); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#dce9e9'; ctx.fillRect(width-right+3,currentY-9,right-6,18); ctx.fillStyle = '#172934'; ctx.textAlign='left'; ctx.font='bold '+uiPx(mobile?10:11)+'px "Malgun Gothic",sans-serif'; ctx.fillText(price(latest.c),width-right+7,currentY,right-10);
    const barMap = new Map(bars.map(bar => [bar.time,bar])), placed = [];
    function anchor(mark, bar) {
      const yy = mark.cross ? y(bar.h)-8 : mark.long ? y(bar.l)+8 : y(bar.h)-8;
      ctx.fillStyle = mark.color || (mark.cross ? '#f0cd79' : mark.long ? '#90d0a5' : '#ef9990');
      ctx.beginPath();
      if (mark.cross) { ctx.moveTo(x(bar.time),yy-5); ctx.lineTo(x(bar.time)+5,yy); ctx.lineTo(x(bar.time),yy+5); ctx.lineTo(x(bar.time)-5,yy); }
      else { const d = mark.long ? 1 : -1; ctx.moveTo(x(bar.time),yy-d*5); ctx.lineTo(x(bar.time)-5,yy+d*4); ctx.lineTo(x(bar.time)+5,yy+d*4); }
      ctx.closePath(); ctx.fill(); return yy;
    }
    const seen = new Set();
    s.signals.forEach(event => {
      if (event.group !== 'none' || !barMap.has(event.time)) return;
      const mark = signalLabel(event); if (!mark || (mark.lane === 0 && !$('show-smart').checked) || (mark.lane === 1 && !$('show-premium').checked)) return;
      const key = event.time+':'+mark.label; if (seen.has(key)) return; seen.add(key);
      if (steps.some(step => step.time===event.time && step.label.split(' · ').includes(mark.label))) return;
      const labelPx = uiPx(10), bar = barMap.get(event.time), xx = x(event.time), anchorY = anchor(mark,bar), w = mark.label.length*labelPx*0.72+10;
      const labelX = Math.max(left+w/2,Math.min(width-right-w/2,xx)), direction = mark.cross || !mark.long ? -1 : 1;
      let yy = Math.max(top+10,Math.min(bottom-10,anchorY+direction*14)), clear = false;
      for(let lane=0;lane<10;lane++) {
        if(!placed.some(box=>Math.abs(box.x-labelX)<(box.w+w)/2+2 && Math.abs(box.y-yy)<16)) {clear=true;break;}
        yy += direction*17; if(yy<top+9 || yy>bottom-9)break;
      }
      if (!clear) return; // Dense month views keep every anchor; zoom/hover exposes overlapping labels.
      placed.push({x:labelX,y:yy,w});
      const color = mark.cross ? '#f0cd79' : mark.long ? '#90d0a5' : '#ef9990';
      ctx.strokeStyle=color;ctx.globalAlpha=.5;ctx.beginPath();ctx.moveTo(xx,anchorY);ctx.lineTo(labelX,yy);ctx.stroke();ctx.globalAlpha=1;
      ctx.fillStyle='#172934';ctx.fillRect(labelX-w/2,yy-labelPx*0.7,w,labelPx*1.4);ctx.fillStyle=color;ctx.font='bold '+labelPx+'px "Malgun Gothic",sans-serif';ctx.textAlign='center';ctx.fillText(mark.label,labelX,yy);
    });
    steps.forEach((step,index) => {
      const gap=7,cardW=(width-left-12-gap*2)/3,cardX=left+index*(cardW+gap),cardY=8,cardH=72;
      ctx.fillStyle='#203743';ctx.fillRect(cardX,cardY,cardW,cardH);ctx.strokeStyle=step.color;ctx.lineWidth=1;ctx.strokeRect(cardX,cardY,cardW,cardH);
      ctx.fillStyle=step.color;ctx.font='bold '+uiPx(mobile?12:13)+'px "Malgun Gothic",sans-serif';ctx.textAlign='left';ctx.fillText(step.number+'  '+step.label,cardX+8,cardY+17,cardW-14);
      ctx.fillStyle='#d1dce0';ctx.font=uiPx(mobile?9:10)+'px "Malgun Gothic",sans-serif';
      const stamp=kst(step.time).split(' ');
      // 휴대폰 카드도 '05:00 봉'처럼 봉이 시작한 시각임을 적는다(오른쪽 위 시각·질문 카드 '확인'은 봉이 끝난 시각).
      if (mobile) { ctx.fillText(stamp[0],cardX+8,cardY+39,cardW-14); ctx.fillText(barMap.has(step.time)?stamp[1]+' 봉':'범위 밖',cardX+8,cardY+58,cardW-14); }
      else ctx.fillText(kst(step.time),cardX+8,cardY+39,cardW-14);
      const visible=barMap.has(step.time);
      if (!mobile) ctx.fillStyle='#a1b8be', ctx.fillText(visible ? (step.role==='cross'?'교차 신호 · 표시 봉':step.role==='smart'?'Smart · 표시 봉':'Premium · 표시 봉') : '확대 범위 밖 · 함께 보기',cardX+8,cardY+58,cardW-14);
      if (!visible) return;
      const b=barMap.get(step.time), xx=x(step.time), mark={cross:step.role==='cross',long:step.direction==='long',color:step.color};
      const yy=anchor(mark,b);
      ctx.strokeStyle=step.color;ctx.globalAlpha=.7;ctx.lineWidth=1;ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(cardX+cardW/2,cardY+cardH);ctx.lineTo(xx,top-12);ctx.lineTo(xx,yy);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;
      const circleY=Math.max(top+10,Math.min(bottom-11, yy + (mark.long&&!mark.cross ? 17 : -17))), circleX=Math.max(left+10,Math.min(width-right-10,xx));
      ctx.fillStyle=step.color;ctx.beginPath();ctx.arc(circleX,circleY,11,0,Math.PI*2);ctx.fill();ctx.fillStyle='#132732';ctx.font='bold '+uiPx(11)+'px "Malgun Gothic",sans-serif';ctx.textAlign='center';ctx.fillText(String(step.number),circleX,circleY);
    });
    if (state.hover != null && bars[state.hover]) {
      const b = bars[state.hover], xx = x(b.time); ctx.strokeStyle = '#a8bdc7'; ctx.setLineDash([3,3]); ctx.beginPath(); ctx.moveTo(xx, top); ctx.lineTo(xx, bottom); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#cddcdf'; ctx.beginPath(); ctx.arc(xx, y(b.c), 3, 0, Math.PI*2); ctx.fill();
    }
  }
  function updateReadout(bar) {
    if (!bar) return;
    const labels = state.snapshot ? [...new Set(state.snapshot.signals.filter(event=>event.group==='none'&&event.time===bar.time).map(event=>signalLabel(event)).filter(Boolean).map(mark=>mark.label))] : [];
    $('ohlc').textContent = kst(bar.time) + ' 시작 봉 · 시가 ' + price(bar.o) + ' / 고가 ' + price(bar.h) + ' / 저가 ' + price(bar.l) + ' / 종가 ' + price(bar.c) + (labels.length ? ' · 지표 '+labels.join(' · ')+' (확인 '+kst(bar.time+HOUR)+' KST)' : ' · 해당 봉 지표 없음');
  }
  function hover(event) {
    if (!state.chart) return; const chart = state.chart, rect = $('chart').getBoundingClientRect(), point = event.clientX - rect.left;
    const time = chart.firstTime - HOUR / 2 + (point - chart.left) / chart.plotW * chart.span;
    let best = 0; chart.bars.forEach((b,i) => { if (Math.abs(b.time-time)<Math.abs(chart.bars[best].time-time)) best=i; });
    state.hover = best; updateReadout(chart.bars[best]); queueDraw();
  }
  function setupHeightMessages() {
    const params = new URLSearchParams(location.search);
    if (params.get('embed') === '1') document.body.classList.add('embedded');
    // Font size follows the parent app setting ("가" button): URL param first, then the shared cb:settings key, then live messages.
    let font = params.get('font');
    if (!font) { try { font = JSON.parse(localStorage.getItem('cb:settings') || '{}').font; } catch (_) { font = null; } }
    applyFontSetting(font || 'L');
    window.addEventListener('message', (event) => {
      if (window.parent === window || event.source !== window.parent || !event.data || event.data.type !== 'cb-font') return;
      if (location.protocol !== 'file:' && event.origin !== location.origin) return;
      applyFontSetting(event.data.font);
    });
    let last = 0, queued = false;
    const send = () => { if (queued) return; queued = true; setTimeout(() => { queued = false; const height = Math.ceil(document.querySelector('.shell').getBoundingClientRect().height); if (height !== last) { last = height; if (window.parent !== window) window.parent.postMessage({ type: 'goya-sim-height', height }, '*'); } }, 0); };
    if (window.ResizeObserver) new ResizeObserver(send).observe(document.querySelector('.shell'));
    window.addEventListener('resize', send); send();
  }
  function boot() {
    setupHeightMessages();
    const catalog = window.GOYA_SIM_CATALOG;
    if (!catalog || !catalog.symbols || !catalog.symbols.length || !window.GoyaSimEngine || !window.GoyaScenarios) { notify('실행 파일 또는 데이터 목록이 없습니다. 전체 learning-sim 폴더를 함께 열어 주세요.', 'error'); return; }
    try { state.saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (_) {}
    // 예전 빌드가 STORE_KEY 에 넣어 둔 한 달 결과는 MONTH_KEY 로 옮긴다. STORE_KEY 는 연습 요약만 담아야 부모 앱 홈 카드가 판단 횟수를 읽는다.
    if (state.saved && state.saved.mode === 'monthly') { try { if (!localStorage.getItem(MONTH_KEY)) localStorage.setItem(MONTH_KEY, JSON.stringify(state.saved)); localStorage.removeItem(STORE_KEY); } catch (_) {} state.saved = null; }
    let run = null, warning = '';
    try { run = readSavedRun(); } catch (_) { removeSavedRun(); warning = '이전 연습 기록을 읽지 못해 지우고 새로 시작합니다.'; }
    if (run) { $('cross-mapping').value = run.mapping; state.mode = run.mode; }
    state.ticker = run ? run.ticker : defaultTicker();
    updateTickerOptions(); updateModeView();
    $('ticker').value = state.ticker; $('ticker').disabled = false;
    $('data-period').textContent = kst(Date.parse(catalog.windowStartUTC) / 1000, true) + ' ~ ' + kst(Date.parse(catalog.anchorUTC) / 1000, true) + ' KST 기준 · ' + catalog.symbols.length + '종목. 기준 시각까지 마감된 시간봉만 포함합니다.';
    $('ticker').addEventListener('change', () => { discardRun(); loadTicker($('ticker').value); });
    ['quiz','month','manual'].forEach(mode => $('mode-'+mode).addEventListener('click',()=>changeMode(mode)));
    $('new-run').addEventListener('click', () => newRun());
    $('next-case').addEventListener('click',goNextCase);
    $('next-ticker').addEventListener('click',goNextTicker);
    $('finish-month').addEventListener('click',()=>{stop();if(state.data)advance(state.data.bars.length);});
    $('run-month').addEventListener('click',runMonth);
    $('export-month').addEventListener('click',exportMonth);
    ['initial-balance','leverage','allocation','take-profit','stop-loss','exit-mode'].forEach(id=>$(id).addEventListener('change',()=>{stop();clearMonth();notify('설정이 바뀌었습니다. '+(state.mode==='month'?'한 달 시뮬레이션 실행':'이 조건부터 새 계좌로 / 새 연습 시작')+'을 누르면 새 설정을 적용합니다.');}));
    $('exit-comparison').addEventListener('click',event=>{ const button = event.target.closest('[data-exit-mode]'); if (button && !button.disabled) showComparisonMode(button.dataset.exitMode); });
    ['long','short','close','wait'].forEach(action => $(action).addEventListener('click', () => submit(action)));
    $('next-hour').addEventListener('click', () => { stop(); advance(1, 'playback'); revealZone('playback'); }); $('next-six').addEventListener('click', () => { stop(); advance(6, 'playback'); revealZone('playback'); });
    $('play').addEventListener('click', () => { if (state.timer) { stop(); return; } if (!state.snapshot || state.snapshot.finished) return; $('play').textContent = 'Ⅱ 일시 정지'; $('play').setAttribute('aria-pressed','true'); state.timer = setInterval(() => advance(1, 'playback'), 1200); });
    $('cross-mapping').addEventListener('change', () => {
      stop(); discardRun(); state.quizRun=null; updateTickerOptions(); clearMonth();
      if (!state.data) { loadTicker(state.ticker); return; }
      analyzeCases();
      if (state.mode==='quiz') startCase(0);
      else if (state.mode==='manual') newRun(state.snapshot ? state.snapshot.index : undefined);
      else { state.engine=null; state.snapshot=null; }
    });
    ['show-smart','show-premium','show-goya'].forEach(id => $(id).addEventListener('change', queueDraw));
    $('zoom').addEventListener('input', () => { state.fitCase=false; $('zoom-value').textContent = $('zoom').value + '봉'; state.hover=null; if(state.snapshot) updateReadout(state.snapshot.current); queueDraw(); });
    $('focus-case').addEventListener('click', () => { state.fitCase=true; state.hover=null; drawChart(); });
    $('chart').addEventListener('pointermove', hover); $('chart').addEventListener('pointerleave', () => { state.hover=null; if(state.snapshot) updateReadout(state.snapshot.current); queueDraw(); });
    $('export').addEventListener('click', exportCsv);
    ['journal','trades'].forEach(name => $('tab-'+name).addEventListener('click', () => { ['journal','trades'].forEach(other => { const selected=other===name; $('tab-'+other).classList.toggle('active',selected); $('tab-'+other).setAttribute('aria-selected',String(selected)); $(other+'-panel').hidden=!selected; }); queueScrollCheck(); }));
    if(window.ResizeObserver) new ResizeObserver(queueDraw).observe($('chart-wrap')); else window.addEventListener('resize',queueDraw);
    window.addEventListener('resize',drawEquity);
    // 화면을 돌리거나 폭이 바뀌면 '오른쪽/아래·왼쪽/위쪽' 안내와 표 옆 밀기 안내를 다시 맞춘다.
    window.addEventListener('resize',() => { renderNotes(); if (state.snapshot && state.mode !== 'month') renderPending(state.snapshot); queueScrollCheck(); });
    window.addEventListener('pagehide', stop); document.addEventListener('visibilitychange', () => { if(document.hidden)stop(); });
    loadTicker(state.ticker, { restore: run, warning });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
