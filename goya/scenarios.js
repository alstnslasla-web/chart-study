/* Entry-condition exercises. 'two' (2026-09-26 user rule): two or more same-direction signal kinds in any order.
   The older Smart-first three-condition sequences (bothrs / rls / cross) stay available for comparison. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./signal-sequence.js'));
  else root.GoyaScenarios = factory(root.GoyaSequence);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (sequence) {
  'use strict';
  const TWO = { windowSeconds: 48 * 3600, minFamilies: 2 };
  const maps = {
    two: null,
    bothrs: {source: 'rls_signal', long: ['SRS'], short: ['SRS']},
    rls: {source: 'rls_signal', long: ['LRL'], short: ['SRS']},
    cross: {source: 'cross_signal', long: ['L 진입'], short: ['S 진입']}
  };
  function display(e) {
    if (e.source === 'ut_signal2') return e.label === 'L' ? 'LL' : e.label === 'S' ? 'SS' : e.label;
    if (e.source === 'rls_signal') return e.label === 'SRS' ? 'RS' : e.label === 'LRL' ? 'RL' : e.label;
    return e.label;
  }
  // options.windowHours: 'two' 규칙에서 신호를 세는 창(기본 48시간). 2026-09-28 ZEC 연구 후보는 24시간.
  function analyze(payload, mapping = 'bothrs', options = {}) {
    if (!(mapping in maps)) throw new Error('지원하지 않는 진입 조건 규칙입니다.');
    if (!sequence || !Array.isArray(payload?.bars) || !Array.isArray(payload?.signals)) throw new Error('실제 보관 자료가 필요합니다.');
    const windowHours = options && options.windowHours !== undefined ? Number(options.windowHours) : TWO.windowSeconds / 3600;
    if (!Number.isFinite(windowHours) || windowHours <= 0) throw new Error('신호 유효시간은 0보다 큰 시간이어야 합니다.');
    if (!payload.bars.length) return {rule: null, cases: [], completions: [], unusable: [], range: null, windowHours};
    const bars = payload.bars;
    const from = bars[0].time, until = bars[bars.length - 1].time + 3600;
    if (mapping === 'two') return analyzeTwo(payload, from, until, windowHours);
    const rule = {group: 'none', cross: maps[mapping], allowSameStartBar: false, availabilityDelaySeconds: 3600, resetPolicy: 'opposite_smart', mappingUserSelected: true, mappingConfirmedByUser: mapping === 'bothrs', mappingConfirmedByProvider: false};
    const result = sequence.evaluate(payload.signals.filter(s => s.time >= from), until, rule);
    const indices = new Map(bars.map((b, i) => [b.time, i]));
    const cases = [], unusable = [];
    for (const c of result.completed) {
      const index = indices.get(c.completeAt);
      if (index === undefined || index >= bars.length - 1) {
        unusable.push({direction: c.direction, completeAt: c.completeAt, availableAt: c.availableAt, reason: index === undefined ? 'completion_bar_missing' : 'no_next_open'});
        continue;
      }
      const step = (role, time, evidence) => ({role, time, availableAt: time + 3600, labels: evidence.map(display), evidence: evidence.map(e => ({...e}))});
      cases.push({
        id: payload.ticker + ':' + c.direction + ':' + c.start + ':' + c.completeAt,
        ticker: payload.ticker, direction: c.direction, index, start: c.start,
        completeAt: c.completeAt, availableAt: c.availableAt, order: c.order,
        steps: [step('smart', c.start, c.smart), step('premium', c.premium.time, c.premium.evidence), step('cross', c.cross.time, c.cross.evidence)],
        assumptions: ['hour_close_visibility', 'exclude_same_smart_start_bar', 'reset_on_opposite_smart', 'keep_first_same_direction_smart'],
        mapping
      });
    }
    cases.sort((a, b) => a.availableAt - b.availableAt || a.id.localeCompare(b.id));
    return {rule, cases, completions: cases, unusable, range: {from, until}, mapping, historicalLabels: true};
  }
  // 같은 방향 신호 두 가지 이상: 종류(smart / premium / rl)별 마지막 신호를 48시간 창 안에서 세며 순서는 상관없다.
  function analyzeTwo(payload, from, until, windowHours = TWO.windowSeconds / 3600) {
    const bars = payload.bars;
    const rule = {group: 'none', availabilityDelaySeconds: 3600, windowSeconds: windowHours * 3600, minFamilies: TWO.minFamilies, anyOrder: true, mappingUserSelected: true, mappingConfirmedByUser: true, mappingConfirmedByProvider: false};
    const result = sequence.evaluateAny(payload.signals.filter(s => s.time >= from), until, rule);
    const indices = new Map(bars.map((b, i) => [b.time, i]));
    const roles = {smart: 'smart', premium: 'premium', rl: 'cross'};
    const cases = [], unusable = [];
    for (const c of result.completed) {
      const index = indices.get(c.completeAt);
      if (index === undefined || index >= bars.length - 1) {
        unusable.push({direction: c.direction, completeAt: c.completeAt, availableAt: c.availableAt, reason: index === undefined ? 'completion_bar_missing' : 'no_next_open'});
        continue;
      }
      const steps = c.families.map(name => ({role: roles[name], family: name, time: c.evidence[name].time, availableAt: c.evidence[name].time + 3600, labels: c.evidence[name].evidence.map(display), evidence: c.evidence[name].evidence.map(e => ({...e}))}));
      cases.push({
        id: payload.ticker + ':' + c.direction + ':' + c.start + ':' + c.completeAt,
        ticker: payload.ticker, direction: c.direction, index, start: c.start,
        completeAt: c.completeAt, availableAt: c.availableAt, order: c.families.join('_then_'),
        steps, assumptions: ['hour_close_visibility', 'two_of_three_same_direction', 'any_order', 'window_' + windowHours + 'h', 'ambiguous_same_bar_family_not_counted', 'rearm_after_drop_below_two'],
        mapping: 'two'
      });
    }
    cases.sort((a, b) => a.availableAt - b.availableAt || a.id.localeCompare(b.id));
    return {rule, cases, completions: cases, unusable, range: {from, until}, mapping: 'two', windowHours, historicalLabels: true};
  }
  // 봉별 종류(smart / premium / rl) 방향: 0 없음, 1 롱, -1 숏, 2 같은 봉 양방향(방향 불명). 기본 그룹(none)만 센다.
  function familyDirections(signals) {
    const defs = sequence.familyDefinitions || {}, out = new Map();
    for (const s of signals) {
      if (!s || s.group !== 'none' || !Number.isFinite(s.time)) continue;
      for (const name of Object.keys(defs)) {
        const f = defs[name];
        if (s.source !== f.source) continue;
        const d = f.long.includes(s.signal) ? 1 : f.short.includes(s.signal) ? -1 : 0;
        if (!d) continue;
        const row = out.get(s.time) || {};
        row[name] = row[name] === undefined || row[name] === 0 || row[name] === d ? d : 2;
        out.set(s.time, row);
      }
    }
    return out;
  }
  const FILTER_REASONS = {goya: 'filter_goya', body: 'filter_body', breakout: 'filter_breakout'};
  // 2026-09-28 ZEC 연구 후보의 진입 시점 규칙. 조건 성립 봉 i 뒤에 delayBars 만큼 더 관찰한 판단 봉 j = i + delayBars 의 마감 정보만 쓰고, 체결은 j + 1 봉 시가(엔진의 다음 시가 체결).
  //  - 관찰 중(i+1 ~ j) 세 종류 중 하나라도 반대 방향 또는 방향 불명 신호가 찍히면 그 조건은 취소.
  //  - filter 'goya': 롱 종가 > GOYA LINE / 숏 종가 < GOYA LINE(판단 봉의 저장된 goya 값). 'body': 롱 양봉 / 숏 음봉. 'breakout': 판단 종가가 조건 봉 고가 위 / 저가 아래. 'none': 없음.
  //  - 이 대기는 진입만 늦추는 매매 규칙이며 지표 공개 지연이나 재도색 방지 모형이 아니다. 청산 신호는 늦추지 않는다.
  function prepareEntries(payload, completions, rule = {}) {
    if (!Array.isArray(payload?.bars) || !Array.isArray(payload?.signals)) throw new Error('실제 보관 자료가 필요합니다.');
    const delayBars = rule.delayBars === undefined ? 0 : Number(rule.delayBars), filter = rule.filter || 'none';
    if (!Number.isInteger(delayBars) || delayBars < 0 || delayBars > 48) throw new Error('추가 관찰봉은 0 ~ 48 사이의 정수여야 합니다.');
    if (!['none', 'goya', 'body', 'breakout'].includes(filter)) throw new Error('지원하지 않는 방향 확인 방식입니다.');
    // 관찰봉 0이면 판단 봉 = 조건 봉이라 종가가 그 봉 고가를 넘을 수 없다(연구 탐색도 관찰 0에서는 없음/GOYA만 썼다).
    if (filter === 'breakout' && delayBars === 0) throw new Error('신호봉 고저 돌파 확인은 추가 관찰봉이 1봉 이상일 때만 뜻이 있습니다. 관찰봉을 늘리거나 다른 방향 확인을 고르세요.');
    const bars = payload.bars, indices = new Map(bars.map((b, i) => [b.time, i])), dirs = familyDirections(payload.signals);
    const out = [], cancelled = [];
    for (const c of (completions || [])) {
      const d = c.direction === 'long' ? 1 : c.direction === 'short' ? -1 : 0;
      const i = Number.isInteger(c.index) ? c.index : indices.get(c.completeAt);
      if (!d || i === undefined) { cancelled.push({...c, reason: 'completion_bar_missing'}); continue; }
      const j = i + delayBars;
      if (j >= bars.length - 1) { cancelled.push({...c, reason: 'no_next_open'}); continue; }
      let reason = null;
      for (let k = i + 1; k <= j && !reason; k++) {
        const row = dirs.get(bars[k].time);
        if (row && Object.keys(row).some(name => row[name] === -d || row[name] === 2)) reason = 'opposite_during_wait';
      }
      const b = bars[j];
      if (!reason && filter === 'goya' && !(Number.isFinite(b.goya) && d * (b.c - b.goya) > 0)) reason = FILTER_REASONS.goya;
      if (!reason && filter === 'body' && !(d * (b.c - b.o) > 0)) reason = FILTER_REASONS.body;
      if (!reason && filter === 'breakout' && !(d === 1 ? b.c > bars[i].h : b.c < bars[i].l)) reason = FILTER_REASONS.breakout;
      if (reason) { cancelled.push({...c, judgedAt: b.time, judgedIndex: j, reason}); continue; }
      out.push({...c, index: j, availableAt: b.time + 3600, judgedAt: b.time, judgedIndex: j, completionIndex: i, delayBars, filter});
    }
    out.sort((a, b) => a.availableAt - b.availableAt || String(a.id).localeCompare(String(b.id)));
    return {completions: out, cancelled, rule: {delayBars, filter}};
  }
  return {analyze, display, prepareEntries, familyDirections, mappings: Object.keys(maps), two: TWO};
});
