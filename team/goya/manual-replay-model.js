(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GoyaManualReplay = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const copy = v => JSON.parse(JSON.stringify(v));
  const defaults = {initialCash:10000, leverage:3, allocationPct:30, stopLossPct:5, takeProfitPct:5, feeBps:4, slippageBps:2, exitOpposite:true};
  function create(options) {
    const bars = copy(options.bars5m || []), hours = copy(options.bars1h || []), signals = copy(options.signals || []);
    const settings = Object.assign({}, defaults, options.settings);
    ['initialCash','leverage','allocationPct','stopLossPct','takeProfitPct','feeBps','slippageBps'].forEach(k => { if (!Number.isFinite(settings[k])) throw new Error('Invalid setting: '+k); });
    if (settings.initialCash<=0 || settings.leverage<2 || settings.leverage>10 || settings.allocationPct<1 || settings.allocationPct>100 || settings.stopLossPct<0 || settings.stopLossPct>50 || settings.takeProfitPct<0 || settings.takeProfitPct>50 || settings.feeBps<0 || settings.slippageBps<0) throw new Error('Settings out of range');
    function validateBars(rows,interval,label) { rows.forEach((b,i) => { if (![b.time,b.open,b.high,b.low,b.close].every(Number.isFinite) || b.time%interval!==0 || b.low<=0 || b.low>Math.min(b.open,b.close) || b.high<Math.max(b.open,b.close) || (i && b.time<=rows[i-1].time)) throw new Error('Invalid '+label+' bar '+i); }); }
    validateBars(bars,300,'5m'); validateBars(hours,3600,'1h');
    signals.forEach((s,i)=>{ if(!Number.isFinite(s.time) || s.time%3600!==0 || typeof s.signal!=='string' || typeof s.source!=='string' || typeof s.group!=='string') throw new Error('Invalid signal '+i); });
    // Content stamp protects accidental restore against changed data; UI also checks archive SHA256.
    const serialized=JSON.stringify([bars,hours,signals]);let stampA=2166136261,stampB=5381;
    for(let i=0;i<serialized.length;i++) { stampA=Math.imul(stampA^serialized.charCodeAt(i),16777619);stampB=Math.imul(stampB,33)^serialized.charCodeAt(i); }
    const datasetStamp=serialized.length+':'+(stampA>>>0).toString(16)+':'+(stampB>>>0).toString(16);
    let cursor = Math.min(Math.max(0, options.startIndex == null ? 288 : Math.floor(options.startIndex)), bars.length-1);
    const startIndex=cursor, actions=[], trades=[], events=[];
    let cash=settings.initialCash, fees=0, realizedNet=0, position=null, pending=null, error=null, halted=false;
    const clock=()=>cursor>=0 ? bars[cursor].time+300 : null;
    const signalDirection=s => {
      if(s.group!=='none') return null;
      if(s.source==='ut_signal2') return s.signal==='L' ? 'long' : s.signal==='S' ? 'short' : null;
      if(s.source==='analysis_signal') return s.signal==='L2' ? 'long' : s.signal==='S2' ? 'short' : null;
      return null;
    };
    const fee=p=>p*settings.feeBps/10000;
    const execution=(price, buy)=>price*(1+(buy?1:-1)*settings.slippageBps/10000);
    function snapshot() {
      const unrealized=position ? position.quantity*(bars[cursor].close-position.entryPrice)*(position.side==='long'?1:-1) : 0;
      return copy({cursor,clock:clock(),visible5m:bars.slice(0,cursor+1),visible1h:hours.filter(b=>b.time+3600<=clock()),visibleSignals:signals.filter(s=>s.time+3600<=clock()),position,pending,account:{cash,equity:cash+unrealized,realizedNet,unrealized,fees},trades,events,ended:halted || cursor>=bars.length-1,error,limitations:['Archived final EX; original first publication time is unknown','Funding, liquidation, borrowing and order book liquidity are not modeled','OHLC bars reveal no intrabar path; simultaneous stop/target uses stop priority']});
    }
    function close(price,time,reason) {
      const p=position, exitPrice=execution(price,p.side==='short'), exitFee=fee(p.quantity*exitPrice), gross=p.quantity*(exitPrice-p.entryPrice)*(p.side==='long'?1:-1), net=gross-p.entryFee-exitFee;
      cash+=gross-exitFee; fees+=exitFee; realizedNet+=net;
      const trade={side:p.side,entryTime:p.entryTime,exitTime:time,entryPrice:p.entryPrice,exitPrice,quantity:p.quantity,gross,net,fees:p.entryFee+exitFee,reason};
      trades.push(trade); events.push(Object.assign({type:'close',time},trade)); position=null;
    }
    function step(record=true) {
      if(record) actions.push({type:'step'});
      error=null;
      if(cursor>=bars.length-1 || halted) { error=halted?'Data gap: replay stopped':'Dataset ended'; return record ? snapshot() : undefined; }
      const b=bars[cursor+1], oldClock=clock();
      if(b.time!==oldClock) { halted=true; error='Data gap: replay stopped before '+b.time; return record ? snapshot() : undefined; }
      if(pending) {
        if(pending.side==='close' && position) close(b.open,b.time,pending.reason || 'manual');
        else if(pending.side!=='close' && !position) {
          const entryPrice=execution(b.open,pending.side==='long'), budget=Math.max(0,cash)*settings.allocationPct/100, notional=budget/(1/settings.leverage+settings.feeBps/10000), entryFee=fee(notional);
          if(notional>0) { position={side:pending.side,entryPrice,entryTime:b.time,quantity:notional/entryPrice,entryFee,notional,margin:notional/settings.leverage}; cash-=entryFee;fees+=entryFee; events.push({type:'open',time:b.time,side:position.side,price:entryPrice,quantity:position.quantity,fee:entryFee}); }
          else error='Insufficient equity';
        }
        pending=null;
      }
      // Stops protect the position immediately after the next-open fill.
      if(position) {
        const long=position.side==='long', entry=position.entryPrice, sl=settings.stopLossPct ? entry*(1+(long?-1:1)*settings.stopLossPct/100) : null, tp=settings.takeProfitPct ? entry*(1+(long?1:-1)*settings.takeProfitPct/100) : null;
        const hitSL=sl!==null && (long?b.low<=sl:b.high>=sl), hitTP=tp!==null && (long?b.high>=tp:b.low<=tp);
        // The open is known to precede the rest of this OHLC bar.
        const openSL=sl!==null && (long?b.open<=sl:b.open>=sl), openTP=tp!==null && (long?b.open>=tp:b.open<=tp);
        if(openSL) close(b.open,b.time,'stop-loss');
        else if(openTP) close(b.open,b.time,'take-profit');
        else if(hitSL) close(sl,b.time,'stop-loss');
        else if(hitTP) close(long?Math.max(tp,b.open):Math.min(tp,b.open),b.time,'take-profit');
      }
      cursor++;
      if(settings.exitOpposite && position) {
        const opposite=signals.find(s=>s.time+3600>oldClock && s.time+3600>position.entryTime && s.time+3600<=clock() && signalDirection(s) && signalDirection(s)!==position.side && !signals.some(other=>other.time===s.time && other.source===s.source && signalDirection(other)===position.side));
        if(opposite) { pending={side:'close',requestedAt:clock(),reason:'opposite-signal'}; events.push({type:'queued',time:clock(),side:'close',reason:'opposite-signal'}); }
      }
      return record ? snapshot() : undefined;
    }
    function order(side,record=true) {
      if(record) actions.push({type:'order',side});
      error=null;
      if(!['long','short','close'].includes(side)) error='Invalid order';
      else if(halted || cursor>=bars.length-1) error='Replay ended';
      else if(pending) error='An order is already pending';
      else if(side==='close' && !position) error='No open position';
      else if(side!=='close' && position) error='Close the current position first';
      else { pending={side,requestedAt:clock(),reason:'manual'}; events.push({type:'queued',time:clock(),side,reason:'manual'}); }
      return record ? snapshot() : undefined;
    }
    function cancelPending(record=true) { if(record) actions.push({type:'cancel'}); pending=null;error=null;return record ? snapshot() : undefined; }
    if(options.restore) {
      if(options.restore.schema!==1 || options.restore.datasetId!==(options.datasetId || null) || options.restore.datasetStamp!==datasetStamp || options.restore.startIndex!==startIndex || JSON.stringify(options.restore.settings)!==JSON.stringify(settings)) throw new Error('Incompatible replay state');
      (options.restore.actions || []).forEach(a=> { if(a.type==='step') step(false); else if(a.type==='order') order(a.side,false); else if(a.type==='cancel') cancelPending(false); else throw new Error('Invalid replay action'); actions.push(copy(a)); });
    }
    return {snapshot,step,order,cancelPending,exportState:()=>copy({schema:1,datasetId:options.datasetId || null,datasetStamp,startIndex,settings,actions})};
  }
  // 1h study rows (time = bar start) become usable at time + 3600 (bar close). A 5-minute slot that opens at T can
  // therefore show at most the hour floor(T/3600)*3600 - 3600; the same rule gives the newest hour at the clock.
  const hourKnownAt=T=>Math.floor(T/3600)*3600-3600;
  const revealedAt=(rowTime,clock)=>Number.isFinite(rowTime) && Number.isFinite(clock) && rowTime+3600<=clock;
  return {create,defaults:copy(defaults),hourKnownAt,revealedAt};
});
