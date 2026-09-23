/* Three-condition exercises. Default is the user's explicitly stated common RS rule. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./signal-sequence.js'));
  else root.GoyaScenarios = factory(root.GoyaSequence);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (sequence) {
  'use strict';
  const maps = {
    bothrs: {source: 'rls_signal', long: ['SRS'], short: ['SRS']},
    rls: {source: 'rls_signal', long: ['LRL'], short: ['SRS']},
    cross: {source: 'cross_signal', long: ['L 진입'], short: ['S 진입']}
  };
  function display(e) {
    if (e.source === 'ut_signal2') return e.label === 'L' ? 'LL' : e.label === 'S' ? 'SS' : e.label;
    if (e.source === 'rls_signal') return e.label === 'SRS' ? 'RS' : e.label === 'LRL' ? 'RL' : e.label;
    return e.label;
  }
  function analyze(payload, mapping = 'bothrs') {
    if (!maps[mapping]) throw new Error('지원하지 않는 교차 신호 대응입니다.');
    if (!sequence || !Array.isArray(payload?.bars) || !Array.isArray(payload?.signals)) throw new Error('실제 보관 자료가 필요합니다.');
    if (!payload.bars.length) return {rule: null, cases: [], completions: [], unusable: [], range: null};
    const bars = payload.bars;
    const from = bars[0].time, until = bars[bars.length - 1].time + 3600;
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
  return {analyze, display, mappings: Object.keys(maps)};
});
