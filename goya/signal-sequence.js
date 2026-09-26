/* Configurable user-defined three-event rule. Historical chronology, not trading advice. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.GoyaSequence=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function pick(rs){return rs.map(r=>({time:r.time,source:r.source,group:r.group,label:r.signal,source_index:r.source_index})).sort((a,b)=>a.source.localeCompare(b.source)||a.label.localeCompare(b.label)||(a.source_index||0)-(b.source_index||0));}
 function evaluate(events,cutoff,rule){
  if(!Number.isFinite(cutoff))throw new TypeError('cutoff epoch required');
  if(!rule?.cross?.long?.length||!rule?.cross?.short?.length)throw new TypeError('Explicit cross signal mapping required');
  const groups=rule.group||'none',delay=rule.availabilityDelaySeconds||0;
  if(!Number.isFinite(delay)||delay<0)throw new RangeError('Availability delay must be finite and non-negative');
  const rows=events.filter(r=>Number.isFinite(r.time)&&r.time+delay<=cutoff&&r.group===groups);
  const batches=new Map();for(const r of rows){const a=batches.get(r.time)||[];a.push(r);batches.set(r.time,a);}
  const cycles=[];let active=null;
  function finish(at,reason){if(active){active.closedAt=at;active.endReason=reason;cycles.push(active);active=null;}}
  for(const [time,batch] of [...batches].sort((a,b)=>a[0]-b[0])){
   const starts=batch.filter(r=>r.source==='ut_signal2'&&(r.signal==='L'||r.signal==='S'));
   const directions=[...new Set(starts.map(r=>r.signal==='L'?'long':'short'))];
   if(directions.length>1){finish(time,'opposing_smart_same_bar');cycles.push({direction:'ambiguous',start:time,status:'ambiguous_start',evidence:pick(starts)});continue;}
   if(directions.length){
    const dir=directions[0];
    if(active&&active.direction!==dir)finish(time,'opposite_smart');
    if(!active)active={direction:dir,start:time,status:'pending',smart:pick(starts),premium:null,cross:null,completeAt:null,sameStartBarCandidates:[],contrarySignals:[],repeatSmart:[]};
    else active.repeatSmart.push(...pick(starts));
   }
   if(!active)continue;
   const labels=active.direction==='long'?['L2','L3']:['S2','S3'];
   const other=active.direction==='long'?['S2','S3']:['L2','L3'];
   const premium=batch.filter(r=>r.source==='analysis_signal'&&labels.includes(r.signal));
   const cross=batch.filter(r=>r.source===rule.cross.source&&rule.cross[active.direction].includes(r.signal));
   active.contrarySignals.push(...pick(batch.filter(r=>r.source==='analysis_signal'&&other.includes(r.signal))));
   if(active.status==='complete')continue;
   if(time===active.start&&!rule.allowSameStartBar){active.sameStartBarCandidates.push(...pick([...premium,...cross]));continue;}
   if(!active.premium&&premium.length)active.premium={time,evidence:pick(premium)};
   if(!active.cross&&cross.length)active.cross={time,evidence:pick(cross)};
   if(active.premium&&active.cross){active.completeAt=time;active.availableAt=time+delay;active.status='complete';active.order=active.premium.time===active.cross.time?'premium_and_cross_same_bar':active.premium.time<active.cross.time?'premium_then_cross':'cross_then_premium';}
  }
  finish(cutoff,'archive_cutoff');
  return {cutoff,rule,cycles,completed:cycles.filter(c=>c.status==='complete')};
 }
 // 2026-09-26 사용자 규칙(순서 무관): 같은 방향 신호가 서로 다른 종류로 두 가지 이상 모이면 진입 조건 성립.
 // 종류 세 가지 — smart: ut_signal2 L/S, premium: analysis_signal L2·L3 / S2·S3, rl: rls_signal LRL(롱)/SRS(숏).
 // 각 종류는 마지막 신호의 방향을 유지하되 windowSeconds(기본 48시간) 안의 신호만 센다. 같은 봉에 한 종류의 반대 신호가 함께 찍히면 그 종류는 세지 않는다.
 // 조건이 성립한 뒤에는 같은 방향으로 다시 성립하려면 먼저 두 가지 아래로 떨어져야 한다(재무장). 첫 공개 시각 보장 없음.
 const FAMILIES={smart:{source:'ut_signal2',long:['L'],short:['S']},premium:{source:'analysis_signal',long:['L2','L3'],short:['S2','S3']},rl:{source:'rls_signal',long:['LRL'],short:['SRS']}};
 function evaluateAny(events,cutoff,rule){
  if(!Number.isFinite(cutoff))throw new TypeError('cutoff epoch required');
  rule=rule||{};
  const group=rule.group||'none',delay=rule.availabilityDelaySeconds===undefined?3600:rule.availabilityDelaySeconds,window=rule.windowSeconds===undefined?48*3600:rule.windowSeconds,min=rule.minFamilies===undefined?2:rule.minFamilies;
  if(!Number.isFinite(delay)||delay<0)throw new RangeError('Availability delay must be finite and non-negative');
  if(!Number.isFinite(window)||window<=0)throw new RangeError('windowSeconds must be positive');
  if(!Number.isInteger(min)||min<1||min>3)throw new RangeError('minFamilies must be 1..3');
  const names=Object.keys(FAMILIES);
  const rows=events.filter(r=>Number.isFinite(r.time)&&r.time+delay<=cutoff&&r.group===group);
  const batches=new Map();for(const r of rows){const a=batches.get(r.time)||[];a.push(r);batches.set(r.time,a);}
  const state={smart:null,premium:null,rl:null};let armed=null;const completed=[];
  const live=(time,dir)=>names.filter(n=>state[n]&&state[n].direction===dir&&time-state[n].time<=window);
  for(const [time,batch] of [...batches].sort((a,b)=>a[0]-b[0])){
   if(armed&&live(time,armed).length<min)armed=null; // 앞서 세던 신호가 창 밖으로 나가면 다시 셀 수 있다
   for(const n of names){const f=FAMILIES[n];const hit=batch.filter(r=>r.source===f.source&&(f.long.includes(r.signal)||f.short.includes(r.signal)));if(!hit.length)continue;
    const dirs=[...new Set(hit.map(r=>f.long.includes(r.signal)?'long':'short'))];
    state[n]={direction:dirs.length>1?'ambiguous':dirs[0],time,evidence:pick(hit)};
   }
   for(const dir of ['long','short']){const fams=live(time,dir);
    if(fams.length>=min){if(armed!==dir){armed=dir;completed.push({direction:dir,start:Math.min(...fams.map(n=>state[n].time)),completeAt:time,availableAt:time+delay,status:'complete',families:fams.slice().sort((a,b)=>state[a].time-state[b].time||names.indexOf(a)-names.indexOf(b)),evidence:Object.fromEntries(fams.map(n=>[n,{time:state[n].time,evidence:state[n].evidence}]))});}}
    else if(armed===dir)armed=null;
   }
  }
  return {cutoff,rule:{group,availabilityDelaySeconds:delay,windowSeconds:window,minFamilies:min},families:state,armed,completed};
 }
 return {evaluate,evaluateAny,families:Object.keys(FAMILIES)};
});
