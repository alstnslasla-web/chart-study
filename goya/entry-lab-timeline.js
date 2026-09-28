(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory;else root.GoyaEntryLabTimeline=factory(root.GoyaEntryLab,root.GoyaMonthTimeline);})(typeof globalThis==='undefined'?this:globalThis,function(Lab,Timeline){
  'use strict';
  function collect(input){
    const options=Lab.prepare(input), collected=Timeline.collect(options);
    // Exit-only adapter signals must never be presented as original provider signals.
    const signals=input.payload.signals.filter(s=>s.group==='none').slice().sort((a,b)=>a.time-b.time);
    let previous=collected.frames.length?collected.frames[0].current.time:0;
    for(const frame of collected.frames){
      frame.signals=signals.filter(s=>s.time>=frame.bars[0].time&&s.time+3600<=frame.cutoff);
      frame.events=frame.events.filter(e=>e.type!=='signal');
      for(const signal of signals.filter(s=>s.time+3600>previous&&s.time+3600<=frame.cutoff))frame.events.push({type:'signal',id:'source:'+signal.source+':'+signal.time+':'+signal.signal,time:signal.time+3600,barTime:signal.time,signal,label:signal.signal});
      frame.events.sort((a,b)=>a.time-b.time||({entry:0,exit:1,signal:2,order:3}[a.type]-{entry:0,exit:1,signal:2,order:3}[b.type]));
      previous=frame.cutoff;
    }
    return collected;
  }
  return Object.freeze({collect});
});
