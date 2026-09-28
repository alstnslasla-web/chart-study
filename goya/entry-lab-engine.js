/* Archived hourly signals: fixed candidate definitions, closed-hour visibility, next-open execution. */
(function(root,factory){if(typeof module==='object'&&module.exports){const req=name=>{try{return require('./'+name);}catch(_){return require('../../learning-sim/'+name);}};module.exports=factory(req('signal-sequence.js'),req('engine.js'));}else root.GoyaEntryLab=factory(root.GoyaSequence,root.GoyaSimEngine);})(typeof globalThis!=='undefined'?globalThis:this,function(Sequence,Engine){
'use strict';
const H=3600,DAY=24*H;
const strategies=Object.freeze([
 {id:'two',label:'기존 · 같은 방향 2종',description:'Smart·Premium(L2/L3/S2/S3)·RL/RS 중 48시간 안에 같은 방향 2종, 기존 재무장 규칙'},
 {id:'smart',label:'LL/SS 단독',description:'Smart LL/SS 마감 후 진입'},
 {id:'premium2',label:'L2/S2 선행 단독',description:'Premium L2/S2 마감 후 진입; LL/SS를 기다리지 않음'},
 {id:'premium_then_smart',label:'L2/S2 → LL/SS',description:'같은 방향 L2/S2 다음 24시간 이내 LL/SS; 같은 봉 제외'},
 {id:'smart_then_premium',label:'LL/SS → L2/S2',description:'같은 방향 LL/SS 다음 24시간 이내 L2/S2; 같은 봉 제외'},
 {id:'premium_rl',label:'L2/S2 + RL/RS',description:'24시간 안에 같은 방향 Premium L2/S2와 RL/RS, 순서 무관; 조건 해제 후 재무장'}
]);
const exitModes=Object.freeze([{id:'smart',label:'반대 LL/SS'},{id:'earliest',label:'반대 L2/S2·LL/SS 먼저'},{id:'two',label:'기존 반대 2종 조건'}]);
const defaults=Object.freeze({initialBalance:10000,allocationPct:40,leverage:1,feeBps:4,slippageBps:2,takeProfitPct:0,stopLossPct:3,exitMode:'opposite_smart'});
const copy=x=>JSON.parse(JSON.stringify(x));
function validate(payload){if(!payload||!Array.isArray(payload.bars)||!payload.bars.length||!Array.isArray(payload.signals))throw Error('보관된 시간봉과 신호가 필요합니다.');let last=-1;for(const b of payload.bars){if(!Number.isInteger(b.time)||b.time<=last||!['o','h','l','c'].every(k=>Number.isFinite(b[k])&&b[k]>0)||b.h<Math.max(b.o,b.c)||b.l>Math.min(b.o,b.c))throw Error('잘못된 시간봉 기록');last=b.time;}}
function classify(s){if(s.group!=='none')return null;if(s.source==='ut_signal2'&&['L','S'].includes(s.signal))return {family:'smart',direction:s.signal==='L'?'long':'short'};if(s.source==='analysis_signal'&&['L2','S2'].includes(s.signal))return {family:'premium',direction:s.signal==='L2'?'long':'short'};if(s.source==='rls_signal'&&['LRL','SRS'].includes(s.signal))return {family:'rl',direction:s.signal==='LRL'?'long':'short'};return null;}
function signals(payload,id){
 if(!strategies.some(s=>s.id===id))throw Error('알 수 없는 연구 진입 규칙');
 if(!Sequence)throw Error('signal-sequence.js를 먼저 불러와 주세요.');
 const from=payload.bars[0].time,until=payload.bars.at(-1).time+H;
 const rows=payload.signals.filter(s=>Number.isFinite(s.time)&&s.time>=from&&s.time+H<=until&&s.group==='none');
 if(id==='two')return Sequence.evaluateAny(rows,until,{group:'none',availabilityDelaySeconds:H,windowSeconds:48*H,minFamilies:2}).completed.map(c=>({id:id+':'+c.direction+':'+c.completeAt,direction:c.direction,completeAt:c.completeAt,availableAt:c.availableAt,evidence:c.evidence}));
 const batches=new Map();for(const s of rows){const a=batches.get(s.time)||[];a.push(s);batches.set(s.time,a);}const out=[],state={smart:null,premium:null,rl:null};let armed=null;
 function add(time,direction,evidence){out.push({id:id+':'+direction+':'+time,direction,completeAt:time,availableAt:time+H,evidence:copy(evidence)});}
 for(const [time,batch]of [...batches].sort((a,b)=>a[0]-b[0])){
  // Time can expire a condition between event batches; rearm before overwriting the old timestamps.
  if(id==='premium_rl'&&armed&&(!state.premium||!state.rl||time-state.premium.time>DAY||time-state.rl.time>DAY))armed=null;
  const prev={smart:state.smart,premium:state.premium,rl:state.rl}; // 이 봉을 반영하기 전 상태(순서 규칙의 선행 신호 기준)
  const changed={};for(const family of ['smart','premium','rl']){const hits=batch.map(s=>({s,c:classify(s)})).filter(x=>x.c&&x.c.family===family);if(!hits.length)continue;const dirs=[...new Set(hits.map(x=>x.c.direction))];state[family]={time,direction:dirs.length===1?dirs[0]:'ambiguous',evidence:hits.map(x=>x.s)};changed[family]=state[family];}
  if(id==='smart'||id==='premium2'){const v=changed[id==='smart'?'smart':'premium'];if(v&&v.direction!=='ambiguous')add(time,v.direction,[v]);continue;}
  if(id==='premium_then_smart'||id==='smart_then_premium'){
   const first=id==='premium_then_smart'?'premium':'smart',second=first==='premium'?'smart':'premium',a=prev[first],b=changed[second];
   if(a&&b&&b.direction!=='ambiguous'&&a.direction===b.direction&&a.time<b.time&&b.time-a.time<=DAY)add(time,b.direction,[a,b]);continue;
  }
  const a=state.premium,b=state.rl,dir=a&&b&&a.direction===b.direction&&a.direction!=='ambiguous'&&time-a.time<=DAY&&time-b.time<=DAY?a.direction:null;
  if(dir&&armed!==dir)add(time,dir,[a,b]);armed=dir;
 }
 return out;
}
function prepare(options){
 const p=options.payload;validate(p);const id=options.strategyId||'two',exit=options.exitMode||'earliest';if(!exitModes.some(x=>x.id===exit))throw Error('알 수 없는 연구 청산 규칙');
 const from=options.from===undefined?p.bars[0].time:options.from,to=options.to===undefined?p.bars.at(-1).time+H:options.to;
 const bars=p.bars.filter(b=>b.time>=from&&b.time+H<=to);if(!bars.length)throw Error('선택 기간의 마감된 시간봉이 없습니다.');
 const preparedPayload={...p,bars:p.bars.filter(b=>b.time+H<=to),signals:p.signals.filter(s=>s.time+H<=to)};
 const completions=signals(preparedPayload,id).filter(s=>s.availableAt>=bars[0].time+H);
 let exits;if(exit==='two')exits=signals(preparedPayload,'two');else exits=preparedPayload.signals.map(s=>({s,c:classify(s)})).filter(x=>x.c&&(x.c.family==='smart'||exit==='earliest'&&x.c.family==='premium')).map(x=>({direction:x.c.direction,completeAt:x.s.time,availableAt:x.s.time+H,source:x.s}));
 // Match the original engine's chronological ordering while preserving ties in source order.
 exits=exits.map((event,index)=>({event,index})).sort((a,b)=>a.event.availableAt-b.event.availableAt||a.index-b.index).map(row=>row.event);
 const settings=Engine.validateSettings({...defaults,...options.settings,exitMode:'opposite_smart'});
 return {ticker:p.ticker||'UNKNOWN',bars:copy(bars),signals:exits.map((s,i)=>({time:s.availableAt-H,source:'ut_signal2',group:'none',signal:s.direction==='long'?'L':'S',source_index:i,original:s.source||s})),completions:copy(completions),entryEvents:copy(completions),exitEvents:copy(exits),archiveEnd:Math.min(to,bars.at(-1).time+H),settings,sourceSignals:copy(p.signals.filter(s=>s.time+H<=to)),research:{strategyId:id,exitMode:exit,from:bars[0].time,to,sourceSignalFirstSeenKnown:false}};
}
// 연구실 청산은 원래 신호(Premium L2/S2 또는 2종 조건)를 엔진이 받아들이도록 ut_signal2 L/S 로 바꿔 넣는다.
// 결과·프레임에 남는 청산 표기(trigger·note·signals)는 아래에서 원래 신호로 되돌려, 학습자가 Smart LL/SS 로 오해하지 않게 한다.
function describeExit(x){if(x&&x.source){const s=x.source,smart=s.source==='ut_signal2';return {type:'research_exit',family:smart?'smart':'premium',label:smart?(s.signal==='L'?'LL':'SS'):s.signal,source:s.source,signal:s.signal,group:s.group,time:s.time,source_index:s.source_index};}return {type:'research_exit',family:'two',label:'2종 조건 성립',source:'research_two',time:x?x.completeAt:null,evidence:x?copy(x.evidence||[]):[]};}
function exitInfo(trigger,exits){if(!trigger||trigger.type!=='smart'||!Array.isArray(exits)||!Number.isInteger(trigger.source_index))return null;const x=exits[trigger.source_index];if(!x)return null;return {...trigger,...describeExit(x),availableAt:x.availableAt};}
function fixNote(note,label){return typeof note==='string'&&/^반대 (LL|SS) 확인 후/.test(note)?'반대 '+label+' 확인 후 다음 시가에 포지션 정리':note;}
function relabelTrade(t,exits){const info=exitInfo(t&&t.exitTrigger,exits);if(info){t.exitTrigger=info;t.exitNote=fixNote(t.exitNote,info.label);}return t;}
function relabelPending(p,exits){const info=exitInfo(p&&p.trigger,exits);if(info){p.trigger=info;p.note=fixNote(p.note,info.label);}return p;}
function relabelFrame(frame,exits){if(!frame)return frame;(frame.trades||[]).forEach(t=>relabelTrade(t,exits));(frame.events||[]).forEach(e=>{if(e&&e.type==='order'&&e.trigger){const info=exitInfo(e.trigger,exits);if(info)e.trigger=info;}});if(frame.pending)relabelPending(frame.pending,exits);return frame;}
function relabel(result,exits,sourceSignals){if(!result)return result;(result.trades||[]).forEach(t=>relabelTrade(t,exits));const s=result.snapshot;if(s){(s.trades||[]).forEach(t=>relabelTrade(t,exits));(s.decisions||[]).forEach(d=>{const info=exitInfo(d.trigger,exits);if(info){d.trigger=info;d.note=fixNote(d.note,info.label);}});if(s.pending)relabelPending(s.pending,exits);if(Array.isArray(sourceSignals))s.signals=sourceSignals.filter(x=>x.group==='none'&&x.time+H<=s.cutoff).map(copy);}return result;}
// The public run uses the existing app engine. Batch research uses the parity-tested compact loop below.
function run(options){const q=prepare(options);return relabel(Engine.runStrategy(q),q.exitEvents,q.sourceSignals);}
function runFast(options){
 const q=prepare(options),{bars,settings:cfg}=q,entries=q.completions,exits=q.signals;let cash=cfg.initialBalance,pos=null,pending=null,ec=0,xc=0,entered=0,reason='archive_end',last=0;const trades=[],equityCurve=[];
 const pnl=(p,price)=>(price-p.entryPrice)*p.qty*(p.side==='long'?1:-1);
 const equity=price=>cash+(pos?Math.max(0,pos.margin+pnl(pos,price)):0);
 function close(b,base,why,gap=false){const p=pos,exitPrice=base*(1+(p.side==='long'?-1:1)*cfg.slippageBps/10000),exitFee=p.qty*exitPrice*cfg.feeBps/10000,rawGross=pnl(p,exitPrice),rawReturn=p.margin+rawGross-exitFee,adjust=Math.max(0,-rawReturn),gross=rawGross+adjust;cash+=Math.max(0,rawReturn);trades.push({...p,exitPrice,exitFee,fees:p.entryFee+exitFee,netPnl:gross-(p.entryFee+exitFee),grossPnl:gross,rawGrossPnl:rawGross,isolatedLossAdjustment:adjust,reason:why,exitAt:why==='opposite_signal'||gap?b.time:b.time+H,exitBarTime:b.time});pos=null;}
 function open(b,side){const margin=Math.min(cash*cfg.allocationPct/100,cash/(1+cfg.leverage*cfg.feeBps/10000)),notional=margin*cfg.leverage,entryFee=notional*cfg.feeBps/10000,entryPrice=b.o*(1+(side==='long'?1:-1)*cfg.slippageBps/10000);cash-=margin+entryFee;pos={id:++entered,side,entryAt:b.time,entryPrice,qty:notional/entryPrice,notional,margin,entryFee,liquidationPrice:entryPrice*(1+(side==='long'?-1:1)*(1/cfg.leverage-.005)),stopLoss:cfg.stopLossPct?entryPrice*(1+(side==='long'?-1:1)*cfg.stopLossPct/100):null,takeProfit:cfg.takeProfitPct?entryPrice*(1+(side==='long'?1:-1)*cfg.takeProfitPct/100):null};}
 function brackets(b){if(!pos)return;const long=pos.side==='long',liq=pos.liquidationPrice,sl=pos.stopLoss,tp=pos.takeProfit;
  const gapL=long?b.o<=liq:b.o>=liq,gapS=sl!==null&&(long?b.o<=sl:b.o>=sl),gapT=tp!==null&&(long?b.o>=tp:b.o<=tp);if(gapL)return close(b,b.o,'liquidation',true);if(gapS)return close(b,b.o,'stop_loss',true);if(gapT)return close(b,tp,'take_profit',true);
  const hitL=long?b.l<=liq:b.h>=liq,hitS=sl!==null&&(long?b.l<=sl:b.h>=sl),hitT=tp!==null&&(long?b.h>=tp:b.l<=tp);if(hitL&&(!hitS||(long?liq>=sl:liq<=sl)))close(b,liq,'liquidation');else if(hitS)close(b,sl,'stop_loss');else if(hitT)close(b,tp,'take_profit');
 }
 for(let i=0;i<bars.length;i++){
  const b=bars[i],cutoff=b.time+H;if(i&&b.time-bars[i-1].time!==H){reason='data_gap';pending=null;break;}last=i;
  if(pending){if(pending==='close'){const gapL=pos.side==='long'?b.o<=pos.liquidationPrice:b.o>=pos.liquidationPrice;close(b,b.o,gapL?'liquidation':'opposite_signal',gapL);}else open(b,pending);pending=null;}
  if(i)brackets(b);
  while(xc<exits.length&&exits[xc].time+H<=cutoff){const s=exits[xc++],side=s.signal==='L'?'long':'short';if(pos&&i&&side!==pos.side&&s.time+H>pos.entryAt&&s.time+H>bars[i-1].time+H)pending='close';}
  const finished=i===bars.length-1||cash<=0&&!pos;
  while(ec<entries.length&&entries[ec].availableAt<=cutoff){const s=entries[ec++];if(!finished&&!pos&&!pending&&cash>0)pending=s.direction;}
  equityCurve.push({time:cutoff,equity:equity(b.c)});if(cash<=0&&!pos){reason='insolvent';break;}
 }
 const b=bars[last],value=equity(b.c),realized=trades.reduce((s,t)=>s+t.netPnl,0),unrealized=pos?pnl(pos,b.c):0,fees=trades.reduce((s,t)=>s+t.fees,0)+(pos?pos.entryFee:0);let peak=cfg.initialBalance,mdd=0;for(const x of equityCurve){peak=Math.max(peak,x.equity);mdd=Math.max(mdd,(peak-x.equity)/peak*100);}const wins=trades.filter(x=>x.netPnl>0).length;
 return {ticker:q.ticker,settings:cfg,research:q.research,summary:{initialBalance:cfg.initialBalance,finalEquity:value,cash,netPnl:value-cfg.initialBalance,realizedPnl:realized,unrealizedPnl:unrealized,unrealizedNetPnl:pos?unrealized-pos.entryFee:0,fees,tradeCount:trades.length,filledCount:entered,wins,losses:trades.filter(x=>x.netPnl<0).length,winRatePct:trades.length?wins/trades.length*100:null,returnPct:(value/cfg.initialBalance-1)*100,maxDrawdownPct:mdd,openPosition:pos?{...pos,markPrice:b.c,unrealizedPnl:unrealized}:null,forcedEndClose:false},trades,equityCurve,coverage:{from:bars[0].time,to:b.time+H,barsProcessed:last+1,finishedReason:reason,completeToArchive:reason==='archive_end'},assumptions:{signalDelaySeconds:H,fill:'next_open',intrabarOrder:'stop_first',fundingModeled:false,firstSeenKnown:false,archivedSignalsMayRepaint:true,automaticReverse:false,forcedEndClose:false,maintenanceMarginRate:.005,mdd:'hour_close_marks'}};
}
return Object.freeze({strategies,exitModes,defaults,signals,events:signals,prepare,inputs:prepare,run,runFast,describeExit,relabel,relabelFrame});
});

