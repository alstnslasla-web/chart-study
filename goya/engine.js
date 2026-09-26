/* GOYA EX research-only deterministic candle replay. No network or real orders. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GoyaSimEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var HOUR = 3600;
  var DEFAULTS = Object.freeze({ initialBalance: 10000, allocationPct: 10, leverage: 1,
    feeBps: 4, slippageBps: 2, takeProfitPct: 0, stopLossPct: 0, exitMode: 'opposite_smart' });
  var EXIT_MODES = ['opposite_smart', 'opposite_complete', 'tp_sl'];
  var LIMITS = { initialBalance: [1, 1e12], allocationPct: [0.01, 100], leverage: [1, 10],
    feeBps: [0, 1000], slippageBps: [0, 1000], takeProfitPct: [0, 99.99], stopLossPct: [0, 99.99] };

  function fail(code, message) { var e = new Error(message); e.code = code; throw e; }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
  function validateSettings(input) {
    var result = Object.assign({}, DEFAULTS, input || {});
    Object.keys(result).forEach(function (key) {
      if (key === 'exitMode') {
        if (EXIT_MODES.indexOf(result[key]) < 0) fail('INVALID_SETTINGS', '지원하지 않는 포지션 정리 방식입니다.');
        return;
      }
      if (!Object.prototype.hasOwnProperty.call(LIMITS, key)) fail('INVALID_SETTINGS', '알 수 없는 설정: ' + key);
      var range = LIMITS[key];
      if (!finite(result[key]) || result[key] < range[0] || result[key] > range[1])
        fail('INVALID_SETTINGS', key + ' 설정은 ' + range[0] + ' ~ ' + range[1] + ' 범위의 숫자여야 합니다.');
    });
    return result;
  }
  // Order sizing shared by the paper fill and the pre-order quote, so the screen shows exactly what the fill will use.
  function sizing(cfg, cash) {
    var margin = Math.min(cash * cfg.allocationPct / 100, cash / (1 + cfg.leverage * cfg.feeBps / 10000));
    var notional = margin * cfg.leverage, entryFee = notional * cfg.feeBps / 10000;
    return { margin: margin, notional: notional, entryFee: entryFee, leverage: cfg.leverage, cashAfter: cash - margin - entryFee };
  }
  function quoteOrder(settings, cash) {
    var cfg = validateSettings(settings);
    if (!finite(cash) || cash <= 0) fail('NO_CASH', '사용할 모의 자금이 없습니다.');
    return sizing(cfg, cash);
  }
  function completionRows(items) {
    if (!Array.isArray(items)) fail('INVALID_COMPLETIONS', '전략 완성 신호 배열이 필요합니다.');
    return items.map(function (item, i) {
      if (!item || ['long', 'short'].indexOf(item.direction) < 0 || !finite(item.availableAt) ||
          !finite(item.completeAt) || item.completeAt < 0 || item.completeAt > item.availableAt)
        fail('INVALID_COMPLETIONS', i + '번 완성 신호의 방향 또는 가용 시각이 올바르지 않습니다.');
      return { event: clone(item), sourceIndex: i };
    }).sort(function (a, b) { return a.event.availableAt - b.event.availableAt || a.sourceIndex - b.sourceIndex; });
  }
  function create(options) {
    options = options || {};
    if (!Array.isArray(options.bars) || options.bars.length === 0) fail('INVALID_BARS', '시간봉 기록이 없습니다.');
    var bars = options.bars.map(function (bar, i) {
      var b = Object.assign({}, bar);
      if (!finite(b.time) || !Number.isInteger(b.time) || b.time < 0 ||
          !['o', 'h', 'l', 'c'].every(function (key) { return finite(b[key]) && b[key] > 0; }) ||
          b.h < Math.max(b.o, b.c) || b.l > Math.min(b.o, b.c) || b.h < b.l ||
          (i > 0 && b.time <= options.bars[i - 1].time))
        fail('INVALID_BARS', i + '번 시간봉의 시간 순서 또는 OHLC가 올바르지 않습니다.');
      return clone(b);
    });
    var events = (options.signals || []).map(function (s, i) {
      if (!s || !finite(s.time) || s.time < 0) fail('INVALID_SIGNAL', i + '번 신호의 시간이 올바르지 않습니다.');
      return { value: clone(s), order: i };
    }).sort(function (a, b) { return a.value.time - b.value.time || a.order - b.order; });
    var completions = options.completions === undefined ? [] : completionRows(options.completions);
    var archiveEnd = options.archiveEnd === undefined ? bars[bars.length - 1].time + HOUR : options.archiveEnd;
    if (!finite(archiveEnd)) fail('INVALID_ARCHIVE_END', '기록 기준 시각은 초 단위 숫자여야 합니다.');
    var lastIndex = bars.length - 1;
    while (lastIndex >= 0 && bars[lastIndex].time + HOUR > archiveEnd) lastIndex--;
    if (lastIndex < 0) fail('NO_CLOSED_BARS', '기록 기준 시각까지 마감된 시간봉이 없습니다.');
    var ticker = String(options.ticker || 'UNKNOWN');
    var settings, index, cash, position, pending, trades, decisions, warnings, finished, finishReason, tradeId, equityCurve;

    function cutoff() { return bars[index].time + HOUR; }
    function equity() { return cash + (position ? Math.max(0, position.margin + pnl(position, bars[index].c)) : 0); }
    function pnl(p, price) { return (price - p.entryPrice) * p.qty * (p.side === 'long' ? 1 : -1); }
    function warn(code, message, extra) {
      if (!warnings.some(function (w) { return w.code === code; }))
        warnings.push(Object.assign({ code: code, message: message }, extra || {}));
    }
    function finishIfEnd() {
      if (index >= lastIndex) {
        cancelPending('archive_end');
        finished = true; finishReason = 'archive_end';
        if (position) warn('OPEN_POSITION_AT_END', '기록 끝의 미청산 포지션은 마지막 종가로 평가합니다. 실제 청산이나 청산 수수료를 가정하지 않습니다.');
      }
    }
    function markEquity() { equityCurve.push({ time: cutoff(), equity: equity() }); }
    function snapshot() {
      var current = bars[index], pos = position ? clone(position) : null;
      if (pos) {
        pos.markPrice = current.c; pos.unrealizedPnl = pnl(position, current.c);
        pos.value = Math.max(0, pos.margin + pos.unrealizedPnl);
      }
      var realized = trades.reduce(function (sum, t) { return sum + t.netPnl; }, 0);
      var fees = trades.reduce(function (sum, t) { return sum + t.fees; }, 0) + (position ? position.entryFee : 0);
      var wins = trades.filter(function (t) { return t.netPnl > 0; }).length;
      var losses = trades.filter(function (t) { return t.netPnl < 0; }).length;
      var peak = settings.initialBalance, drawdown = 0;
      equityCurve.forEach(function (point) {
        peak = Math.max(peak, point.equity);
        if (peak > 0) drawdown = Math.max(drawdown, (peak - point.equity) / peak * 100);
      });
      return clone({ ticker: ticker, index: index, cutoff: cutoff(), bars: bars.slice(0, index + 1),
        signals: events.filter(function (e) { return e.value.time + HOUR <= cutoff(); }).map(function (e) { return e.value; }),
        current: current, equity: equity(), cash: cash, position: pos, pending: pending,
        trades: trades, decisions: decisions, settings: settings, finished: finished, finishReason: finishReason,
        warnings: warnings, stats: { realizedPnl: realized, unrealizedPnl: pos ? pos.unrealizedPnl : 0,
          unrealizedNetPnl: pos ? pos.unrealizedPnl - pos.entryFee : 0, openEntryFees: pos ? pos.entryFee : 0,
          netPnl: equity() - settings.initialBalance, returnPct: (equity() / settings.initialBalance - 1) * 100,
          fees: fees, tradeCount: trades.length, wins: wins, losses: losses,
          winRatePct: trades.length ? wins / trades.length * 100 : null, maxDrawdownPct: drawdown },
        equityCurve: equityCurve, assumptions: {
          candleSeconds: HOUR, signalAvailabilityDelaySeconds: HOUR, fills: 'next_open',
          leverage: settings.leverage, fundingModeled: false, intrabarTimeKnown: false,
          simultaneousTpSl: 'stop_first', takeProfitGap: 'limit_price',
          marginMode: 'simplified_isolated', maintenanceMarginRate: 0.005,
          maintenanceBasis: 'initial_notional', liquidationExactExchangeModel: false,
          isolatedLossCap: 'reserved_margin_excluding_paid_entry_fee',
          shortModel: 'isolated_directional_paper_pnl', gapPolicy: 'freeze_before_gap',
          exitMode: settings.exitMode, oppositeExitFill: 'next_open_after_new_visible_opposite',
          oppositeExitAutomaticReverse: false, bracketsOptionalInEveryMode: true
        } });
    }
    function reset(startIndex, nextSettings) {
      var newSettings = validateSettings(Object.assign({}, settings || options.settings || {}, nextSettings || {}));
      if (newSettings.exitMode === 'opposite_complete' && options.completions === undefined)
        fail('INVALID_COMPLETIONS', '반대 진입 조건 정리에는 완성 신호 배열이 필요합니다.');
      var newIndex = startIndex === undefined ? (options.startIndex === undefined ? 0 : options.startIndex) : startIndex;
      if (!Number.isInteger(newIndex) || newIndex < 0 || newIndex > lastIndex)
        fail('INVALID_START_INDEX', '시작 위치는 마감된 시간봉 범위 안의 정수여야 합니다.');
      settings = newSettings; index = newIndex; cash = settings.initialBalance;
      position = null; pending = null; trades = []; decisions = []; warnings = [];
      finished = false; finishReason = null; tradeId = 0; equityCurve = [];
      warn('SIMULATION_ASSUMPTIONS', '모의 거래: 다음 봉 시가 체결, 편도 수수료·불리한 슬리피지, 1~10배 격리 증거금 가정. 펀딩비·차입료·실제 호가/유동성은 계산하지 않습니다.');
      warn('SIMPLIFIED_LIQUIDATION', '강제청산은 최초 명목금액의 0.5% 유지증거금을 사용하는 단순 모형입니다. 거래소의 실제 청산 공식이 아니며, 갭 손실은 배정 증거금 한도로 제한하고 이미 낸 진입 수수료는 별도로 부담합니다.');
      warn('HISTORICAL_SIGNAL_AVAILABILITY', '과거 차트 표시는 최초 알림 발송 이력이 아닙니다. 봉 마감 이후에 보이도록 가정하며 신호의 당시 확정·재도색 여부는 검증되지 않았습니다.');
      for (var i = 1; i <= index; i++) {
        if (bars[i].time - bars[i - 1].time !== HOUR) {
          warn('VISIBLE_HISTORY_GAP', '현재까지 보이는 과거 차트에 시간봉 공백이 있습니다. 누락 봉을 보간하지 않았습니다.');
          break;
        }
      }
      markEquity(); finishIfEnd(); return snapshot();
    }
    function submit(action, note) {
      if (['long', 'short', 'close', 'wait'].indexOf(action) < 0) fail('INVALID_ACTION', '지원하지 않는 행동입니다.');
      note = note === undefined ? '' : note;
      if (typeof note !== 'string' || note.length > 300) fail('INVALID_NOTE', '판단 이유는 300자 이내의 글이어야 합니다.');
      note = note.trim();
      if (finished) fail('SIMULATION_FINISHED', '연습이 종료되었습니다. 새로 시작해 주세요.');
      if (action === 'wait') {
        decisions.push({ action: action, time: cutoff(), index: index, status: 'observed', note: note });
        return snapshot();
      }
      if (pending) fail('ORDER_PENDING', '다음 시가에 체결할 주문이 이미 있습니다. 한 봉 진행해 주세요.');
      if (action === 'close' && !position) fail('NO_POSITION', '청산할 포지션이 없습니다.');
      if (action !== 'close' && position) fail('POSITION_EXISTS', '포지션은 하나만 열 수 있습니다. 먼저 청산해 주세요.');
      if (action !== 'close' && cash <= 0) fail('NO_CASH', '사용할 모의 자금이 없습니다.');
      pending = { action: action, submittedAt: cutoff(), submittedIndex: index,
        expectedFillTime: cutoff(), settings: clone(settings), note: note };
      decisions.push({ action: action, time: cutoff(), index: index, status: 'queued', note: note });
      return snapshot();
    }
    function closePosition(bar, basePrice, reason, detail) {
      var p = position, exitPrice = basePrice * (1 + (p.side === 'long' ? -1 : 1) * p.settings.slippageBps / 10000);
      var exitNotional = p.qty * exitPrice, exitFee = exitNotional * p.settings.feeBps / 10000;
      var rawGross = pnl(p, exitPrice), fees = p.entryFee + exitFee;
      var rawReturn = p.margin + rawGross - exitFee;
      var isolatedLossAdjustment = rawReturn < 0 ? -rawReturn : 0;
      var gross = rawGross + isolatedLossAdjustment;
      cash += Math.max(0, rawReturn);
      var exactOpen = reason === 'manual' || reason === 'opposite_signal' || (detail && detail.gap);
      trades.push(Object.assign({}, clone(p), { exitPrice: exitPrice, exitNotional: exitNotional, exitFee: exitFee,
        grossPnl: gross, rawGrossPnl: rawGross, fees: fees, netPnl: gross - fees,
        returnPct: (gross - fees) / p.margin * 100, notionalReturnPct: (gross - fees) / p.notional * 100,
        lossCapped: isolatedLossAdjustment > 0, isolatedLossAdjustment: isolatedLossAdjustment,
        exitAt: exactOpen ? bar.time : bar.time + HOUR, exitTime: exactOpen ? bar.time : bar.time + HOUR,
        exitBarTime: bar.time, exitBarIndex: index,
        exitTimePrecision: exactOpen ? 'open' : 'bar_close_bound', reason: reason,
        ambiguous: Boolean(detail && detail.ambiguous), gapFill: Boolean(detail && detail.gap),
        baseExitPrice: basePrice, exitNote: detail && detail.note ? detail.note : '',
        exitTrigger: detail && detail.trigger ? clone(detail.trigger) : null }));
      position = null;
      if (isolatedLossAdjustment > 0) warn('ISOLATED_LOSS_CAPPED', '가격 갭/체결 비용으로 증거금을 넘는 계산 손실이 발생했습니다. 단순 격리 모형에 따라 증거금 손실 한도를 적용했으며, 거래 기록에 한도 적용 전 손익과 조정액을 남겼습니다.');
      if (cash <= 0) {
        finished = true; finishReason = 'insolvent';
        warn('INSOLVENT', '가격 급변으로 모의 잔고가 0 이하가 되어 연습을 종료했습니다.');
      }
    }
    function executePending(bar) {
      if (!pending) return;
      var order = pending; pending = null;
      if (order.action === 'close') {
        // A gap beyond the liquidation boundary still exhausts the isolated position,
        // even when a signal exit was waiting for this same opening price.
        var liquidatedAtOpen = order.reason === 'opposite_signal' &&
          (position.side === 'long' ? bar.o <= position.liquidationPrice : bar.o >= position.liquidationPrice);
        closePosition(bar, bar.o, liquidatedAtOpen ? 'liquidation' : (order.reason || 'manual'),
          { gap: liquidatedAtOpen, note: order.note, trigger: order.trigger });
        return;
      }
      var cfg = order.settings, side = order.action;
      var entryPrice = bar.o * (1 + (side === 'long' ? 1 : -1) * cfg.slippageBps / 10000);
      var size = sizing(cfg, cash), margin = size.margin, notional = size.notional, entryFee = size.entryFee;
      cash -= margin + entryFee;
      if (cash < 0 && cash > -1e-8) cash = 0;
      position = { id: ++tradeId, side: side, submittedAt: order.submittedAt, entryAt: bar.time, entryTime: bar.time,
        entryBarIndex: index, entryPrice: entryPrice, qty: notional / entryPrice, notional: notional, margin: margin,
        leverage: cfg.leverage, maintenanceMargin: notional * 0.005,
        liquidationPrice: entryPrice * (1 + (side === 'long' ? -1 : 1) * (1 / cfg.leverage - 0.005)),
        entryFee: entryFee, settings: clone(cfg), entryNote: order.note,
        takeProfit: cfg.takeProfitPct > 0 ? entryPrice * (1 + (side === 'long' ? 1 : -1) * cfg.takeProfitPct / 100) : null,
        stopLoss: cfg.stopLossPct > 0 ? entryPrice * (1 + (side === 'long' ? -1 : 1) * cfg.stopLossPct / 100) : null };
    }
    function checkBrackets(bar) {
      if (!position || finished) return;
      var p = position, long = p.side === 'long', sl = p.stopLoss, tp = p.takeProfit, liq = p.liquidationPrice;
      var gapLiquidation = long ? bar.o <= liq : bar.o >= liq;
      if (gapLiquidation) { closePosition(bar, bar.o, 'liquidation', { gap: true }); return; }
      var gapStop = sl !== null && (long ? bar.o <= sl : bar.o >= sl);
      var gapProfit = tp !== null && (long ? bar.o >= tp : bar.o <= tp);
      if (gapStop) { closePosition(bar, bar.o, 'stop_loss', { gap: true }); return; }
      if (gapProfit) { closePosition(bar, tp, 'take_profit', { gap: true }); return; }
      var hitLiquidation = long ? bar.l <= liq : bar.h >= liq;
      var hitStop = sl !== null && (long ? bar.l <= sl : bar.h >= sl);
      var hitProfit = tp !== null && (long ? bar.h >= tp : bar.l <= tp);
      var liquidationFirst = hitLiquidation && (!hitStop || (long ? liq >= sl : liq <= sl));
      if (liquidationFirst) {
        closePosition(bar, liq, 'liquidation', { ambiguous: hitProfit });
        if (hitProfit) warn('AMBIGUOUS_TP_LIQUIDATION', '한 봉에서 익절·청산선을 모두 지난 경우 봉 안 순서를 알 수 없어 불리한 청산을 먼저 계산했습니다.');
      } else if (hitStop) {
        closePosition(bar, sl, 'stop_loss', { ambiguous: hitProfit });
        if (hitProfit) warn('AMBIGUOUS_TP_SL', '한 봉에서 익절·손절 가격을 모두 지나 순서를 알 수 없는 거래는 손절 우선으로 계산했습니다.');
      } else if (hitProfit) closePosition(bar, tp, 'take_profit');
    }
    function cancelPending(reason) {
      if (!pending) return;
      decisions.push({ action: pending.action, time: cutoff(), index: index,
        status: 'cancelled', reason: reason, note: pending.note,
        orderReason: pending.reason || 'manual', trigger: pending.trigger ? clone(pending.trigger) : null });
      pending = null;
    }
    function checkOppositeExit(previousCutoff) {
      if (!position || pending || finished || settings.exitMode === 'tp_sl') return;
      var opposite = position.side === 'long' ? 'short' : 'long', now = cutoff();
      // Only a newly available event while this position is held can close it.
      // Historical signals visible before entry must never be reused.
      function isNew(availableAt) { return availableAt > previousCutoff && availableAt > position.entryAt && availableAt <= now; }
      var trigger = null;
      if (settings.exitMode === 'opposite_smart') {
        var found = events.find(function (row) {
          var s = row.value;
          return s.source === 'ut_signal2' && s.group === 'none' &&
            s.signal === (opposite === 'long' ? 'L' : 'S') && isNew(s.time + HOUR);
        });
        if (found) {
          var signal = found.value;
          trigger = { type: 'smart', direction: opposite, label: opposite === 'long' ? 'LL' : 'SS',
            time: signal.time, availableAt: signal.time + HOUR, observedAt: now,
            source: signal.source, group: signal.group, source_index: signal.source_index };
        }
      } else {
        var completed = completions.find(function (row) {
          return row.event.direction === opposite && isNew(row.event.availableAt);
        });
        if (completed) {
          var event = completed.event;
          trigger = { type: 'complete', direction: opposite, label: opposite === 'long' ? '롱 진입 조건 성립' : '숏 진입 조건 성립',
            time: event.completeAt, availableAt: event.availableAt, observedAt: now,
            completionId: event.id || null, source_index: completed.sourceIndex };
        }
      }
      if (!trigger) return;
      var note = '반대 ' + trigger.label + ' 확인 후 다음 시가에 포지션 정리';
      pending = { action: 'close', submittedAt: now, submittedIndex: index, expectedFillTime: now,
        settings: clone(settings), note: note, reason: 'opposite_signal', trigger: trigger };
      decisions.push({ action: 'close', time: now, index: index, status: 'queued', note: note,
        reason: 'opposite_signal', automatic: true, trigger: clone(trigger) });
    }
    function advance(count) {
      count = count === undefined ? 1 : count;
      if (!Number.isInteger(count) || count < 1 || count > 10000) fail('INVALID_ADVANCE', '진행 봉 수는 1 ~ 10000 사이의 정수여야 합니다.');
      if (finished) fail('SIMULATION_FINISHED', '연습이 종료되었습니다. 새로 시작해 주세요.');
      for (var i = 0; i < count && !finished; i++) {
        if (index >= lastIndex) { finishIfEnd(); break; }
        var next = bars[index + 1];
        if (next.time - bars[index].time !== HOUR) {
          cancelPending('data_gap');
          finished = true; finishReason = 'data_gap';
          warn('DATA_GAP_STOP', '다음 시간봉이 누락되어 누락 구간 직전에서 연습을 중단했습니다. 대기 주문은 취소하고 미청산 포지션은 마지막 종가로 평가합니다.', { time: cutoff() });
          break;
        }
        var previousCutoff = cutoff();
        index++;
        executePending(next); checkBrackets(next); checkOppositeExit(previousCutoff); markEquity();
        if (!finished) finishIfEnd();
      }
      return snapshot();
    }
    reset(options.startIndex, options.settings);
    return Object.freeze({ snapshot: snapshot, advance: advance, submit: submit, reset: reset });
  }
  function runStrategy(options) {
    options = options || {};
    var completions = completionRows(options.completions);
    var engine = create(options), state = engine.snapshot(), firstState = state;
    var cursor = 0, accepted = [], skipped = [];
    var startTime = state.current.time;
    function consumeVisible() {
      while (cursor < completions.length && completions[cursor].event.availableAt <= state.cutoff) {
        var item = completions[cursor++], reason = null;
        if (item.event.availableAt < startTime) reason = 'before_start';
        else if (state.finished) reason = state.finishReason === 'archive_end' ? 'end_no_next_bar' : state.finishReason;
        else if (state.pending) reason = 'order_pending';
        else if (state.position) reason = 'position_open';
        if (reason) {
          skipped.push({ sourceIndex: item.sourceIndex, completion: item.event,
            reason: reason, evaluatedAt: state.cutoff });
        } else {
          state = engine.submit(item.event.direction, '확정된 진입 조건에 따른 모의 진입');
          accepted.push({ sourceIndex: item.sourceIndex, completion: item.event,
            submittedAt: state.cutoff, submittedIndex: state.index });
        }
      }
    }
    consumeVisible();
    while (!state.finished) { state = engine.advance(); consumeVisible(); }
    while (cursor < completions.length) {
      var item = completions[cursor++];
      skipped.push({ sourceIndex: item.sourceIndex, completion: item.event,
        reason: state.finishReason === 'data_gap' ? 'after_data_gap' :
          state.finishReason === 'insolvent' ? 'after_insolvency' : 'outside_closed_archive',
        evaluatedAt: state.cutoff });
    }
    var cancelled = state.decisions.filter(function (d) { return d.status === 'cancelled'; });
    accepted.forEach(function (a) {
      var entered = state.trades.concat(state.position ? [state.position] : []).find(function (p) {
        return p.submittedAt === a.submittedAt && p.side === a.completion.direction;
      });
      a.filled = Boolean(entered); a.entryAt = entered ? entered.entryAt : null;
      a.tradeId = entered ? entered.id : null;
      a.cancelledReason = !entered && cancelled.some(function (d) { return d.time === a.submittedAt; }) ? 'data_gap' : null;
    });
    var coverage = { from: firstState.current.time, to: state.cutoff, barsProcessed: state.index - firstState.index + 1,
      requestedStartIndex: firstState.index, lastProcessedIndex: state.index,
      durationHours: (state.cutoff - firstState.current.time) / HOUR,
      archiveEnd: options.archiveEnd === undefined ? null : options.archiveEnd,
      finishedReason: state.finishReason, completeToArchive: state.finishReason === 'archive_end' };
    return clone({ mode: 'monthly_strategy', ticker: state.ticker, settings: state.settings,
      snapshot: state, trades: state.trades, equityCurve: state.equityCurve,
      summary: Object.assign({}, state.stats, { initialBalance: state.settings.initialBalance,
        finalEquity: state.equity, cash: state.cash, openPosition: state.position,
        acceptedCount: accepted.length, filledCount: accepted.filter(function (a) { return a.filled; }).length,
        skippedCount: skipped.length, forcedEndClose: false }),
      acceptedCompletions: accepted, skippedCompletions: skipped, coverage: coverage,
      warnings: state.warnings, assumptions: Object.assign({}, state.assumptions, {
        mode: 'whole_archive_backtest', entryRule: 'first_next_open_after_completion_visible',
        simultaneousCompletions: 'stable_input_order_first_when_flat', whilePositionOpen: 'skip_not_queue',
        oppositeExitBeforeEntry: true, reuseExitCompletionForEntry: false,
        endPositionPolicy: 'unrealized_mark_to_last_close_no_forced_exit'
      }) });
  }
  return Object.freeze({ create: create, runStrategy: runStrategy, defaults: DEFAULTS,
    candleSeconds: HOUR, validateSettings: validateSettings, quoteOrder: quoteOrder });
});
