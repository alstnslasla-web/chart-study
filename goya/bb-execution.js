/* Research model, not an exchange simulator. Only actual 5m/15m OHLC is accepted.
   At a 5m open use the latest 20 COMPLETED 15m closes, population SD, multiplier 2.
   Freeze three equal-notional limits and the outer-band stop when a signal becomes
   available. A limit touch fills at its limit; an already marketable limit gets
   opening improvement, with adverse slippage capped at the limit. Market exits
   pay adverse slippage. Fees are charged on every fill. Funding/liquidity/queue
   priority/borrowing/liquidation are not modeled; leverage must be exactly 1.
   Existing and new positions: fill all touched limits then stop on an entry+stop candle. This
   intentionally adverse convention avoids assuming a profitable intrabar path.
   Intrabar fills are timestamped at the bar CLOSE bound, never claimed exact.
   Opposite signals close/cancel at the first available 5m open, before additions.
   No automatic reversal or reuse of an entry signal on that same opening.
   Unfilled orders expire after 24h; filled positions keep their original stop.
   Missing 5m/15m prices stop the run; no synthetic bars or end liquidation. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GoyaBBExecution = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const FIVE = 300, FIFTEEN = 900, HOUR = 3600, DAY = 86400;
  const defaults = { initialBalance: 10000, allocationPct: 40, leverage: 1, feeBps: 4, slippageBps: 2, stopLossPct: 3 };
  const copy = value => JSON.parse(JSON.stringify(value));
  function number(value, name) { if (!Number.isFinite(value)) throw new Error(name + ' must be finite'); return value; }
  function config(input) {
    const s = Object.assign({}, defaults, input || {});
    Object.keys(defaults).forEach(key => number(s[key], key));
    if (s.leverage !== 1) throw new Error('Research execution supports leverage 1 only');
    if (s.initialBalance <= 0 || s.allocationPct <= 0 || s.allocationPct > 100 || s.feeBps < 0 || s.feeBps > 100 || s.slippageBps < 0 || s.slippageBps > 100 || s.stopLossPct <= 0 || s.stopLossPct >= 100) throw new Error('Invalid execution settings');
    return Object.assign(s, { candleSeconds: FIVE, bbSeconds: FIFTEEN, bbLength: 20, bbMultiplier: 2, installments: 3, orderExpirySeconds: DAY });
  }
  function prices(input, interval, name) {
    const list = Array.isArray(input) ? input : input && input.bars;
    if (!Array.isArray(list)) throw new Error(name + ' bars are required');
    const out = list.map(bar => ({ time: number(bar.time, name + '.time'), o: number(bar.o, name + '.o'), h: number(bar.h, name + '.h'), l: number(bar.l, name + '.l'), c: number(bar.c, name + '.c') })).sort((a, b) => a.time - b.time);
    out.forEach((b, i) => {
      if (b.time % interval !== 0 || b.l <= 0 || b.h < Math.max(b.o, b.c) || b.l > Math.min(b.o, b.c) || b.h < b.l || i && b.time === out[i - 1].time) throw new Error('Invalid/duplicate ' + name + ' candle');
    });
    return out;
  }
  function signals(input) {
    if (!Array.isArray(input)) throw new Error('Entry and exit event arrays are required');
    const seen = new Set();
    return input.map(event => {
      number(event.availableAt, 'event.availableAt');
      if (event.direction !== 'long' && event.direction !== 'short') throw new Error('Event direction must be long or short');
      return copy(event);
    }).sort((a, b) => a.availableAt - b.availableAt).filter(event => {
      const key = event.availableAt + ':' + event.direction;
      if (seen.has(key)) return false; seen.add(key); return true;
    });
  }
  function run(options) {
    options = options || {};
    const settings = config(options.settings), payload = options.payload || {}, ticker = payload.ticker || options.ticker || '';
    const five = prices(options.bars5m, FIVE, '5m'), fifteen = prices(options.bars15m, FIFTEEN, '15m');
    if (!five.length || !fifteen.length) throw new Error('Actual lower-timeframe candles are empty');
    const from = options.from === undefined ? five[0].time : number(options.from, 'from');
    const to = options.to === undefined ? five[five.length - 1].time + FIVE : number(options.to, 'to');
    if (from % FIVE || to % FIVE || to <= from) throw new Error('from/to must be aligned 5m boundaries with from < to');
    const entryEvents = signals(options.entryEvents || []).filter(e => e.availableAt >= from && e.availableAt < to);
    const exitEvents = signals(options.exitEvents || []).filter(e => e.availableAt >= from && e.availableAt < to);
    const originalSignals = (payload.signals || []).map(copy).filter(s => Number.isFinite(s.time)).sort((a, b) => a.time - b.time);
    const hourly = (payload.bars || []).filter(b => Number.isFinite(b.time)).slice().sort((a, b) => a.time - b.time);
    const feeRate = settings.feeBps / 10000, slipRate = settings.slippageBps / 10000;
    const frames = [], trades = [], equityCurve = [{ time: from, equity: settings.initialBalance }], displayedBars = [];
    const diagnostics = { entrySignals: entryEvents.length, acceptedSignals: 0, skippedBusy: 0, skippedWarmup: 0, skippedConflict: 0, skippedSameExitBar: 0, expiredLadders: 0, canceledLadders: 0, gapInvalidatedLadders: 0, ambiguousStopBars: 0, entryAndStopBars: 0, insufficientCash: 0, trancheCount: 0, gapAt: null };
    let cash = settings.initialBalance, position = null, ladder = null, realizedPnl = 0, fees = 0, wins = 0, losses = 0, peak = cash, maxDrawdownPct = 0;
    let entryIndex = 0, exitIndex = 0, fifteenIndex = -1, hourlyIndex = -1, campaignId = 0, eventId = 0, processed = 0;
    let lastBar = null, lastSnapshot = null, finishReason = 'archive_end';
    const pnl = (pos, mark) => pos.qty * (mark - pos.entryPrice) * (pos.side === 'long' ? 1 : -1);
    const equity = mark => cash + (position ? position.margin + pnl(position, mark) : 0);
    function bandAt(open) {
      while (fifteenIndex + 1 < fifteen.length && fifteen[fifteenIndex + 1].time + FIFTEEN <= open) fifteenIndex++;
      if (fifteenIndex < 0) return null;
      const expectedEnd = Math.floor(open / FIFTEEN) * FIFTEEN;
      if (fifteen[fifteenIndex].time + FIFTEEN !== expectedEnd) return { gap: true };
      if (fifteenIndex < 19) return null;
      const window = fifteen.slice(fifteenIndex - 19, fifteenIndex + 1);
      if (window.some((b, i) => i && b.time - window[i - 1].time !== FIFTEEN)) return { gap: true };
      const middle = window.reduce((sum, b) => sum + b.c, 0) / 20;
      const sigma = Math.sqrt(window.reduce((sum, b) => sum + Math.pow(b.c - middle, 2), 0) / 20);
      return { middle, upper: middle + sigma * 2, lower: middle - sigma * 2, sourceCloseAt: fifteen[fifteenIndex].time + FIFTEEN };
    }
    function stats(mark) {
      const unrealizedPnl = position ? pnl(position, mark) : 0, currentEquity = equity(mark);
      return { realizedPnl, unrealizedPnl, unrealizedNetPnl: unrealizedPnl - (position ? position.entryFee : 0), openEntryFees: position ? position.entryFee : 0,
        netPnl: currentEquity - settings.initialBalance, returnPct: (currentEquity / settings.initialBalance - 1) * 100,
        fees, tradeCount: trades.length, wins, losses, winRatePct: trades.length ? wins / trades.length * 100 : null, maxDrawdownPct };
    }
    function addEvent(events, event) { events.push(Object.assign({ id: ++eventId }, event)); }
    function cancelLadder(reason) {
      if (ladder && ladder.orders.some(order => !order.filled)) {
        if (reason === 'expiry') diagnostics.expiredLadders++;
        else diagnostics.canceledLadders++;
      }
      ladder = null;
    }
    function close(bar, basePrice, reason, events, detail = {}) {
      const p = position, exitPrice = basePrice * (1 + (p.side === 'long' ? -slipRate : slipRate));
      const exitFee = p.qty * exitPrice * feeRate, grossPnl = pnl(p, exitPrice), netPnl = grossPnl - p.entryFee - exitFee;
      const time = detail.open ? bar.time : bar.time + FIVE;
      const trade = Object.assign(copy(p), { exitPrice, exitFee, exitNotional: p.qty * exitPrice, grossPnl, fees: p.entryFee + exitFee, netPnl,
        returnPct: netPnl / p.margin * 100, exitAt: time, exitTime: time, exitBarTime: bar.time,
        exitTimePrecision: detail.open ? 'open' : 'bar_close_bound', reason, ambiguous: !!detail.ambiguous,
        ambiguityPolicy: detail.policy || null, gapFill: !!detail.gap, exitTrigger: detail.trigger ? copy(detail.trigger) : null });
      cash += p.margin + grossPnl - exitFee; fees += exitFee; realizedPnl += netPnl;
      if (netPnl > 0) wins++; if (netPnl < 0) losses++;
      trades.push(trade);
      addEvent(events, { type: 'exit', time, barTime: bar.time, side: p.side, price: exitPrice, tradeId: p.id,
        fee: exitFee, netPnl, precision: trade.exitTimePrecision, reason, ambiguous: !!detail.ambiguous,
        ambiguityPolicy: trade.ambiguityPolicy, label: reason === 'stop_loss' ? '고정 손절가 도달 · 전량 청산' : '반대 지표 확인 · 전량 청산' });
      position = null; cancelLadder(reason);
    }
    function fill(bar, order, events) {
      const long = ladder.side === 'long';
      const atOpen = long ? bar.o <= order.limit : bar.o >= order.limit;
      const price = atOpen ? (long ? Math.min(order.limit, bar.o * (1 + slipRate)) : Math.max(order.limit, bar.o * (1 - slipRate))) : order.limit;
      const margin = ladder.installment, fee = margin * feeRate;
      if (cash + 1e-8 < margin + fee) { diagnostics.insufficientCash++; return; }
      const quantity = margin / price, time = atOpen ? bar.time : bar.time + FIVE;
      if (!position) position = { id: ladder.id, side: ladder.side, entryAt: time, entryTime: time, entryBarTime: bar.time,
        entryTimePrecision: atOpen ? 'open' : 'bar_close_bound', entryPrice: price, qty: 0, margin: 0, notional: 0, entryFee: 0,
        leverage: 1, stopLoss: ladder.stop, settings: copy(settings), tranches: [], trigger: copy(ladder.trigger), frozenBB: copy(ladder.bb) };
      const tranche = { id: ladder.id + ':' + order.number, number: order.number, entryAt: time, barTime: bar.time, price, limit: order.limit, qty: quantity, margin, fee, precision: atOpen ? 'open' : 'bar_close_bound' };
      position.qty += quantity; position.margin += margin; position.notional += margin; position.entryFee += fee;
      position.entryPrice = position.notional / position.qty; position.tranches.push(tranche);
      cash -= margin + fee; fees += fee; order.filled = true; diagnostics.trancheCount++;
      addEvent(events, { type: 'entry', time, barTime: bar.time, side: position.side, price, tradeId: tranche.id,
        campaignId: position.id, fee, precision: tranche.precision, label: (position.side === 'long' ? '롱 매수 ' : '숏 매도 ') + order.number + '/3 분할 · 지정가 ' + order.limit });
    }
    const selected = five.filter(bar => bar.time >= from && bar.time + FIVE <= to);
    let expected = from;
    for (const raw of selected) {
      if (raw.time !== expected) { finishReason = 'data_gap'; diagnostics.gapAt = expected; break; }
      const band = bandAt(raw.time);
      if (band && band.gap) { finishReason = 'indicator_gap'; diagnostics.gapAt = raw.time; break; }
      while (hourlyIndex + 1 < hourly.length && hourly[hourlyIndex + 1].time + HOUR <= raw.time) hourlyIndex++;
      const bar = Object.assign({}, raw, { bb: band ? copy(band) : null });
      if (hourlyIndex >= 0 && Number.isFinite(hourly[hourlyIndex].goya)) bar.goya = hourly[hourlyIndex].goya;
      const events = [], newEntries = [], newExits = [];
      while (entryIndex < entryEvents.length && entryEvents[entryIndex].availableAt <= bar.time) newEntries.push(entryEvents[entryIndex++]);
      while (exitIndex < exitEvents.length && exitEvents[exitIndex].availableAt <= bar.time) newExits.push(exitEvents[exitIndex++]);
      if (ladder && bar.time >= ladder.expiresAt) cancelLadder('expiry');
      const activeSide = position ? position.side : ladder ? ladder.side : null;
      const opposite = activeSide && newExits.find(event => event.direction !== activeSide);
      // Even without a position, simultaneous opposing entry/exit signals cannot open/reverse.
      const oppositeNewEntry = newEntries.some(entry => newExits.some(exit => exit.direction !== entry.direction));
      let closedThisBar = false;
      if (opposite) {
        if (position) close(bar, bar.o, 'opposite_signal', events, { open: true, trigger: opposite });
        else cancelLadder('opposite_signal');
        closedThisBar = true;
      }
      if (newEntries.length) {
        if (closedThisBar || oppositeNewEntry) diagnostics.skippedSameExitBar += newEntries.length;
        else if (position || ladder) diagnostics.skippedBusy += newEntries.length;
        else if (new Set(newEntries.map(event => event.direction)).size > 1) diagnostics.skippedConflict += newEntries.length;
        else if (!band || band.lower <= 0) diagnostics.skippedWarmup += newEntries.length;
        else if (cash > 0) {
          const entry = newEntries[newEntries.length - 1], long = entry.direction === 'long', outer = long ? band.lower : band.upper;
          const budget = cash * settings.allocationPct / 100;
          // Reserve entry fees as well, so 100% allocation cannot overdraw the account.
          const usableBudget = Math.min(budget, cash / (1 + feeRate));
          ladder = { id: ++campaignId, side: entry.direction, trigger: entry, bb: copy(band), stop: outer * (1 + (long ? -1 : 1) * settings.stopLossPct / 100),
            budget: usableBudget, installment: usableBudget / 3, createdAt: bar.time, expiresAt: bar.time + DAY,
            orders: [band.middle, (band.middle + outer) / 2, outer].map((limit, i) => ({ number: i + 1, limit, filled: false })) };
          diagnostics.acceptedSignals++;
          addEvent(events, { type: 'order', time: bar.time, barTime: bar.time, side: ladder.side, label: '15분 볼린저밴드 3분할 주문 · 24시간 유효' });
        }
      }
      const heldAtStart = !!position;
      const stop = position ? position.stopLoss : ladder ? ladder.stop : null;
      const long = position ? position.side === 'long' : ladder ? ladder.side === 'long' : false;
      const stopAtOpen = stop !== null && (long ? bar.o <= stop : bar.o >= stop);
      const stopTouched = stop !== null && (long ? bar.l <= stop : bar.h >= stop);
      const eligible = ladder ? ladder.orders.filter(order => !order.filled && (long ? bar.l <= order.limit : bar.h >= order.limit)) : [];
      if (!closedThisBar && stopAtOpen) {
        if (position) close(bar, bar.o, 'stop_loss', events, { open: true, gap: true });
        else { diagnostics.gapInvalidatedLadders++; cancelLadder('gap_invalidated'); }
      } else if (!closedThisBar) {
        eligible.forEach(order => fill(bar, order, events));
        if (position && stopTouched) {
          const ambiguous = eligible.length > 0;
          if (ambiguous) diagnostics.ambiguousStopBars++;
          if (!heldAtStart) diagnostics.entryAndStopBars++;
          close(bar, stop, 'stop_loss', events, { ambiguous, policy: ambiguous ? 'all_touched_limits_then_stop' : null });
        }
      }
      const currentEquity = equity(bar.c);
      peak = Math.max(peak, currentEquity);
      maxDrawdownPct = Math.max(maxDrawdownPct, peak > 0 ? (peak - currentEquity) / peak * 100 : 0);
      equityCurve.push({ time: bar.time + FIVE, equity: currentEquity });
      displayedBars.push(bar); if (displayedBars.length > 120) displayedBars.shift();
      const positionView = position ? Object.assign(copy(position), { markPrice: bar.c, unrealizedPnl: pnl(position, bar.c), value: position.margin + pnl(position, bar.c) }) : null;
      const pending = ladder && ladder.orders.some(order => !order.filled) ? { side: ladder.side, expiresAt: ladder.expiresAt, stopLoss: ladder.stop,
        remaining: ladder.orders.filter(order => !order.filled).map(copy), label: '15분 볼린저밴드 분할 지정가 대기' } : null;
      const cutoff = bar.time + FIVE, firstVisible = displayedBars[0].time;
      const visibleSignals = originalSignals.filter(signal => signal.time >= firstVisible && Math.max(signal.time + HOUR, signal.availableAt || 0) <= cutoff);
      originalSignals.filter(signal => {
        const available = Math.max(signal.time + HOUR, signal.availableAt || 0);
        return available > bar.time && available <= cutoff;
      }).forEach(signal => addEvent(events, { type: 'signal', time: Math.max(signal.time + HOUR, signal.availableAt || 0), barTime: signal.time, signal,
        label: signal.signal, side: /^(L|LRL)/.test(signal.signal) ? 'long' : 'short' }));
      lastSnapshot = { ticker, index: processed++, intervalSeconds: FIVE, candleSeconds: FIVE, cutoff, current: bar, bars: displayedBars.slice(), signals: visibleSignals,
        position: positionView, pending, trades: trades.slice(), stats: stats(bar.c), equity: currentEquity, cash, events, settings,
        finished: false, finishReason: null };
      if (options.collectFrames) frames.push(lastSnapshot);
      lastBar = bar; expected = cutoff;
      if (cash <= 0 && !position) { finishReason = 'insolvent'; break; }
    }
    if (finishReason === 'archive_end' && expected < to) { finishReason = 'data_gap'; diagnostics.gapAt = expected; }
    cancelLadder('end');
    if (lastSnapshot) {
      lastSnapshot.finished = true; lastSnapshot.finishReason = finishReason; lastSnapshot.pending = null;
    }
    const mark = lastBar ? lastBar.c : 0, finalStats = stats(mark), openPosition = lastSnapshot ? lastSnapshot.position : null;
    const positiveNet = trades.reduce((sum, t) => sum + Math.max(0, t.netPnl), 0), negativeNet = trades.reduce((sum, t) => sum + Math.max(0, -t.netPnl), 0);
    const summary = Object.assign({ initialBalance: settings.initialBalance, finalEquity: equity(mark), cash, openPosition, forcedEndClose: false,
      entryCount: trades.length + (position ? 1 : 0), filledCount: trades.length + (position ? 1 : 0), signalCampaignCount: campaignId,
      trancheCount: diagnostics.trancheCount, profitFactor: negativeNet ? positiveNet / negativeNet : null }, finalStats);
    return { ticker, settings, summary, trades, equityCurve,
      coverage: { from, to: lastBar ? lastBar.time + FIVE : from, requestedTo: to, bars: processed, candleSeconds: FIVE, finishReason, complete: finishReason === 'archive_end' },
      frames, snapshot: lastSnapshot, diagnostics,
      assumptions: { candleSeconds: FIVE, signalAvailabilityDelaySeconds: HOUR, bbSeconds: FIFTEEN, bbLength: 20, bbMultiplier: 2,
        bbPopulationStdDev: true, bbOnlyClosedBeforeOpen: true, frozenLadder: true, stopFrozenAtOuterBand: true, installments: 3,
        allocationBasis: 'equity_at_signal_total_margin_cap', orderExpirySeconds: DAY, leverage: 1, fundingModeled: false,
        liquidationModeled: false, intrabarTimeKnown: false, intrabarFillTime: 'bar_close_bound', limitFill: 'touch_at_limit_or_improved_open_slippage_capped_at_limit',
        marketExit: 'adverse_slippage_and_fee', existingStopOrder: 'all_touched_limits_then_stop', newEntryStopOrder: 'all_touched_limits_then_stop',
        openingBeyondStop: 'stop_existing_position_at_open_cancel_remaining_limits',
        gapPolicy: 'freeze_before_gap', oppositeExitAutomaticReverse: false, endPolicy: 'mark_open_position_without_exit_fee',
        drawdownBasis: '5m_close_equity', historicalSignalFirstPublicationVerified: false } };
  }
  return Object.freeze({ run });
});
