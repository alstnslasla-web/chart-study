/* Closed-hour playback frames. All account arithmetic belongs to GoyaSimEngine. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.GoyaMonthTimeline = factory(root.GoyaSimEngine);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Engine) {
  'use strict';
  var HOUR = 3600, VISIBLE_BARS = 120;
  var PRIORITY = { entry: 0, exit: 1, signal: 2, order: 3 };
  var EXIT_LABELS = { manual: '수동 청산', opposite_signal: '반대 신호 청산', take_profit: '익절', stop_loss: '손절', liquidation: '모의 강제청산' };

  function signalLabel(signal) {
    if (signal.source === 'ut_signal2') return signal.signal === 'L' ? 'LL' : signal.signal === 'S' ? 'SS' : signal.signal;
    if (signal.source === 'rls_signal') return signal.signal === 'LRL' ? 'RL' : signal.signal === 'SRS' ? 'RS' : signal.signal;
    return signal.signal;
  }
  function signalSide(signal) {
    if (/^(L|LRL)/.test(signal.signal)) return 'long';
    if (/^(S|SRS)/.test(signal.signal)) return 'short';
    return null;
  }
  function collect(options) {
    if (!Engine || typeof Engine.runStrategy !== 'function') throw new Error('모의 체결 엔진을 먼저 불러와 주세요.');
    var frames = [], enteredIds = new Set(), priorTrades = 0, priorSignals = 0, priorDecisions = 0;
    var previousPosition = null, eventId = 0;
    function onFrame(snapshot) {
      var events = [], newTrades = snapshot.trades.slice(priorTrades);
      function add(event) { event.id = ++eventId; events.push(event); }
      function entered(position) {
        if (!position || enteredIds.has(position.id)) return;
        enteredIds.add(position.id);
        add({ type: 'entry', time: position.entryAt, barTime: position.entryAt, side: position.side,
          price: position.entryPrice, tradeId: position.id, fee: position.entryFee, precision: 'open',
          label: position.side === 'long' ? '롱 진입 · 매수' : '숏 진입 · 매도' });
      }
      // A trade can open and hit TP/SL within one hour, leaving no open position.
      newTrades.forEach(function (trade) {
        entered(trade);
        add({ type: 'exit', time: trade.exitAt, barTime: trade.exitBarTime, side: trade.side,
          price: trade.exitPrice, tradeId: trade.id, fee: trade.exitFee, netPnl: trade.netPnl,
          precision: trade.exitTimePrecision, reason: trade.reason, ambiguous: trade.ambiguous,
          label: (trade.side === 'long' ? '롱 청산 · 매도 · ' : '숏 청산 · 매수 · ') + (EXIT_LABELS[trade.reason] || '청산') });
      });
      entered(snapshot.position);
      snapshot.signals.slice(priorSignals).forEach(function (signal) {
        add({ type: 'signal', time: signal.time + HOUR, availableAt: signal.time + HOUR,
          barTime: signal.time, side: signalSide(signal), label: signalLabel(signal), signal: signal });
      });
      snapshot.decisions.slice(priorDecisions).forEach(function (decision) {
        if (decision.status !== 'queued') return;
        var closing = decision.action === 'close';
        var held = snapshot.position || previousPosition;
        add({ type: 'order', time: decision.time, availableAt: decision.time,
          side: closing ? (held ? held.side : null) : decision.action,
          tradeId: closing && held ? held.id : null,
          action: decision.action, trigger: decision.trigger || null,
          label: closing ? '청산 예약 · 다음 봉 시가' : (decision.action === 'long' ? '롱 진입 예약 · 다음 봉 시가' : '숏 진입 예약 · 다음 봉 시가') });
      });
      events.sort(function (a, b) { return a.time - b.time || PRIORITY[a.type] - PRIORITY[b.type] || a.id - b.id; });
      var bars = snapshot.bars.slice(-VISIBLE_BARS), firstTime = bars[0].time;
      frames.push({ ticker: snapshot.ticker, index: snapshot.index, cutoff: snapshot.cutoff,
        current: snapshot.current, bars: bars,
        signals: snapshot.signals.filter(function (signal) { return signal.time >= firstTime && signal.time + HOUR <= snapshot.cutoff; }),
        position: snapshot.position, pending: snapshot.pending, trades: snapshot.trades,
        stats: snapshot.stats, equity: snapshot.equity, cash: snapshot.cash,
        finished: snapshot.finished, finishReason: snapshot.finishReason,
        events: events, settings: snapshot.settings });
      priorTrades = snapshot.trades.length;
      priorSignals = snapshot.signals.length;
      priorDecisions = snapshot.decisions.length;
      previousPosition = snapshot.position;
    }
    var result = Engine.runStrategy(Object.assign({}, options || {}, { onFrame: onFrame }));
    return { result: result, frames: frames };
  }
  return Object.freeze({ collect: collect, visibleBars: VISIBLE_BARS });
});
