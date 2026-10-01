(function(){'use strict';
// 실제 5분봉 위에 보관된 1시간 지표를 "봉 마감 후"에만 겹쳐 보이는 수동 재생 화면.
// 주문·체결·PNL·복원은 manual-replay-model.js 가 맡고, 이 파일은 표시와 버튼만 다룬다. 지표 표시 추가는 거래 규칙을 바꾸지 않는다.
const $=id=>document.getElementById(id),KEY='cb:goya-manual-replay:v1',STUDY_KEY='cb:goya-manual-replay:studies:v1';
let data,model,timer=null,lastEvents=0,activeSettings,studyMaps={},studyState={},goyaMap=new Map();
const time=t=>Number.isFinite(Number(t))?new Date((Number(t)+32400)*1000).toISOString().replace('T',' ').slice(0,16):'—';
const clockLabel=t=>time(t).slice(5);
const money=n=>Number.isFinite(Number(n))?Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+' USDT':'—';
const fmt=v=>Number.isFinite(v)?(Math.abs(v)>=10?v.toFixed(2):Math.abs(v)>=1?v.toFixed(3):v.toPrecision(4)):'—';
const hourKnownAt=T=>window.GoyaManualReplay.hourKnownAt(T),revealedAt=(t,c)=>window.GoyaManualReplay.revealedAt(t,c);
const signalLabel=a=>a.source==='ut_signal2'?({L:'LL',S:'SS'}[a.signal]||a.signal):a.source==='rls_signal'?({LRL:'RL',SRS:'RS'}[a.signal]||a.signal):a.source==='rsi_signal'?'RSI '+a.signal:a.signal;
const signalSide=a=>{const v=String(a.signal||'').toUpperCase();return v.startsWith('L')?'long':v.startsWith('S')?'short':'other';};
const LONG='#54c9a2',SHORT='#ed777a',GOLD='#e9b24e';
// 원 화면과 같은 색: Smart 상·하단 흰 선, Premium 극값 빨강/초록, Smart Line 노랑, 3MA 흰·노랑·빨강, BB 자홍/연두. (refresh/2026-10-01/clone/app.js)
const STUDIES=[
 {key:'goya',label:'GOYA LINE',color:'#e46eb5',kind:'price',on:true,desc:'1시간 종가 흐름선(보관값)'},
 {key:'smartChannel',label:'Smart Channel',color:'#e7e9ed',kind:'price',on:true,desc:'상단·하단 흰 선, 첫째 선↔중간선 채움(초록=첫째 선이 위)'},
 {key:'smartLine',label:'Smart Line',color:'#dfd637',kind:'price',on:false,desc:'노란 선 · 9/2부터 보관됨 · 해당 봉 마감 후 표시'},
 {key:'premiumChannel',label:'Premium Channel',color:'#c11c1c',color2:'#00890e',kind:'price',on:true,desc:'최고가·둘째 종가(빨강) / 최저가·둘째 종가(초록) / 바깥 선(흰색)'},
 {key:'ma',label:'3MA',color:'#fff100',kind:'price',on:false,desc:'ma1 흰색 · ma2 노랑 · ma3 빨강'},
 {key:'bb',label:'BB',color:'#e00094',color2:'#7dcd5d',kind:'price',on:false,desc:'상단 자홍 · 하단 연두'},
 {key:'sigPro',label:'LL / SS',color:LONG,kind:'signal',on:true,sources:['ut_signal2'],desc:'Smart Pro 신호'},
 {key:'sigLite',label:'L / S',color:LONG,kind:'signal',on:true,sources:['ut_signal'],desc:'Smart Lite 신호'},
 {key:'sigPremium',label:'Premium 번호·문자',color:LONG,kind:'signal',on:true,sources:['analysis_signal','label_signal'],desc:'L1~L4·S1~S4·LB/SB·LV/SV'},
 {key:'sigRls',label:'RL / RS',color:'#fff100',kind:'signal',on:true,sources:['rls_signal'],desc:'Premium Channel 신호'},
 {key:'sigCross',label:'교차(진입·정리)',color:GOLD,kind:'signal',on:false,sources:['cross_signal'],desc:'골든/데드 교차 기록'},
 {key:'rsi',label:'RSI',color:'#8fb4ff',kind:'pane',on:true,desc:'하단 · 캔들 RSI 실선, 하이킨 RSI 점선, 30·50·70 기준선'},
 {key:'macd',label:'MACD',color:'#2196f3',kind:'pane',on:false,desc:'하단 · 막대와 두 선'},
 {key:'sigRsi',label:'RSI 신호',color:LONG,kind:'pane',on:true,sources:['rsi_signal'],desc:'하단 RSI 위 원형 L/S'}
];
const study=key=>STUDIES.find(s=>s.key===key);
const enabled=key=>!!studyState[key]&&available(key);
function available(key){const s=study(key);if(!s)return false;if(s.key==='goya')return true;if(s.kind==='signal')return true;if(s.key==='sigRsi')return!!(data&&data.studies);return!!(data&&data.studies&&(data.studies.price[key]||data.studies.panes[key]));}
function settings(){return{leverage:Number($('leverage').value),allocationPct:Number($('allocation').value),stopLossPct:Number($('sl').value),takeProfitPct:Number($('tp').value),exitOpposite:$('opposite').checked};}
function applySettings(s){$('leverage').value=s.leverage;$('allocation').value=s.allocationPct;$('sl').value=s.stopLossPct;$('tp').value=s.takeProfitPct;$('opposite').checked=s.exitOpposite;}
function stop(){clearInterval(timer);timer=null;$('play').textContent='▶ 재생';}
function save(){if(!model||!data)return;try{localStorage.setItem(KEY,JSON.stringify({datasetId:data.datasetId,settings:model.settings||activeSettings,modelState:model.exportState()}));}catch(e){$('status').textContent='연습은 계속할 수 있지만 이 브라우저에 기록을 저장하지 못했습니다.';}}
function saveStudies(){try{localStorage.setItem(STUDY_KEY,JSON.stringify({state:studyState,range:$('range').value,hour:$('hour-details').open}));}catch(_){}}
function advance(){if(!model)return;const s=model.step();if(s.error||s.ended)stop();render();save();}
function start(){stop();timer=setInterval(advance,Number($('speed').value));$('play').textContent='Ⅱ 일시정지';}

// ---- 1시간 자료 색인: 시각 → 행 ----
function indexStudies(){
 studyMaps={};goyaMap=new Map((data.bars1h||[]).map(b=>[b.time,{goya:b.goya}]));
 const st=data.studies;if(!st)return;
 for(const grp of ['price','panes'])for(const [key,tbl] of Object.entries(st[grp]||{})){const f=tbl.fields;studyMaps[key]=new Map(tbl.rows.map(r=>{const o={};f.forEach((n,i)=>o[n]=r[i]);return [o.time,o];}));}
}
const rowAt=(key,hour)=>key==='goya'?goyaMap.get(hour):(studyMaps[key]||new Map()).get(hour);
const valueAt=(key,field,hour)=>{const r=rowAt(key,hour);const v=r?r[field]:undefined;return Number.isFinite(v)?v:NaN;};
// 표시 전용 신호(L4/S4, RSI L/S)와 모델 신호를 한 목록으로. 모두 "봉 마감 + 1시간" 뒤에만 보인다.
function visibleMarkers(s){const list=(s.visibleSignals||[]).slice();(data.studies&&data.studies.markers||[]).forEach(m=>{if(revealedAt(m.time,s.clock))list.push(m);});return list.sort((a,b)=>a.time-b.time);}
const sourceEnabled=src=>STUDIES.some(st=>st.sources&&st.sources.includes(src)&&enabled(st.key));

// ---- 지표 켜기/끄기 ----
function buildToggles(){
 const host=$('study-toggles');host.replaceChildren();
 STUDIES.forEach(st=>{const ok=available(st.key);const lab=document.createElement('label');lab.className='chip'+(ok?'':' off');lab.title=(st.desc||'')+(ok?'':' · 이 자료판에 없음');
  const cb=document.createElement('input');cb.type='checkbox';cb.id='study-'+st.key;cb.checked=ok&&!!studyState[st.key];cb.disabled=!ok;cb.onchange=()=>{studyState[st.key]=cb.checked;saveStudies();if(model)render();};
  const sw=document.createElement('i');sw.className='swatch';sw.style.background=st.color;if(st.color2)sw.style.background='linear-gradient(90deg,'+st.color+' 50%,'+st.color2+' 50%)';
  const tx=document.createElement('span');tx.textContent=st.label+(st.kind==='pane'?' ▾':'');lab.append(cb,sw,tx);host.append(lab);});
 const un=$('study-unavailable');const list=(data.studies&&data.studies.unavailable)||[];un.textContent=list.length?'표시 안 함(자료 없음): '+list.map(u=>u.label+' — '+u.reason).join(' · '):'';
}

// ---- 공통 캔버스 준비 ----
function prepare(id,height){const c=$(id);if(height)c.style.height=height+'px';const r=c.getBoundingClientRect(),dpr=window.devicePixelRatio||1;c.width=Math.round(r.width*dpr);c.height=Math.round(r.height*dpr);const ctx=c.getContext('2d');ctx.scale(dpr,dpr);ctx.fillStyle='#151c25';ctx.fillRect(0,0,r.width,r.height);return{ctx,w:r.width,h:r.height};}
function axis(ctx,w,pad,lo,hi,y,digits){ctx.font='11px system-ui';for(let i=0;i<=4;i++){const v=lo+(hi-lo)*i/4,yy=y(v);ctx.strokeStyle='#293342';ctx.beginPath();ctx.moveTo(pad.l,yy);ctx.lineTo(w-pad.r,yy);ctx.stroke();ctx.fillStyle='#94a3b7';ctx.fillText(digits?v.toFixed(digits):fmt(v),w-pad.r+6,yy+4);}}
// 계단선: 각 5분 칸은 "그 칸이 열릴 때 알 수 있던 1시간 값"을 보이고, 맨 오른쪽(현재 시각)에서 방금 마감한 값으로 한 번 더 꺾인다.
function stepLine(ctx,list,xl,xr,y,getV,color,width,dash,endValue){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash||[]);ctx.beginPath();let prev=NaN,open=false;
 list.forEach((b,i)=>{const v=getV(b);if(!Number.isFinite(v)){open=false;prev=NaN;return;}const x0=xl(i),x1=xr(i);if(!open){ctx.moveTo(x0,y(v));open=true;}else if(v!==prev){ctx.lineTo(x0,y(prev));ctx.lineTo(x0,y(v));}ctx.lineTo(x1,y(v));prev=v;});
 if(open&&Number.isFinite(endValue)&&endValue!==prev){const x=xr(list.length-1);ctx.lineTo(x,y(prev));ctx.lineTo(x,y(endValue));ctx.lineTo(x+7,y(endValue));}
 ctx.stroke();ctx.setLineDash([]);ctx.lineWidth=1;}

// ---- 주 차트: 5분 실제 가격 + 1시간 지표 + 신호 + 내 주문 ----
function drawMain(s){
 const capacity=Number($('range').value)||144,all=s.visible5m||[],list=all.slice(-capacity),{ctx,w,h}=prepare('five-chart'),pad={l:8,r:70,t:14,b:30},cw=w-pad.l-pad.r,ch=h-pad.t-pad.b;
 if(!list.length){ctx.fillStyle='#aebccc';ctx.font='14px system-ui';ctx.fillText('첫 마감 봉을 기다립니다.',15,45);return;}
 const dx=cw/capacity,xl=i=>pad.l+i*dx,xr=i=>pad.l+(i+1)*dx,x=i=>pad.l+(i+.5)*dx;
 const hourOf=b=>hourKnownAt(b.time),latest=hourKnownAt(s.clock);
 const priceFields={goya:['goya'],smartChannel:['upper','lower','first','middle'],smartLine:['value'],premiumChannel:['highestHigh','secondHighestClose','upperLine','lowestLow','secondLowestClose','lowerLine'],ma:['ma1','ma2','ma3'],bb:['upper','lower']};
 const values=list.flatMap(b=>[b.low,b.high]);
 for(const [key,fields] of Object.entries(priceFields))if(enabled(key)){list.forEach(b=>fields.forEach(f=>{const v=valueAt(key,f,hourOf(b));if(Number.isFinite(v))values.push(v);}));fields.forEach(f=>{const v=valueAt(key,f,latest);if(Number.isFinite(v))values.push(v);});}
 // 세로 범위: 캔들이 너무 납작해지지 않도록 지표 선은 캔들 폭의 1.2배까지만 끌어들인다(그 밖의 선은 잘려 보이고 글자 값으로 읽는다). 내 진입·손절·익절은 항상 보인다.
 const cLo=Math.min(...list.map(b=>b.low)),cHi=Math.max(...list.map(b=>b.high)),cr=cHi-cLo||cHi*.01;
 let lo=Math.max(Math.min(...values),cLo-cr*1.2),hi=Math.min(Math.max(...values),cHi+cr*1.2);
 const pos=s.position;if(pos){const pv=[pos.entryPrice];if(activeSettings.stopLossPct>0)pv.push(pos.entryPrice*(1+(pos.side==='long'?-1:1)*activeSettings.stopLossPct/100));if(activeSettings.takeProfitPct>0)pv.push(pos.entryPrice*(1+(pos.side==='long'?1:-1)*activeSettings.takeProfitPct/100));lo=Math.min(lo,...pv);hi=Math.max(hi,...pv);}
 const margin=(hi-lo||hi*.01)*.08;lo-=margin;hi+=margin;const y=v=>pad.t+(hi-v)/(hi-lo)*ch;
 axis(ctx,w,pad,lo,hi,y,2);ctx.save();ctx.beginPath();ctx.rect(pad.l,pad.t-2,cw+12,ch+4);ctx.clip();
 // 1시간 경계 세로선(옅게) — "값이 바뀌는 자리"
 ctx.strokeStyle='#1f2a36';list.forEach((b,i)=>{if(b.time%3600===0){ctx.beginPath();ctx.moveTo(xl(i),pad.t);ctx.lineTo(xl(i),h-pad.b);ctx.stroke();}});
 // 채움(Smart Channel 첫째 선 ↔ 중간선)
 if(enabled('smartChannel')){let run=null;const flush=(end)=>{if(!run)return;ctx.fillStyle=run.a>=run.m?'rgba(4,153,129,.22)':'rgba(242,54,69,.22)';ctx.fillRect(xl(run.i),Math.min(y(run.a),y(run.m)),xr(end)-xl(run.i),Math.abs(y(run.a)-y(run.m))||1);run=null;};
  list.forEach((b,i)=>{const hr=hourOf(b),a=valueAt('smartChannel','first',hr),m=valueAt('smartChannel','middle',hr);if(!Number.isFinite(a)||!Number.isFinite(m)){flush(i-1);return;}if(run&&(run.a!==a||run.m!==m))flush(i-1);if(!run)run={i,a,m};});flush(list.length-1);}
 // 캔들
 list.forEach((b,i)=>{const color=b.close>=b.open?LONG:SHORT;ctx.strokeStyle=color;ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(x(i),y(b.high));ctx.lineTo(x(i),y(b.low));ctx.stroke();ctx.fillRect(x(i)-Math.max(1,dx*.3),Math.min(y(b.open),y(b.close)),Math.max(2,dx*.6),Math.max(1,Math.abs(y(b.close)-y(b.open))));});
 // 1시간 지표 선
 const line=(key,f,color,width,dash)=>stepLine(ctx,list,xl,xr,y,b=>valueAt(key,f,hourOf(b)),color,width,dash,valueAt(key,f,latest));
 if(enabled('smartChannel')){line('smartChannel','upper','#e7e9ed',1.5);line('smartChannel','lower','#e7e9ed',1.5);line('smartChannel','first','#8fd3c3',1,[3,3]);line('smartChannel','middle','#f0b4c8',1,[3,3]);}
 if(enabled('premiumChannel')){line('premiumChannel','highestHigh','#c11c1c',1.5);line('premiumChannel','secondHighestClose','#c11c1c',1,[4,3]);line('premiumChannel','upperLine','#e7e9ed',1.2);line('premiumChannel','lowestLow','#00c21a',1.5);line('premiumChannel','secondLowestClose','#00c21a',1,[4,3]);line('premiumChannel','lowerLine','#e7e9ed',1.2);}
 if(enabled('ma')){line('ma','ma1','#ffffff',1.5);line('ma','ma2','#fff100',1.5);line('ma','ma3','#c11c1c',1.5);}
 if(enabled('bb')){line('bb','upper','#e00094',1.5);line('bb','lower','#7dcd5d',1.5);}
 if(enabled('smartLine'))line('smartLine','value','#dfd637',1.6);
 if(enabled('goya'))line('goya','goya','#e46eb5',2.2);
 // 보관 신호: 발생한 1시간(점선 받침) + 확인 가능 시각(마감 경계)에 글자
 const byTime=new Map(list.map((b,i)=>[b.time,i]));const stack={};
 visibleMarkers(s).filter(m=>sourceEnabled(m.source)&&m.source!=='rsi_signal').forEach(m=>{
  const end=byTime.get(m.time+3300);if(end===undefined)return;const startIdx=byTime.has(m.time)?byTime.get(m.time):0;const hourBars=all.filter(b=>b.time>=m.time&&b.time<m.time+3600);if(!hourBars.length)return;
  const side=signalSide(m),short=side==='short',level=short?Math.max(...hourBars.map(b=>b.high)):Math.min(...hourBars.map(b=>b.low));const k=m.time+':'+side,j=stack[k]=(stack[k]||0)+1;
  const color=m.source==='rls_signal'?(short?'#fff100':'#7dcd5d'):m.source==='cross_signal'?GOLD:short?SHORT:LONG;
  // 받침선(점선)은 발생한 1시간의 고가 위 / 저가 아래, 글자는 그 바깥쪽. 같은 시간·같은 방향은 바깥으로 쌓는다.
  const yb=Math.max(pad.t+6,Math.min(h-pad.b-6,short?y(level)-6-(j-1)*17:y(level)+6+(j-1)*17));
  ctx.strokeStyle=color;ctx.setLineDash([2,3]);ctx.beginPath();ctx.moveTo(xl(startIdx),yb);ctx.lineTo(xr(end),yb);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle=color;ctx.font=(m.source==='ut_signal2'?'bold 14px':'bold 13px')+' system-ui';ctx.textAlign='right';ctx.fillText(signalLabel(m),Math.min(w-pad.r+8,xr(end)+2),short?yb-4:yb+14);ctx.textAlign='left';
  ctx.beginPath();ctx.arc(xr(end),yb,2.8,0,Math.PI*2);ctx.fill();});
 // 내 주문
 (s.events||[]).filter(e=>e.type==='open'||e.type==='close').forEach(e=>{const i=list.findIndex(b=>e.time>=b.time&&e.time<b.time+300);if(i<0)return;const entry=e.type==='open',price=entry?e.price:e.exitPrice;ctx.fillStyle=entry?(e.side==='long'?LONG:SHORT):GOLD;ctx.beginPath();ctx.arc(x(i),y(price),4.5,0,Math.PI*2);ctx.fill();ctx.font='bold 12px system-ui';ctx.fillText(entry?(e.side==='long'?'롱':'숏'):'청산',Math.max(pad.l,Math.min(w-pad.r-28,x(i)-10)),Math.max(pad.t+12,Math.min(h-pad.b-6,y(price)+(entry?20:-10))));});
 if(pos){const mark=(v,label,color)=>{ctx.strokeStyle=color;ctx.setLineDash([4,3]);ctx.beginPath();ctx.moveTo(pad.l,y(v));ctx.lineTo(w-pad.r,y(v));ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=color;ctx.font='11px system-ui';ctx.fillText(label+' '+v.toFixed(2),pad.l+5,y(v)-5);};mark(pos.entryPrice,'진입',GOLD);if(activeSettings.stopLossPct>0)mark(pos.entryPrice*(1+(pos.side==='long'?-1:1)*activeSettings.stopLossPct/100),'손절',SHORT);if(activeSettings.takeProfitPct>0)mark(pos.entryPrice*(1+(pos.side==='long'?1:-1)*activeSettings.takeProfitPct/100),'익절',LONG);}
 ctx.restore();
 // 현재 시각 선 + 날짜
 ctx.strokeStyle='#d6a447';ctx.setLineDash([2,4]);ctx.beginPath();ctx.moveTo(xr(list.length-1),pad.t);ctx.lineTo(xr(list.length-1),h-pad.b);ctx.stroke();ctx.setLineDash([]);
 ctx.fillStyle='#94a3b7';ctx.font='11px system-ui';ctx.fillText(clockLabel(list[0].time),pad.l,h-8);ctx.textAlign='right';ctx.fillText(clockLabel(s.clock)+' ▶',w-pad.r,h-8);ctx.textAlign='left';
 return {list,xl,xr,x,pad,capacity};
}

// ---- 하단 패널: RSI / MACD (1시간 값, 같은 시간축) ----
function drawPane(s,geo){
 const panes=['rsi','macd'].filter(k=>enabled(k)),c=$('pane-chart');c.hidden=!panes.length;if(!panes.length||!geo)return;
 const {ctx,w,h}=prepare('pane-chart',panes.length*150),{list,xl,xr,pad,capacity}=geo,ph=h/panes.length,hourOf=b=>hourKnownAt(b.time),latest=hourKnownAt(s.clock);
 panes.forEach((key,p)=>{const top=p*ph,pt={l:pad.l,r:pad.r,t:top+16,b:h-(top+ph-22)},ch=ph-38;
  ctx.strokeStyle='#293342';ctx.beginPath();ctx.moveTo(pad.l,top);ctx.lineTo(w-pad.r,top);ctx.stroke();
  if(key==='rsi'){const y=v=>pt.t+(100-v)/100*ch;ctx.font='11px system-ui';[30,50,70].forEach(g=>{ctx.strokeStyle=g===50?'#3a4656':'#2b3645';ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(pad.l,y(g));ctx.lineTo(w-pad.r,y(g));ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#94a3b7';ctx.fillText(String(g),w-pad.r+6,y(g)+4);});
   stepLine(ctx,list,xl,xr,y,b=>valueAt('rsi','heikin',hourOf(b)),'#b7a6ff',1,[3,3],valueAt('rsi','heikin',latest));stepLine(ctx,list,xl,xr,y,b=>valueAt('rsi','candle',hourOf(b)),'#8fb4ff',1.8,[],valueAt('rsi','candle',latest));
   if(enabled('sigRsi')){const byTime=new Map(list.map((b,i)=>[b.time,i]));visibleMarkers(s).filter(m=>m.source==='rsi_signal').forEach(m=>{const end=byTime.get(m.time+3300);if(end===undefined)return;const v=valueAt('rsi','candle',m.time),short=signalSide(m)==='short';const yy=Number.isFinite(v)?y(v):y(50);ctx.fillStyle=short?SHORT:LONG;ctx.beginPath();ctx.arc(xr(end),yy,4,0,Math.PI*2);ctx.fill();ctx.font='bold 11px system-ui';ctx.textAlign='center';ctx.fillText(m.signal,xr(end),yy+(short?-8:16));ctx.textAlign='left';});}
   ctx.fillStyle='#b8c4d4';ctx.font='12px system-ui';ctx.fillText('RSI · 1시간 보관값 (실선 캔들 / 점선 하이킨)',pad.l+6,top+13);}
  if(key==='macd'){const vals=[];list.forEach(b=>{const r=rowAt('macd',hourOf(b));if(r)vals.push(r.macd,r.blue,r.orange);});const r2=rowAt('macd',latest);if(r2)vals.push(r2.macd,r2.blue,r2.orange);const nums=vals.filter(Number.isFinite);const lo=Math.min(0,...nums),hi=Math.max(0,...nums),pd=(hi-lo||1)*.12,y=v=>pt.t+(hi+pd-v)/(hi-lo+2*pd)*ch;
   ctx.strokeStyle='#45515d';ctx.beginPath();ctx.moveTo(pad.l,y(0));ctx.lineTo(w-pad.r,y(0));ctx.stroke();
   list.forEach((b,i)=>{const r=rowAt('macd',hourOf(b));if(!r||!Number.isFinite(r.macd))return;ctx.fillStyle=r.macd>=0?(r.color==='UP'?'#22AB94':'#ACE5DC'):(r.color==='UP'?'#FF5252':'#FCCBCD');ctx.fillRect(xl(i),Math.min(y(0),y(r.macd)),Math.max(1,(xr(i)-xl(i))*.8),Math.max(1,Math.abs(y(r.macd)-y(0))));});
   stepLine(ctx,list,xl,xr,y,b=>valueAt('macd','blue',hourOf(b)),'#2196f3',1.4,[],valueAt('macd','blue',latest));stepLine(ctx,list,xl,xr,y,b=>valueAt('macd','orange',hourOf(b)),'#ff8d31',1.4,[],valueAt('macd','orange',latest));
   ctx.fillStyle='#94a3b7';ctx.font='11px system-ui';ctx.fillText(fmt(hi),w-pad.r+6,pt.t+4);ctx.fillText(fmt(lo),w-pad.r+6,pt.t+ch);ctx.fillStyle='#b8c4d4';ctx.font='12px system-ui';ctx.fillText('MACD · 1시간 보관값',pad.l+6,top+13);}
  ctx.strokeStyle='#d6a447';ctx.setLineDash([2,4]);ctx.beginPath();ctx.moveTo(xr(list.length-1),top+2);ctx.lineTo(xr(list.length-1),top+ph-2);ctx.stroke();ctx.setLineDash([]);});
}

// ---- 1시간 봉 차트(보관 가격·GOYA·신호) — 선택해서 펼쳐 봄 ----
function drawHour(s){
 if(!$('hour-details').open)return;const bars=s.visible1h||[],{ctx,w,h}=prepare('hour-chart'),pad={l:8,r:68,t:12,b:30},cw=w-pad.l-pad.r,ch=h-pad.t-pad.b,capacity=Math.min(48,Math.max(1,bars.length)),list=bars.slice(-capacity);
 if(!list.length){ctx.fillStyle='#aebccc';ctx.font='14px system-ui';ctx.fillText('첫 1시간 봉이 마감하면 표시됩니다.',15,45);return;}
 const values=list.flatMap(b=>[b.low,b.high,...(Number.isFinite(b.goya)?[b.goya]:[])]);let lo=Math.min(...values),hi=Math.max(...values);const margin=(hi-lo||hi*.01)*.1;lo-=margin;hi+=margin;const y=v=>pad.t+(hi-v)/(hi-lo)*ch,dx=cw/capacity,x=i=>pad.l+(i+.5)*dx;
 axis(ctx,w,pad,lo,hi,y,2);
 list.forEach((b,i)=>{const color=b.close>=b.open?LONG:SHORT;ctx.strokeStyle=color;ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(x(i),y(b.high));ctx.lineTo(x(i),y(b.low));ctx.stroke();ctx.fillRect(x(i)-Math.max(1,dx*.3),Math.min(y(b.open),y(b.close)),Math.max(2,dx*.6),Math.max(1,Math.abs(y(b.close)-y(b.open))));});
 ctx.strokeStyle='#e46eb5';ctx.setLineDash([5,4]);ctx.beginPath();let started=false;list.forEach((b,i)=>{if(!Number.isFinite(b.goya)){started=false;return;}if(started)ctx.lineTo(x(i),y(b.goya));else ctx.moveTo(x(i),y(b.goya));started=true;});ctx.stroke();ctx.setLineDash([]);
 const grouped=new Map();visibleMarkers(s).filter(m=>sourceEnabled(m.source)&&m.source!=='rsi_signal').forEach(sig=>{const i=list.findIndex(b=>b.time===sig.time);if(i<0)return;if(!grouped.has(i))grouped.set(i,[]);const label=signalLabel(sig);if(!grouped.get(i).includes(label))grouped.get(i).push(label);});
 ctx.font='bold 11px system-ui';grouped.forEach((labels,i)=>labels.forEach((label,j)=>{const short=/^S/.test(label);ctx.fillStyle=short?SHORT:LONG;const yy=Math.max(15,Math.min(h-38,y(short?list[i].high:list[i].low)+(short?-12:18)+j*14));ctx.fillText(label,x(i)-7,yy);}));
 ctx.strokeStyle='#d6a447';ctx.setLineDash([2,4]);ctx.beginPath();ctx.moveTo(x(list.length-1),pad.t);ctx.lineTo(x(list.length-1),h-pad.b);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#94a3b7';ctx.font='11px system-ui';ctx.fillText(clockLabel(list[0].time),pad.l,h-8);ctx.textAlign='right';ctx.fillText(clockLabel(list[list.length-1].time)+' 마감',w-pad.r,h-8);ctx.textAlign='left';
}

// ---- 확정값 읽기(글자로) ----
function studyValuesText(s){
 const latest=hourKnownAt(s.clock);if(!Number.isFinite(latest)||latest<(data.bars1h[0]||{}).time)return '아직 마감한 1시간 봉이 없습니다.';
 const parts=[];const add=(key,label,fields)=>{if(!enabled(key))return;const r=rowAt(key,latest);if(!r){parts.push(label+' 자료 없음');return;}parts.push(label+' '+fields.map(([f,n])=>(n?n+' ':'')+fmt(r[f])).join(' / '));};
 add('goya','GOYA',[['goya','']]);add('smartChannel','Smart',[['upper','상단'],['lower','하단'],['first','첫째'],['middle','중간']]);add('smartLine','Smart Line',[['value','']]);add('premiumChannel','Premium',[['highestHigh','최고'],['secondHighestClose','둘째고'],['upperLine','바깥上'],['lowestLow','최저'],['secondLowestClose','둘째저'],['lowerLine','바깥下']]);add('ma','3MA',[['ma1','7'],['ma2','20'],['ma3','60']]);add('bb','BB',[['upper','상'],['lower','하']]);add('rsi','RSI',[['candle','캔들'],['heikin','하이킨']]);add('macd','MACD',[['macd','막대'],['blue','파랑'],['orange','주황']]);
 const next=time(latest+7200).slice(11);return '확정된 1시간 값 — '+clockLabel(latest)+' 봉 마감 기준 · 다음 갱신 '+next+' 마감 후'+(parts.length?' ▸ '+parts.join(' · '):' ▸ 켜진 지표 없음');
}

function render(){
 const s=model.snapshot();$('clock').textContent=time(s.clock);
 ['realized','unrealized','equity','fees'].forEach(k=>{const v=s.account[{realized:'realizedNet',unrealized:'unrealized',equity:'equity',fees:'fees'}[k]];$(k).textContent=money(v);$(k).className=k==='realized'||k==='unrealized'?(v>0?'positive':v<0?'negative':''):'';});
 $('position').textContent=s.position?(s.position.side==='long'?'롱':'숏')+' · 진입 '+s.position.entryPrice.toFixed(2)+' · '+time(s.position.entryTime)+' KST':'열린 포지션 없음';
 $('pending').textContent=s.pending?'다음 5분 시가 체결 대기: '+({long:'롱 진입',short:'숏 진입',close:'포지션 청산'}[s.pending.side]||s.pending.side):'대기 주문 없음';
 $('status').textContent=s.error||(s.ended?'자료 끝에 도달했습니다. 열린 포지션의 평가손익은 실현 손익과 구분됩니다.':'현재까지 공개된 봉에서 주문할 수 있습니다.');
 $('play').disabled=$('step').disabled=s.ended;['long','short'].forEach(k=>$(k).disabled=s.ended||!!s.pending||!!s.position);$('close').disabled=s.ended||!!s.pending||!s.position;$('cancel').disabled=!s.pending;
 const marks=visibleMarkers(s).filter(m=>sourceEnabled(m.source));$('signals').textContent=marks.length?'최근 확인 신호: '+marks.slice(-4).map(a=>clockLabel(a.time+3600)+' 마감 '+signalLabel(a)).join(' · '):'확인된 신호 없음';
 $('study-values').textContent=studyValuesText(s);
 const geo=drawMain(s);drawPane(s,geo);drawHour(s);
 const ev=s.events||[];$('events').replaceChildren();if(!ev.length){const li=document.createElement('li');li.textContent='체결된 주문이 없습니다.';$('events').append(li);}else ev.slice(-30).reverse().forEach(e=>{const li=document.createElement('li');li.textContent=time(e.time||e.requestedAt)+' KST · '+({open:'진입 체결',close:'청산 체결',queued:'주문 대기'}[e.type]||e.type||'거래')+' · '+(e.side||'')+(e.type==='close'?' · 진입 '+Number(e.entryPrice).toFixed(2)+' → 청산 '+Number(e.exitPrice).toFixed(2)+' · 순손익 '+money(e.net):e.price?' · 가격 '+Number(e.price).toFixed(2):'')+(e.reason?' · '+e.reason:'');$('events').append(li);});
 if(ev.length>lastEvents&&ev.slice(lastEvents).some(e=>e.type==='open'||e.type==='close')){const p=$('five-chart').parentElement;p.classList.remove('fill-flash');void p.offsetWidth;p.classList.add('fill-flash');}lastEvents=ev.length;
}

for(let n=2;n<=10;n++){const o=document.createElement('option');o.value=n;o.textContent=n+'배';$('leverage').append(o);}$('leverage').value='3';
$('play').onclick=()=>timer?stop():start();$('step').onclick=()=>{stop();advance();};$('speed').onchange=()=>{if(timer)start();};$('range').onchange=()=>{saveStudies();if(model)render();};$('hour-details').addEventListener('toggle',()=>{saveStudies();if(model)render();});
['long','short','close'].forEach(k=>$(k).onclick=()=>{stop();model.order(k);render();save();});
$('restart').onclick=()=>{const s=settings();if(!(s.allocationPct>=1&&s.allocationPct<=100&&s.stopLossPct>0&&s.stopLossPct<=50&&s.takeProfitPct>=0&&s.takeProfitPct<=50)){$('status').textContent='증거금 1~100%, 손절 0 초과~50%, 익절 0~50%를 입력하세요.';return;}stop();try{activeSettings=s;model=window.GoyaManualReplay.create({...data,settings:s,startIndex:(Number.isInteger(data.startIndex)?data.startIndex:Math.min(287,data.bars5m.length-1))});lastEvents=0;render();save();}catch(e){$('status').textContent=e.message;}};
$('cancel').onclick=()=>{stop();model.cancelPending();render();save();};
window.addEventListener('resize',()=>{if(model)render();});
(async()=>{try{let bytes;if(typeof window.cbLoadJSON==='function')bytes=await window.cbLoadJSON('replay-data/zec-replay.json');else{const r=await fetch('replay-data/zec-replay.json');if(!r.ok)throw Error('같은 기간의 검증된 재생 자료가 아직 없습니다 (HTTP '+r.status+').');bytes=new Uint8Array(await r.arrayBuffer());}
 data=JSON.parse(new TextDecoder().decode(bytes));if(!data.datasetId||!Array.isArray(data.bars5m)||!data.bars5m.length||!Array.isArray(data.bars1h)||!data.bars1h.length)throw Error('재생 자료의 식별자 또는 가격 봉이 누락되었습니다.');if(!window.GoyaManualReplay||!window.GoyaManualReplay.hourKnownAt)throw Error('재생 계산기를 불러오지 못했습니다.');
 indexStudies();STUDIES.forEach(st=>studyState[st.key]=st.on);if(window.innerWidth<600)$('range').value='72';try{const sv=JSON.parse(localStorage.getItem(STUDY_KEY));if(sv&&sv.state)Object.assign(studyState,sv.state);if(sv&&sv.range)$('range').value=sv.range;if(sv&&sv.hour)$('hour-details').open=true;}catch(_){}
 buildToggles();
 const st=data.studies;$('source-title').textContent=data.symbol+' · '+data.market;$('source-info').textContent='가격: '+data.source.price+' / 신호: '+(data.source.ex||'보관 신호')+(st?' / 1시간 지표: 보관 원문 '+st.source.files.length+'개('+st.source.capturedKST+' KST 저장, 자료 '+time(st.coverage.smartChannel.from)+'~'+time(st.coverage.smartChannel.to)+')':' / 1시간 지표 자료 없음')+' · 연습 구간 '+time(data.period.start)+' ~ '+time(data.period.endExclusive)+' KST (끝 제외)';
 activeSettings=settings();let restore;try{const saved=JSON.parse(localStorage.getItem(KEY));if(saved&&saved.datasetId===data.datasetId){activeSettings=saved.settings;restore=saved.modelState;applySettings(activeSettings);}}catch(_){}
 model=window.GoyaManualReplay.create({...data,settings:activeSettings,startIndex:(Number.isInteger(data.startIndex)?data.startIndex:Math.min(287,data.bars5m.length-1)),restore});$('restart').disabled=false;
 $('costs').textContent='초기 10,000 USDT · 수수료 편도 0.04% · 슬리피지 편도 0.02% · 펀딩비 제외. 손절·익절 동시 도달 봉은 손절 우선이며, 강제청산은 계산하지 않아 실제 선물 거래의 손익과 다를 수 있습니다. 반대 신호 청산은 LL/SS·L2/S2만 사용하며 지표 표시를 켜고 꺼도 바뀌지 않습니다.';
 render();}catch(e){stop();$('status').textContent='재생을 시작할 수 없습니다: '+e.message;$('source-info').textContent='검증된 원본 자료가 준비된 뒤 다시 열어 주세요. 기존 학습 기록은 유지됩니다.';}})();
})();
