(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.GoyaTickerSearch = api;
    const start = () => {
      const select = root.document.getElementById('ticker');
      const host = root.document.getElementById('ticker-search-root');
      if (select && host) api.mount({ select, host, document: root.document, MutationObserver: root.MutationObserver });
    };
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const aliases = {
    BTC: '비트코인', ETH: '이더리움', XRP: '리플', SOL: '솔라나', DOGE: '도지 도지코인',
    ADA: '에이다', BNB: '비앤비 바이낸스코인', ZEC: '지캐시 제트캐시',
    TRX: '트론', AVAX: '아발란체', LINK: '체인링크', DOT: '폴카닷',
    LTC: '라이트코인', BCH: '비트코인캐시', ETC: '이더리움클래식', SUI: '수이'
  };
  function normalize(value) {
    return String(value || '').normalize('NFKC').toUpperCase().replace(/[\s/:_\-·.]+/g, '');
  }
  function search(options, query) {
    const needle = normalize(query);
    if (!needle) return [];
    return Array.from(options).filter(option => {
      if (option.disabled || !option.value) return false;
      const ticker = normalize(option.value), base = ticker.replace(/(?:USDT|USDC|BUSD|USD)$/, '');
      return ticker.includes(needle) || normalize(aliases[base]).includes(needle);
    });
  }
  function mount({ select, host, document, MutationObserver }) {
    if (host.__tickerSearch) return host.__tickerSearch;
    const make = (tag, props = {}) => Object.assign(document.createElement(tag), props);
    const label = make('label', { htmlFor: 'ticker-search', textContent: '코인 검색' });
    const row = make('div', { className: 'ticker-search-row' });
    const input = make('input', { id: 'ticker-search', type: 'search', placeholder: '예: BTC, 비트코인', autocomplete: 'off', spellcheck: false });
    input.setAttribute('aria-describedby', 'ticker-search-status');
    input.setAttribute('aria-controls', 'ticker-search-results');
    input.setAttribute('enterkeyhint', 'search');
    const clear = make('button', { type: 'button', className: 'ticker-search-clear', textContent: '지우기', hidden: true });
    clear.setAttribute('aria-label', '코인 검색어 지우기');
    const status = make('p', { id: 'ticker-search-status', className: 'ticker-search-status' });
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const results = make('ul', { id: 'ticker-search-results', className: 'ticker-search-results', hidden: true });
    results.setAttribute('aria-label', '코인 검색 결과');
    row.append(input, clear);
    host.append(label, row, status, results);
    let matches = [], destroyed = false;

    function render() {
      if (destroyed) return;
      input.disabled = select.disabled;
      clear.hidden = !input.value;
      clear.disabled = select.disabled;
      matches = select.disabled ? [] : search(select.options, input.value);
      results.replaceChildren();
      results.hidden = matches.length === 0;
      if (select.disabled) status.textContent = '코인 목록을 불러오고 있습니다.';
      else if (!normalize(input.value)) status.textContent = '영문 기호로 검색하세요. 주요 코인은 한글 이름도 됩니다.';
      else if (!matches.length) status.textContent = '검색 결과가 없습니다. 코인 기호를 다시 입력해 주세요.';
      else status.textContent = '검색 결과 ' + matches.length + '개' + (matches.length > 10 ? ' · 앞 10개 표시. 검색어를 더 입력해 주세요.' : ' · Enter로 첫 결과 선택');
      matches.slice(0, 10).forEach(option => {
        const li = make('li'), button = make('button', { type: 'button', textContent: option.textContent, className: 'ticker-search-result' });
        button.dataset.ticker = option.value;
        button.addEventListener('click', () => choose(option.value));
        li.append(button); results.append(li);
      });
    }
    function reset() { input.value = ''; render(); }
    function choose(value) {
      if (select.disabled || !Array.from(select.options).some(option => option.value === value && !option.disabled)) return;
      const changed = select.value !== value;
      select.value = value;
      reset();
      if (changed) select.dispatchEvent(new document.defaultView.Event('change', { bubbles: true }));
      status.textContent = value + ' 선택됨';
      select.focus();
    }
    function onKey(event) {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        if (matches.length) choose(matches[0].value);
      } else if (event.key === 'Escape') {
        event.preventDefault(); reset();
      } else if (event.key === 'ArrowDown' && matches.length) {
        event.preventDefault(); results.querySelector('button').focus();
      }
    }
    function onResultsKey(event) {
      const buttons = Array.from(results.querySelectorAll('button')), current = buttons.indexOf(document.activeElement);
      if (event.key === 'Escape') { reset(); input.focus(); event.preventDefault(); }
      else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const next = current + (event.key === 'ArrowDown' ? 1 : -1);
        if (next < 0) input.focus();
        else if (next < buttons.length) buttons[next].focus();
      }
    }
    function onClear() { reset(); input.focus(); }
    input.addEventListener('input', render);
    input.addEventListener('keydown', onKey);
    clear.addEventListener('click', onClear);
    results.addEventListener('keydown', onResultsKey);
    // Observe only the unchanged native select. Rendering search results cannot retrigger this observer.
    const observer = MutationObserver ? new MutationObserver(render) : null;
    if (observer) observer.observe(select, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['disabled', 'label', 'value'] });
    render();
    const api = { refresh: render, destroy() {
      destroyed = true;
      if (observer) observer.disconnect();
      input.removeEventListener('input', render);
      input.removeEventListener('keydown', onKey);
      clear.removeEventListener('click', onClear);
      results.removeEventListener('keydown', onResultsKey);
      host.replaceChildren();
      delete host.__tickerSearch;
    } };
    host.__tickerSearch = api;
    return api;
  }
  return { normalize, search, mount };
});
