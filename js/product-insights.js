/* Category-level portfolio composition and annual effect. */
const ProductInsights = (() => {
  const $ = Utils.$;
  let selected = null, open = false;
  const palette = ['#3978d5','#20a17a','#e3a23b','#8b72cf','#d46b78','#4b9cae','#8b9aa9'];
  function icon(g,size=15){ return Utils.iconSvg(g.icon,size,'insight-icon'); }
  function value(p){return p.type==='expense'?0:p.type==='investment'?Simulator.portfolioValue(p):Math.abs(Number(p.amount)||0);}
  function annual(p){ return Simulator.annualNet(p); }
  function groups(){
    const m=new Map();
    Storage.all().forEach(p=>{if(p.offBudget===true)return;const v=value(p),t=Config.TYPES[p.type];if(!v||!t)return;
      if(!m.has(p.type))m.set(p.type,{type:p.type,label:t.label,icon:t.icon,value:0,products:[],annual:0});
      const g=m.get(p.type);g.value+=v;g.products.push(p);g.annual+=annual(p);
    });
    return [...m.values()].sort((a,b)=>b.value-a.value);
  }
  function draw(data){
    const c=$('portfolioDonut');if(!c)return;const r=c.getBoundingClientRect(),dpr=devicePixelRatio||1;
    c.width=Math.max(1,r.width*dpr);c.height=Math.max(1,r.height*dpr);const x=c.getContext('2d');x.scale(dpr,dpr);
    const cx=r.width/2,cy=r.height/2,rad=Math.min(r.width,r.height)*.43,inner=rad*.62,total=data.reduce((s,g)=>s+g.value,0);let a=-Math.PI/2;
    data.forEach((g,i)=>{const n=a+(total?g.value/total:0)*Math.PI*2;x.beginPath();x.arc(cx,cy,rad,a,n);x.arc(cx,cy,inner,n,a,true);x.closePath();x.globalAlpha=(selected && selected!==g.type) ? 0.22 : 1;x.fillStyle=palette[i%palette.length];x.fill();x.globalAlpha=1;a=n;});
    if(!total){x.fillStyle='#94a3b8';x.font='12px sans-serif';x.textAlign='center';x.fillText('Нет данных',cx,cy);}
    c.onclick=ev=>{const b=c.getBoundingClientRect(),dx=ev.clientX-b.left-cx,dy=ev.clientY-b.top-cy,dist=Math.hypot(dx,dy);if(dist<inner||dist>rad)return;
      let a=Math.atan2(dy,dx)+Math.PI/2;if(a<0)a+=Math.PI*2;let cur=0;
      for(const g of data){const part=total?g.value/total*Math.PI*2:0;if(a>=cur&&a<cur+part){selected=selected===g.type?null:g.type;render();return;}cur+=part;}
    };
  }
  function render(){
    const panel=$('portfolioInsights');if(!panel)return;panel.hidden=!open;if(!open)return;
    const data=groups(),total=data.reduce((s,g)=>s+g.value,0),active=data.find(g=>g.type===selected);
    $('portfolioLegend').innerHTML=data.map((g,i)=>`<button type="button" class="portfolio-legend-item ${selected&&selected!==g.type?'dimmed':''} ${selected===g.type?'chosen':''}" data-insight-type="${g.type}"><i style="--slice:${palette[i%palette.length]}"></i><span>${icon(g)} ${Utils.escapeHtml(g.label)}</span><b>${(g.value/Math.max(total,1)*100).toFixed(1)}%</b></button>`).join('')||'<div class="empty">Пока нечего распределять</div>';
    $('portfolioLegend').querySelectorAll('[data-insight-type]').forEach(b=>b.onclick=()=>{selected=selected===b.dataset.insightType?null:b.dataset.insightType;render();});
    $('portfolioDetails').innerHTML=active?`<div class="insight-detail-head"><b>${icon(active,17)} ${Utils.escapeHtml(active.label)}</b><span>${Utils.fmtMoney(active.value)} · ${(active.value/Math.max(total,1)*100).toFixed(1)}%</span></div>`+active.products.map(p=>{const v=value(p),y=annual(p),pct=v?y/v*100:0;return `<div class="insight-product"><div><b>${Utils.escapeHtml(p.name)}</b><small>${Utils.fmtMoney(v)} · ${pct>=0?'+':''}${pct.toFixed(2)}%/год</small></div><strong class="${y>=0?'green':'red'}">${y>=0?'+':'−'}${Utils.fmtMoney(Math.abs(y))}/год</strong></div>`;}).join(''):`<div class="insight-detail-head"><b>Весь портфель</b><span>${Utils.fmtMoney(total)}</span></div>`+data.map(g=>`<div class="insight-product"><div><b>${icon(g,16)} ${Utils.escapeHtml(g.label)}</b><small>${g.products.length} продукт(а) · ${(g.value/Math.max(total,1)*100).toFixed(1)}%</small></div><strong class="${g.annual>=0?'green':'red'}">${g.annual>=0?'+':'−'}${Utils.fmtMoney(Math.abs(g.annual))}/год</strong></div>`).join('');
    draw(data);
  }
  function init(){
    const b=$('portfolioChartBtn');if(!b)return;
    b.onclick=()=>{open=!open;if(!open)selected=null;b.setAttribute('aria-expanded',String(open));render();};
    const close=$('portfolioInsightClose');if(close)close.onclick=()=>{open=false;selected=null;b.setAttribute('aria-expanded','false');render();};
    window.addEventListener('dataSaved',()=>{if(open)render();});
    window.addEventListener('resize',()=>{if(open)render();});
    render();
  }
  return {init,render};
})();