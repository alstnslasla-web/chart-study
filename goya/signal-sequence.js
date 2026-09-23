/* Configurable user-defined three-event rule. Historical chronology, not trading advice. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.GoyaSequence=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function evaluate(events,cutoff,rule){
  if(!Number.isFinite(cutoff))throw new TypeError('cutoff epoch required');
  if(!rule?.cross?.long?.length||!rule?.cross?.short?.length)throw new TypeError('Explicit cross signal mapping required');
  const groups=rule.group||'none',delay=rule.availabilityDelaySeconds||0;
  if(!Number.isFinite(delay)||delay<0)throw new RangeError('Availability delay must be finite and non-negative');
  const rows=events.filter(r=>Number.isFinite(r.time)&&r.time+delay<=cutoff&&r.group===groups);
  const batches=new Map();for(const r of rows){const a=batches.get(r.time)||[];a.push(r);batches.set(r.time,a);}
  const cycles=[];let active=null;
  function finish(at,reason){if(active){active.closedAt=at;active.endReason=reason;cycles.push(active);active=null;}}
  function pick(rs){return rs.map(r=>({time:r.time,source:r.source,group:r.group,label:r.signal,source_index:r.source_index})).sort((a,b)=>a.source.localeCompare(b.source)||a.label.localeCompare(b.label)||(a.source_index||0)-(b.source_index||0));}
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
 return {evaluate};
});
