(function(){
  'use strict';
  const $=id=>document.getElementById(id),Lab=window.GoyaEntryLab;
  let payload=null,lower=null,manifest=null,player=null,job=0,loadJob=0,result=null,selectedInput=null,completed=false,lowerError='';
  // 앞/뒤 구간 분리 시각 = 자료판 전체 구간의 앞 70%(시간 단위 내림). 9/23+9/26 합본(798시간)에서는 전 종목 연구와 같은 558시간이다.
  const kst=sec=>{const d=new Date(sec*1000+9*3600*1000),z=x=>String(x).padStart(2,'0');return z(d.getUTCMonth()+1)+'/'+z(d.getUTCDate())+' '+z(d.getUTCHours())+':'+z(d.getUTCMinutes());};
  const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=n=>Number.isFinite(n)?n.toLocaleString('ko-KR',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
  const count=n=>Number.isFinite(n)?Math.round(n).toLocaleString('ko-KR'):'—';
  function status(s){$('lab-status').textContent=s;}
  function clear(){job++;completed=false;result=null;selectedInput=null;if(player)player.destroy();player=null;$('lab-replay').hidden=true;$('lab-replay').replaceChildren();$('month-results').hidden=true;}
  // 링크 전용판(암호화)에서는 로더가 window.cbLoadScript / window.cbLoadJSON 을 준다. 일반판은 script 태그와 fetch.
  function script(src){if(typeof window.cbLoadScript==='function')return window.cbLoadScript(src);return new Promise((resolve,reject)=>{const el=document.createElement('script');el.src=src;el.onload=resolve;el.onerror=()=>reject(Error('종목 자료를 불러오지 못했습니다.'));document.head.append(el);});}
  async function bytesOf(src){if(typeof window.cbLoadJSON==='function')return window.cbLoadJSON(src);const r=await fetch(src);if(!r.ok)throw Error('파일 없음: '+src);return new Uint8Array(await r.arrayBuffer());}
  const parse=bytes=>JSON.parse(new TextDecoder().decode(bytes));
  async function verifiedLower(ticker,source){
    if(!(globalThis.crypto&&crypto.subtle))throw Error('보안 연결(https)에서만 하위봉 검증을 할 수 있습니다.');
    if(!manifest){try{manifest=parse(await bytesOf('lower-data/manifest.json'));}catch(_){throw Error('하위봉 검증표 없음');}}
    const proof=manifest.symbolsResult?.[ticker];if(manifest.status!=='complete'||!proof?.simulationEligible)throw Error('하위봉 시장 대조 미통과');
    const rows=await Promise.all(['5m','15m'].map(async tf=>{let bytes;try{bytes=await bytesOf('lower-data/'+ticker+'-'+tf+'.json');}catch(_){throw Error('하위봉 파일 없음');}const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');if(hash!==proof[tf+'File'].sha256)throw Error('하위봉 파일 해시 불일치');return parse(bytes);}));
    // 5분봉 자료는 수집 구간(researchStart~researchEndExclusive)만 있다. 그 구간 안의 시간봉만 대조하고, 분할 실행도 그 구간으로 제한한다(자료판이 뒤로 늘어나도 검증이 깨지지 않게).
    const coverage={from:Number(rows[0].researchStart),to:Number(rows[0].researchEndExclusive)};if(!Number.isFinite(coverage.from)||!Number.isFinite(coverage.to)||coverage.to<=coverage.from)throw Error('하위봉 자료 구간 정보 없음');
    const byTime=new Map(rows[0].bars.map(b=>[b.time,b]));let checked=0;
    for(const h of source.bars){if(h.time<coverage.from||h.time+3600>coverage.to)continue;const parts=Array.from({length:12},(_,i)=>byTime.get(h.time+i*300));if(parts.some(b=>!b)||parts[0].o!==h.o||parts[11].c!==h.c||Math.max(...parts.map(b=>b.h))!==h.h||Math.min(...parts.map(b=>b.l))!==h.l)throw Error('현재 시간봉과 하위봉 가격 불일치');checked++;}
    if(checked<24)throw Error('하위봉과 겹치는 시간봉이 너무 적음');
    return {bars5m:rows[0].bars,bars15m:rows[1].bars,coverage,checked};
  }
  function settingsLabel(settings,execution){return '총 증거금 '+settings.allocationPct+'% · '+settings.leverage+'배 · 손절 '+settings.stopLossPct+'% ('+(execution==='bb15'?'바깥 밴드':'진입가')+' 기준) · 추가 익절 '+(settings.takeProfitPct?settings.takeProfitPct+'% (평균 진입가 기준)':'끄기 · 반대 신호 청산');}
  function description(){const s=Lab.strategies.find(s=>s.id===$('strategy').value);$('strategy-detail').textContent=s?s.description:'';const bb=$('execution').value==='bb15',tp=Number($('lab-take-profit').value);$('lab-setting-summary').textContent=settingsLabel(formSettings(),$('execution').value)+' · 손절·익절은 가격 변동률입니다.';$('execution-rule').innerHTML=(bb?[
    '1시간봉 진입 조건이 마감으로 확인되면, 그때까지 마감된 15분봉 BB(20, 2)를 고정합니다.',
    '롱은 중단 → 중단·하단 사이 → 하단, 숏은 중단 → 중단·상단 사이 → 상단에 총 증거금을 3등분해 지정가로 대기합니다.',
    '주문은 24시간 뒤 만료됩니다. 손절은 고정한 바깥 밴드보다 설정한 비율만큼 바깥에 둡니다. 같은 5분봉 안 순서가 모호한 추가 매수와 손절은 손실에 불리한 순서로 계산합니다.',
    '롱 보유 중 숏 신호, 숏 보유 중 롱 신호가 확인되면 미체결 주문을 취소하고 첫 5분봉 시가에 청산합니다. 손실 중에도 정리하며, 같은 신호로 즉시 방향을 뒤집지 않습니다.'
  ]:[
    '마감된 1시간봉에서 진입 조건을 확인합니다.',
    '다음 1시간봉 시가에 선택한 총 증거금과 레버리지로 한 번에 진입합니다.',
    '손절은 진입가 대비 설정 비율입니다. 롱은 숏 신호, 숏은 롱 신호 확인 뒤 다음 시가에 청산합니다. 손실 중에도 정리하며, 같은 신호로 즉시 방향을 뒤집지 않습니다.'
  ]).concat([tp?'추가 익절 '+tp+'%: 평균 진입가에서 롱은 '+tp+'% 상승, 숏은 '+tp+'% 하락하면 청산합니다. 손절·익절·반대 신호 중 먼저 온 조건을 따릅니다.':'추가 가격 익절은 꺼져 있습니다. 선택한 반대 신호 또는 손절 조건으로 청산합니다.','격리 강제청산을 단순화해 계산합니다. 레버리지가 높으면 손절 가격에 닿기 전에 강제청산될 수 있습니다.']).map(x=>'<li>'+escape(x)+'</li>').join('');}
  function lowerAvailability(){const ready=!!lower&&!!window.GoyaBBExecution;const opt=$('execution').querySelector('[value="bb15"]');opt.disabled=!ready;opt.textContent=ready?'15분 볼린저 3분할 · 실제 5분봉 체결':lowerError?'15분 볼린저 분할 · 검증 실패 · 1시간봉만':'15분 볼린저 분할 · 이 종목 하위봉 없음';if(!ready)$('execution').value='hourly';$('lower-status').textContent=ready?'실제 5분봉 '+kst(lower.coverage.from)+' ~ '+kst(lower.coverage.to)+' KST 구간 · 1시간 OHLC '+lower.checked+'개 대조 통과. 분할 재생은 이 구간 안에서만 합니다.':lowerError||'현재 검증된 하위봉은 BTC·ZEC·ETH·SOL입니다. 다른 종목은 1시간봉 조합을 비교할 수 있습니다.';description();}
  // 종목 자료 읽기는 별도 세대 번호(loadJob)로 관리한다. 읽는 동안 규칙을 바꿔도(clear→job++) 읽기는 끝까지 가서 버튼을 살린다.
  async function load(){clear();const version=++loadJob,ticker=$('ticker').value;payload=null;lower=null;lowerError='';$('lab-run').disabled=true;status(ticker+' 저장 자료를 불러옵니다.');try{
    if(!window.GOYA_SIM_DATA?.[ticker])await script('data/'+encodeURIComponent(ticker)+'.js');if(version!==loadJob)return;payload=window.GOYA_SIM_DATA[ticker];
    if(!payload?.bars?.length)throw Error('저장된 봉이 없습니다.');
    if(['BTCUSDT','ZECUSDT','ETHUSDT','SOLUSDT'].includes(ticker)){
      try{const rows=await verifiedLower(ticker,payload);if(version!==loadJob)return;lower=rows;}catch(e){if(version!==loadJob)return;lower=null;lowerError='하위봉 실행 중지: '+e.message;}
    }
    if(version!==loadJob)return;lowerAvailability();$('lab-run').disabled=false;status(ticker+' · '+payload.bars.length+'시간의 기록이 준비됐습니다. 최종 PNL은 재생 뒤 보여 드립니다.');
  }catch(e){if(version===loadJob){payload=null;lower=null;lowerAvailability();status(e.message);}}}
  function formSettings(){return {initialBalance:10000,allocationPct:Number($('lab-allocation').value),leverage:Number($('lab-leverage').value),feeBps:4,slippageBps:2,stopLossPct:Number($('lab-stop').value),takeProfitPct:Number($('lab-take-profit').value)};}
  // 앞/뒤 구간은 전 종목 연구와 같은 시각(기록 시작 + 558시간)에서 나눈다. 그 시각을 기록이 덮지 못하는 종목만 봉 수 70%로 나눈다.
  function splitTime(){const n=payload.bars.length,first=payload.bars[0].time,last=payload.bars[n-1].time+3600;let common=NaN;try{const c=window.GOYA_SIM_CATALOG,s0=Date.parse(c.windowStartUTC)/1000,e0=Date.parse(c.anchorUTC)/1000;common=s0+Math.floor((e0-s0)/3600*.7)*3600;}catch(_){}return Number.isFinite(common)&&common>first&&common<last?{time:common,common:true}:{time:payload.bars[Math.floor(n*.7)].time,common:false};}
  function inputs(){const n=payload.bars.length,period=$('lab-period').value,split=splitTime(),execution=$('execution').value;let from=period==='holdout'?split.time:payload.bars[0].time,to=period==='train'?split.time:payload.bars[n-1].time+3600;
    if(execution==='bb15'&&lower&&lower.coverage){from=Math.max(from,lower.coverage.from);to=Math.min(to,lower.coverage.to);if(to-from<24*3600)throw Error('선택한 기간이 5분봉 자료 구간('+kst(lower.coverage.from)+' ~ '+kst(lower.coverage.to)+' KST)과 거의 겹치지 않습니다. 기간을 바꾸거나 1시간봉 체결을 고르세요.');}
    return {payload,strategyId:$('strategy').value,exitMode:$('lab-exit').value,from,to,period,splitCommon:split.common,settings:formSettings(),execution};}
  function calculate(input,frames){if(input.execution==='bb15'){
    if(!lower||!window.GoyaBBExecution)throw Error('검증된 실제 하위봉이 필요합니다.');const q=Lab.prepare(input);
    return window.GoyaBBExecution.run({...input,...lower,entryEvents:q.entryEvents||q.completions,exitEvents:q.exitEvents,collectFrames:frames});
  }return frames?window.GoyaEntryLabTimeline.collect(input):Lab.runFast(input);}
  function run(){if(!payload)return;let input;try{input=inputs();}catch(e){status(e.message);return;}clear();const version=job;selectedInput=input;$('lab-run').disabled=true;status('체결을 준비합니다. 미래 가격과 최종 수익은 재생 중 숨깁니다.');requestAnimationFrame(()=>setTimeout(()=>{if(version!==job)return;try{
    const output=calculate(input,true);result=output.result||output;const frames=output.frames;
    $('lab-replay').hidden=false;player=window.GoyaMonthReplay.create({host:$('lab-replay'),onRestart:()=>{completed=false;$('month-results').hidden=true;},onComplete:()=>{if(version!==job)return;completed=true;render();}});
    player.load({frames,ticker:payload.ticker,settings:result.settings,coverage:result.coverage,candleSeconds:input.execution==='bb15'?300:3600});if(input.execution==='bb15'){const speed=$('lab-replay').querySelector('[data-mr="speed"]');speed.value='96';speed.dispatchEvent(new Event('change'));}player.play();status('선택한 조합의 진입·청산을 재생합니다.');$('lab-replay').scrollIntoView({block:'start',behavior:'auto'});
  }catch(e){status(e.message);}finally{if(version===job)$('lab-run').disabled=false;}},0));}
  function render(){if(!result||!completed)return;const s=result.summary,input=selectedInput;const name=Lab.strategies.find(x=>x.id===input.strategyId).label;const exit=Lab.exitModes.find(x=>x.id===input.exitMode).label;
    $('month-results').hidden=false;$('lab-result-rule').textContent=payload.ticker+' · '+name+' / '+exit+' · '+settingsLabel(input.settings,input.execution)+' · '+kst(input.from)+' ~ '+kst(input.to)+' KST'+(input.period!=='all'&&!input.splitCommon?' · 이 종목은 기록이 짧아 봉 수 70%로 나눔':'');
    const cells=[['순손익 · 평가 포함',s.netPnl,'USDT',num],['실현 순손익',s.realizedPnl,'USDT',num],['미실현 평가손익',s.unrealizedNetPnl,'USDT',num],['최대 낙폭',s.maxDrawdownPct,'% · 봉 마감 기준',num],['완료 거래',s.tradeCount,'회',count],['거래 수수료',s.fees,'USDT',num]];
    $('lab-stats').innerHTML=cells.map(([a,b,c,f],i)=>'<div><span>'+a+'</span><strong class="'+(i<3?(b>=0?'positive':'negative'):'')+'">'+f(b)+'</strong><small>'+c+'</small></div>').join('');
    $('lab-result-note').textContent=(s.openPosition?'마지막 포지션은 보유 중이며 마지막 종가로 평가했습니다. ':'마지막 포지션까지 청산됐습니다. ')+((result.coverage.completeToArchive===false||result.coverage.complete===false)?'자료 공백 또는 자금 상태로 중간에 멈췄습니다. ':'')+(input.execution==='bb15'?'15분 밴드 주문을 실제 5분봉에서 체결했습니다. 밴드 바깥 손절과 1시간 진입가 손절은 거리도 달라, 두 방식 차이를 진입 타이밍만의 효과라고 볼 수 없습니다. ':'')+'수익률 '+num(s.returnPct)+'%. 펀딩비·호가 유동성·체결 대기열은 반영하지 않습니다.';
    $('lab-compare').innerHTML=Lab.strategies.map(strategy=>{const r=strategy.id===input.strategyId?result:calculate({...input,strategyId:strategy.id},false),z=r.summary;return '<tr class="'+(strategy.id===input.strategyId?'selected':'')+'"><td>'+escape(strategy.label)+'</td><td class="'+(z.netPnl>=0?'positive':'negative')+'">'+num(z.netPnl)+'</td><td>'+num(z.realizedPnl)+'<small>'+num(z.unrealizedNetPnl)+'</small></td><td>'+num(z.maxDrawdownPct)+'%<small>'+count(z.tradeCount)+'회</small></td><td><button data-strategy="'+strategy.id+'" aria-label="'+escape(strategy.label)+' 조합으로 다시 재생">재생</button></td></tr>';}).join('');status('재생 완료. 실현 손익과 미실현 평가를 나눠 확인하세요.');
  }
  async function study(){try{const d=parse(await bytesOf('entry-study-summary.json'));$('study-status').textContent='저장된 1배 연구 결과 · 위에서 바꾼 설정은 이 집계에 적용되지 않습니다. '+d.scope;$('study-result').innerHTML='<div class="study-callout">'+escape(d.conclusion)+'</div>'+d.paragraphs.map(p=>'<p>'+escape(p)+'</p>').join('');}catch(_){$('study-status').textContent='전 종목 집계는 아직 준비되지 않았습니다. 위에서 개별 종목의 규칙을 비교할 수 있습니다.';}}
  if(!Lab||!window.GOYA_SIM_CATALOG||!Array.isArray(window.GOYA_SIM_CATALOG.symbols)||!window.GOYA_SIM_CATALOG.symbols.length){status('연구 엔진이나 종목 목록을 불러오지 못했습니다. 새로고침해 주세요.');return;}
  $('ticker').innerHTML=window.GOYA_SIM_CATALOG.symbols.map(s=>'<option value="'+escape(s.ticker)+'">'+escape(s.ticker)+'</option>').join('');$('ticker').value='ZECUSDT';$('ticker').disabled=false;
  $('strategy').innerHTML=Lab.strategies.map(s=>'<option value="'+s.id+'">'+escape(s.label)+'</option>').join('');$('lab-exit').innerHTML=Lab.exitModes.map(s=>'<option value="'+s.id+'">'+escape(s.label)+'</option>').join('');$('lab-exit').value='earliest';
  $('ticker').addEventListener('change',load);for(const id of ['strategy','lab-exit','execution','lab-allocation','lab-leverage','lab-stop','lab-take-profit','lab-period'])$(id).addEventListener('change',()=>{clear();description();$('lab-run').disabled=!payload;status('조건을 바꿨습니다. 새 조합으로 재생하세요.');});
  $('lab-run').addEventListener('click',run);$('lab-compare').addEventListener('click',e=>{const b=e.target.closest('button[data-strategy]');if(b){$('strategy').value=b.dataset.strategy;description();run();}});
  $('lab-export').addEventListener('click',()=>{if(!completed||!result)return;const body={...result,frames:undefined,research:{strategyId:selectedInput.strategyId,exitMode:selectedInput.exitMode,execution:selectedInput.execution,selectedSettings:{...selectedInput.settings},firstSeenKnown:false}};const url=URL.createObjectURL(new Blob([JSON.stringify(body,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=payload.ticker+'-진입조합연구.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  window.addEventListener('pagehide',()=>{if(player)player.pause();});load();study();
})();
