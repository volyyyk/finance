// Cloudflare Worker: narrow CORS bridge for public MOEX ISS GET requests.
// Upstream errors are returned with their real status and a bounded diagnostic body.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Accept',
  'Access-Control-Expose-Headers': 'X-MOEX-Upstream-Status',
  'Access-Control-Max-Age': '86400'
};

const jsonResponse = (payload, status, extra = {}) => new Response(JSON.stringify(payload), {
  status,
  headers: {
    ...CORS_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extra
  }
});

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const VIM_FUNDS = {
  '8000': { url:'https://www.wealthim.ru/products/pif/opif/wimyao/', graphId:'37558764' },
  '8002': { url:'https://www.wealthim.ru/products/pif/opif/wimyo/', graphId:'37558766' }
};

// Read official JavaScript GRAPH records without evaluating page scripts.
// Parse the official history table rendered on each fund page.
// The table is a first-party fallback when the chart's JS data is not embedded in HTML.
function parseVimTable(html) {
  const clean = value => String(value || '')
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;|&#xA0;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ').trim();
  const numeric = value => {
    const normalized = clean(value).replace(/\s/g, '').replace(',', '.').replace(/[^0-9.+-]/g, '');
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
  };
  for (const tableMatch of html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    const table = tableMatch[1];
    const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(row =>
      [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell => clean(cell[1]))
    );
    const headerIndex = rows.findIndex(cells => cells.some(x => /дата/i.test(x)) && cells.some(x => /стоимость пая/i.test(x)));
    if (headerIndex < 0) continue;
    const history = [];
    for (const cells of rows.slice(headerIndex + 1)) {
      const dateText = cells.find(x => /^\d{2}\.\d{2}\.\d{4}$/.test(x));
      if (!dateText) continue;
      const dateParts = dateText.split('.');
      const date = dateParts[2] + '-' + dateParts[1] + '-' + dateParts[0];
      const priceIndex = cells.findIndex(x => /^\d[\d\s]*(?:[.,]\d+)?$/.test(x) && Number(x.replace(/\s/g, '').replace(',', '.')) > 0);
      if (priceIndex < 0) continue;
      const price = numeric(cells[priceIndex]);
      const nav = numeric(cells[priceIndex + 2]);
      if (!(price > 0)) continue;
      history.push({ date, price, nav: nav > 0 ? nav : null });
    }
    const unique = [...new Map(history.map(point => [point.date, point])).values()]
      .sort((a,b) => a.date.localeCompare(b.date));
    if (unique.length) return unique;
  }
  return null;
}

// Collect the history table and its Bitrix pagination links from the official fund page.
function parseVimHistoryPage(html) {
  const clean = value => String(value || '')
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;|&#xA0;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ').trim();
  const points = parseVimTable(html) || [];
  const links = [];
  const tableAt = html.indexOf('id="table"');
  const paginationAt = tableAt >= 0 ? html.indexOf('bx_pagination_bottom', tableAt) : html.indexOf('bx_pagination_bottom');
  if (paginationAt >= 0) {
    const block = html.slice(paginationAt, paginationAt + 16000);
    for (const match of block.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)) {
      const href = match[1].replace(/&amp;/g, '&');
      if (/PAGEN_\d+=\d+/.test(href)) links.push(href);
    }
  }
  return { points, links: [...new Set(links)] };
}

function parseVimGraph(html, rulesNumber) {
  const fund = VIM_FUNDS[rulesNumber];
  if (!fund) return null;
  const graphFundsAt = html.indexOf('GRAPH_FUNDS');
  const graphAt = html.indexOf("'GRAPH'");
  if (graphFundsAt < 0 || graphAt < 0) return null;
  const graphFundsBlock = html.slice(graphFundsAt, graphAt);
  if (!graphFundsBlock.includes("'" + fund.graphId + "'")) return null;
  const records = [];
  const recordPattern = /\{[^{}]*['"]?DATE_ACTIVE_FROM['"]?\s*:\s*['"]([^'"]+)['"][^{}]*\}/g;
  for (const match of html.slice(graphAt).matchAll(recordPattern)) {
    const block = match[0];
        const trust = (block.match(/['"]?UNIT_TRUST['"]?\s*:\s*['"]([^'"]+)['"]/) || [])[1];
    if (trust !== fund.graphId) continue;
    const dateText = match[1];
        const priceText = (block.match(/['"]?SHARE_COST['"]?\s*:\s*['"]([^'"]+)['"]/) || [])[1];
        const navText = (block.match(/['"]?NET_ASSET_COST['"]?\s*:\s*['"]([^'"]+)['"]/) || [])[1];
    if (!/^\d{2}\.\d{2}\.\d{4}$/.test(dateText)) continue;
    const parts = dateText.split('.');
    const price = Number(priceText);
    const nav = Number(navText);
    if (!Number.isFinite(price) || price <= 0) continue;
    records.push({ date:parts[2]+'-'+parts[1]+'-'+parts[0], price, nav:Number.isFinite(nav)?nav:null });
  }
  const unique = [...new Map(records.map(point=>[point.date,point])).values()].sort((a,b)=>a.date.localeCompare(b.date));
  return unique.length ? unique : null;
}



// Extract the actual controls and inline behavior of the VIM history form.
// Keep this diagnostic bounded and avoid returning chart SVG markup.
function extractVimFormDiagnostics(html) {
  const clean = value => String(value || '').replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/\s+/g, ' ').trim();
  const readAttrs = source => {
    const attrs = {};
    for (const m of source.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? '';
    return attrs;
  };
  const forms = [];
  for (const m of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
    const attrs = readAttrs(m[1]), body = m[2];
    if (!/fund|chart|date|period|quote|history|filter|export/i.test(m[1] + ' ' + body.slice(0, 2500))) continue;
    const controls = [];
    for (const c of body.matchAll(/<(input|select|option|button|textarea)\b([^>]*)>(?:([\s\S]*?)<\/\1>)?/gi)) {
      const a = readAttrs(c[2] || '');
      controls.push({tag:c[1].toLowerCase(),type:a.type||null,name:a.name||null,id:a.id||null,value:a.value||null,className:a.class||null,text:clean(c[3]||'').slice(0,180),disabled:/\bdisabled\b/i.test(c[2]),selected:/\bselected\b/i.test(c[2])});
    }
    forms.push({attributes:attrs,controls:controls.slice(0,160),text:clean(body).slice(0,5000)});
  }
  const selects = [];
  for (const m of html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi)) {
    const a=readAttrs(m[1]), body=m[2];
    const options=[...body.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)].map(o=>{
      const optionAttrs=readAttrs(o[1]);
      return {value:optionAttrs.value??null,text:clean(o[2]),selected:/\bselected\b/i.test(o[1]),disabled:/\bdisabled\b/i.test(o[1])};
    });
    selects.push({name:a.name||null,id:a.id||null,className:a.class||null,options:options.slice(0,100)});
  }
  const inlineScripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .map(m=>({attributes:m[1].slice(0,300),length:m[2].length,code:m[2].slice(0,12000)}))
    .filter(x=>/fund|chart|date|period|quote|history|download|export|ajax|filter|table/i.test(x.code))
    .slice(0,20);
  const eventHandlers=[...html.matchAll(/\b(on(?:click|change|submit|load))=["']([^"']+)["']/gi)]
    .map(m=>({event:m[1],handler:m[2].slice(0,500)})).slice(0,100);
  return {forms,selects,inlineScripts,eventHandlers};
}
export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    if (incoming.pathname.startsWith('/vim-debug/')) {
      if (request.method === 'OPTIONS') return new Response(null, { status:204, headers:CORS_HEADERS });
      if (request.method !== 'GET') return jsonResponse({ error:'Method not allowed' },405);
      const fundId = incoming.pathname.split('/')[2];
      const pages = {
        '8000':'https://www.wealthim.ru/products/pif/opif/wimyao/',
        '8002':'https://www.wealthim.ru/products/pif/opif/wimyo/'
      };
      const sourceUrl = pages[fundId];
      if (!sourceUrl) return jsonResponse({ error:'Unknown VIM fund' },404);
      try {
        const upstream = await fetch(sourceUrl, {
          headers:{ Accept:'text/html,application/xhtml+xml', 'User-Agent':'Mozilla/5.0 FinApp/1.0' },
          cf:{ cacheEverything:true, cacheTtl:300 }
        });
        if (!upstream.ok) return jsonResponse({error:'VIM HTTP '+upstream.status},upstream.status);
        const html = await upstream.text();
        const contexts = [];
        for (const token of ['download.php','FOND_ID','QUOTES_IBLOCK','chart','history','quotes','ajax','series']) {
          let at=-1, count=0;
          while ((at=html.toLowerCase().indexOf(token.toLowerCase(),at+1))>=0 && count<3) {
            contexts.push({token, snippet:html.slice(Math.max(0,at-220),Math.min(html.length,at+420)).replace(/\s+/g,' ')});
            count++;
          }
        }
        const scriptTags = [...html.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi)].slice(0,30).map(m=>m[0].slice(0,1800));
        const scripts = [...html.matchAll(/<script\b[^>]*src=["']([^"']+)["'][^>]*>/gi)].map(m=>m[1]).slice(0,80);
        const assets = [...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|mjs)(?:\?[^"']*)?)["']/gi)].map(m=>m[1]).slice(0,100);
        const tables = [...html.matchAll(/<table\b[^>]*>/gi)].map(m=>m[0]).slice(0,20);
        const chartAt = html.indexOf('pif_bay-chart--wrapper');
        const chartBlock = chartAt >= 0 ? html.slice(Math.max(0, chartAt - 1200), Math.min(html.length, chartAt + 18000)).replace(/\s+/g,' ') : null;
        const formAt = html.indexOf('class="funds_list"');
        const formBlock = formAt >= 0 ? html.slice(formAt, Math.min(html.length, formAt + 30000)).replace(/\s+/g,' ') : null;
        const htmlTail = html.slice(Math.max(0, html.length - 18000)).replace(/\s+/g,' ');
        const formTags = [...html.matchAll(/<(?:form|input|select|option|button|a)\b[^>]*>/gi)].map(m=>m[0]).filter(tag=>/funds_list|period|date|fond|export|download|xlsx|html|ajax|chart|submit/i.test(tag)).slice(0,240);
        const resourceRefs = [...new Set([...html.matchAll(/(?:src|href|action)=["']([^"']+)["']/gi)].map(m=>m[1]).filter(x=>/\.(?:js|mjs|css)(?:[?#]|$)|ajax|api|chart|quote|history|download|export|xlsx/i.test(x)))].slice(0,160);
        const dataAttrs = [...html.matchAll(/\bdata-[\w:-]+=["'][^"']*["']/gi)].map(m=>m[0]).slice(0,160);
        const endpoints = [...new Set((html.match(/[^"'\s<>]*(?:ajax|api|chart|quote|history|download|export|xlsx)[^"'\s<>]*/gi)||[]).filter(x=>x.length<500))].slice(0,160);
        const keywordContexts = [];
        for (const token of ['date-choice','form-to-filter','period','fondTableModal','chartBlock','ajax','DATE_ACTIVE_FROM','SHARE_COST','GRAPH','FOND_ID','QUOTES_IBLOCK','Экспорт в xlsx','download.php']) {
          const at = html.toLowerCase().indexOf(token.toLowerCase());
          if (at >= 0) keywordContexts.push({token,snippet:html.slice(Math.max(0,at-450),Math.min(html.length,at+2600)).replace(/\s+/g,' ')});
        }
        const formDiagnostics = extractVimFormDiagnostics(html);
        return jsonResponse({formDiagnostics,sourceUrl,htmlLength:html.length,title:(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||null,scripts,assets,scriptTags,tables,dataAttrs,endpoints,resourceRefs,formTags,chartBlock,formBlock,htmlTail,keywordContexts,contexts:contexts.slice(0,30)},200);
      } catch(error) {
        return jsonResponse({error:'VIM debug request failed',detail:String(error?.message||error).slice(0,200)},502);
      }
    }
    if (incoming.pathname.startsWith('/vim-assets-debug/')) {
      if (request.method === 'OPTIONS') return new Response(null, { status:204, headers:CORS_HEADERS });
      if (request.method !== 'GET') return jsonResponse({error:'Method not allowed'},405);
      const fundId = incoming.pathname.split('/')[2];
      const pages = {
        '8000':'https://www.wealthim.ru/products/pif/funds_dinamic_gr/',
        '8002':'https://www.wealthim.ru/products/pif/funds_dinamic_gr/'
      };
      const sourceUrl = pages[fundId];
      if (!sourceUrl) return jsonResponse({error:'Unknown VIM fund'},404);
      try {
        const page = await fetch(sourceUrl,{headers:{Accept:'text/html,application/xhtml+xml','User-Agent':'Mozilla/5.0 FinApp/1.0'}});
        if (!page.ok) return jsonResponse({error:'VIM HTTP '+page.status},page.status);
        const html = await page.text();
        const origin = new URL(sourceUrl).origin;
        const srcs = [...new Set([...html.matchAll(/<script\b[^>]*src=["']([^"']+)["'][^>]*>/gi)].map(m=>new URL(m[1],sourceUrl).toString()).filter(u=>new URL(u).origin===origin))];
        const selected = srcs.slice(0,40);
        const assets = [];
        for (const url of selected) {
          try {
            const r = await fetch(url,{headers:{Accept:'application/javascript,text/javascript,*/*','User-Agent':'Mozilla/5.0 FinApp/1.0'}});
            const body = await r.text();
            const matches = [];
            for (const token of ['download.php','FOND_ID','QUOTES_IBLOCK','chart','history','quotes','ajax','date-choice','funds_list','period','GRAPH_FUNDS','GRAPH','exportTable','set_graph','8000','8002']) {
              let at=-1,count=0;
              while ((at=body.toLowerCase().indexOf(token.toLowerCase(),at+1))>=0 && count<3) {
                matches.push({token,snippet:body.slice(Math.max(0,at-350),Math.min(body.length,at+700)).replace(/\s+/g,' ')});
                count++;
              }
            }
            assets.push({url,status:r.status,length:body.length,matches:matches.slice(0,45)});
          } catch(error) { assets.push({url,error:String(error?.message||error).slice(0,160)}); }
        }
        return jsonResponse({fundId,sourceUrl,pageStatus:page.status,scriptCount:srcs.length,selectedCount:selected.length,assets},200);
      } catch(error) {
        return jsonResponse({error:'VIM asset debug failed',detail:String(error?.message||error).slice(0,200)},502);
      }
    }
    if (incoming.pathname.startsWith('/vim-export-debug/')) {
      if (request.method === 'OPTIONS') return new Response(null, { status:204, headers:CORS_HEADERS });
      if (request.method !== 'GET') return jsonResponse({error:'Method not allowed'},405);
      const fundId = incoming.pathname.split('/')[2];
      const pages = {
        '8000':'https://www.wealthim.ru/products/pif/opif/wimyao/',
        '8002':'https://www.wealthim.ru/products/pif/opif/wimyo/'
      };
      const sourceUrl = pages[fundId];
      if (!sourceUrl) return jsonResponse({error:'Unknown VIM fund'},404);
      try {
        const upstream = await fetch(sourceUrl,{headers:{Accept:'text/html,application/xhtml+xml','User-Agent':'Mozilla/5.0 FinApp/1.0'}});
        if (!upstream.ok) return jsonResponse({error:'VIM HTTP '+upstream.status},upstream.status);
        const html = await upstream.text();
        const clean = value => String(value||'').replace(/<script\b[\s\S]*?<\/script>/gi,' ')
          .replace(/<style\b[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ')
          .replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"')
          .replace(/&#39;|&apos;/gi,"'").replace(/\s+/g,' ').trim();
        const tagAttrs = tag => {
          const attrs={};
          for(const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[m[1].toLowerCase()]=m[2]??m[3]??'';
          return attrs;
        };
        const controls=[];
        for(const m of html.matchAll(/<(a|button|input|form)\b[^>]*>/gi)) {
          const tag=m[0], attrs=tagAttrs(tag), at=m.index;
          const tail=html.slice(at,Math.min(html.length,at+1600));
          const textNear=clean(tail.slice(0,700));
          if(/export|экспорт|xlsx|xls|показать|download|выгруз/i.test(tag+' '+textNear+' '+Object.values(attrs).join(' '))) {
            controls.push({tagName:m[1].toLowerCase(),attributes:attrs,nearbyText:textNear.slice(0,320),html:html.slice(Math.max(0,at-240),Math.min(html.length,at+900))});
          }
        }
        const contexts=[];
        for(const token of ['Экспорт в html','Экспорт в xlsx','xlsx','download','export','Показать','fondTableModal','form-to-filter','date-choice','FOND_ID','37558764','37558766']) {
          let at=-1,count=0;
          while((at=html.toLowerCase().indexOf(token.toLowerCase(),at+1))>=0&&count<5) {
            contexts.push({token,snippet:html.slice(Math.max(0,at-700),Math.min(html.length,at+1500))});
            count++;
          }
        }
        const scriptRefs=[...new Set([...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["'][^>]*>/gi)].map(m=>m[1]))].slice(0,160);
        const formDetails=[...html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)].map(m=>({attributes:tagAttrs('<form '+m[1]+'>'),html:m[2].slice(0,16000),controls:[...m[2].matchAll(/<(input|select|option|button|textarea)\b([^>]*)>/gi)].map(c=>({tag:c[1],attributes:tagAttrs(c[0]),nearby:clean(m[2].slice(c.index, c.index+500)).slice(0,240)})).slice(0,160)})).filter(x=>/fund|chart|date|period|filter/i.test(JSON.stringify(x.attributes)+' '+x.html.slice(0,1000))).slice(0,12);
        const scriptEvidence=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map(m=>({attributes:m[1],length:m[2].length,preview:m[2].slice(0,2000)})).slice(0,40);
        const exportFunctionContexts=[];
        for(const token of ['exportTable','form-to-filter-results-button','date-choice-from','graph_fund','data-default-graph']){let at=-1,n=0;while((at=html.indexOf(token,at+1))>=0&&n<3){exportFunctionContexts.push({token,snippet:html.slice(Math.max(0,at-1200),Math.min(html.length,at+2600))});n++;}}
        const forms=[...html.matchAll(/<form\b[^>]*>/gi)].map(m=>({tag:m[0],attributes:tagAttrs(m[0]),nearby:clean(html.slice(m.index,Math.min(html.length,m.index+3500))).slice(0,1200)})).slice(0,30);
        const anchors=[...html.matchAll(/<a\b[^>]*>/gi)].map(m=>({tag:m[0],attributes:tagAttrs(m[0])})).slice(0,200);
        return jsonResponse({fundId,sourceUrl,pageStatus:upstream.status,htmlLength:html.length,forms,formDetails,scriptRefs,scriptEvidence,exportFunctionContexts,controls:controls.slice(0,80),anchors,contexts:contexts.slice(0,60)},200);
      } catch(error) {
        return jsonResponse({error:'VIM export diagnostics failed',detail:String(error?.message||error).slice(0,200)},502);
      }
    }
    if (incoming.pathname.startsWith('/vim-global-debug/')) {
      if (request.method === 'OPTIONS') return new Response(null, { status:204, headers:CORS_HEADERS });
      if (request.method !== 'GET') return jsonResponse({error:'Method not allowed'},405);
      const fundId = incoming.pathname.split('/')[2];
      if (!['8000','8002'].includes(fundId)) return jsonResponse({error:'Unknown VIM fund'},404);
      const sourceUrl = 'https://www.wealthim.ru/products/pif/funds_dinamic_gr/';
      try {
        const upstream = await fetch(sourceUrl,{headers:{
          Accept:'text/html,application/xhtml+xml',
          'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
          Referer:VIM_FUNDS[fundId].url
        }});
        const html = await upstream.text();
        const refs=[...new Set([...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["'][^>]*>/gi)].map(m=>m[1]))].slice(0,180);
        const tokens=['GRAPH_FUNDS','GRAPH','graph_fund','37558764','37558766','ajax','XMLHttpRequest','fetch(','$.ajax','set_graph','SHARE_COST','DATE_ACTIVE_FROM','exportTable','chart'];
        const contexts=[];
        for(const token of tokens){let at=-1,n=0;while((at=html.toLowerCase().indexOf(token.toLowerCase(),at+1))>=0&&n<4){contexts.push({token,snippet:html.slice(Math.max(0,at-900),Math.min(html.length,at+1800)).replace(/\s+/g,' ')});n++;}}
        const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map(m=>({attrs:m[1],length:m[2].length,code:m[2].slice(0,10000)})).slice(0,60);
        const tables=[...html.matchAll(/<table\b[^>]*>/gi)].map(m=>m[0]).slice(0,30);
        const forms=[...html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)].map((m)=>({attrs:m[1],length:m[2].length,html:m[2].slice(0,18000),controls:[...m[2].matchAll(/<(input|select|button|textarea)\b([^>]*)>/gi)].map(x=>({tag:x[1],attrs:x[2]})).slice(0,150)})).slice(0,20);
        const eventAttrs=[...html.matchAll(/\b(on[a-z]+)\s*=\s*(["'])([\s\S]*?)\2/gi)].map(m=>({event:m[1],code:m[3].slice(0,1000)})).slice(0,100);
        const dataAttrs=[...html.matchAll(/\b(data-[\w:-]+)\s*=\s*(["'])(.*?)\2/gi)].map(m=>({name:m[1],value:m[3].slice(0,500)})).filter(x=>/graph|fund|ajax|url|api|period|date|chart/i.test(x.name+' '+x.value)).slice(0,150);
        const scriptTags=[...html.matchAll(/<script\b[^>]*>/gi)].map(m=>m[0]).slice(0,100);
        const formAt=html.indexOf('id="set_graph"');
        const graphContext=formAt>=0?html.slice(Math.max(0,formAt-12000),Math.min(html.length,formAt+18000)):'';
        return jsonResponse({fundId,sourceUrl,status:upstream.status,htmlLength:html.length,title:(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||null,refs,scripts,scriptTags,forms,eventAttrs,dataAttrs,graphContext,tables,contexts},200);
      } catch(error) {
        return jsonResponse({error:'VIM global graph diagnostics failed',detail:String(error?.message||error).slice(0,240)},502);
      }
    }
    if (incoming.pathname.startsWith('/vim/')) {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
      if (request.method !== 'GET') return jsonResponse({ error: 'Method not allowed' }, 405);
      const fundId = incoming.pathname.split('/')[2];
      const pages = {
        '8000': 'https://www.wealthim.ru/products/pif/opif/wimyao/',
        '8002': 'https://www.wealthim.ru/products/pif/opif/wimyo/'
      };
      const sourceUrl = pages[fundId];
      if (!sourceUrl) return jsonResponse({ error: 'Unknown VIM fund' }, 404);
      try {
        const upstream = await fetch(sourceUrl, {
          headers: { 'Accept': 'text/html,application/xhtml+xml', 'User-Agent': 'Mozilla/5.0 FinApp/1.0' },
          cf: { cacheEverything: true, cacheTtl: 21600 }
        });
        if (!upstream.ok) return jsonResponse({
          error: 'VIM source returned HTTP ' + upstream.status, upstreamStatus: upstream.status
        }, upstream.status);
        const firstHtml = await upstream.text();
        // The official fund history is server-rendered and paginated (20 rows per page).
        // Follow only pagination links found inside that same fund's history table.
        // The history table is returned by Bitrix when its pagination URL is requested.
        // The user previously captured a successful official response for page 2:
        // ?PAGEN_1=2&SIZEN_3=20. Use it as a bootstrap to discover the table pagination.
        const pageTwoUrl = sourceUrl + '?PAGEN_1=2&SIZEN_3=20';
        const seenUrls = new Set([sourceUrl, pageTwoUrl]);
        const queue = [sourceUrl, pageTwoUrl];
        const pointsByDate = new Map();
        let pagesFetched = 0;
        let firstPageLength = firstHtml.length;
        while (queue.length && pagesFetched < 35) {
          const pageUrl = queue.shift();
          let pageHtml;
          if (pageUrl === sourceUrl) {
            pageHtml = firstHtml;
          } else {
            const pageResponse = await fetch(pageUrl, {
              headers: {
                'Accept': 'text/html,application/xhtml+xml',
                'User-Agent': 'Mozilla/5.0 FinApp/1.0',
                'Referer': sourceUrl
              },
              cf: { cacheEverything: true, cacheTtl: 21600 }
            });
            if (!pageResponse.ok) continue;
            pageHtml = await pageResponse.text();
          }
          pagesFetched++;
          const parsed = parseVimHistoryPage(pageHtml);
          for (const point of parsed.points) pointsByDate.set(point.date, point);
          for (const href of parsed.links) {
            try {
              const nextUrl = new URL(href, sourceUrl);
              if (nextUrl.origin !== 'https://www.wealthim.ru' ||
                  nextUrl.pathname !== new URL(sourceUrl).pathname) continue;
              const normalized = nextUrl.toString();
              if (!seenUrls.has(normalized)) {
                seenUrls.add(normalized);
                queue.push(normalized);
              }
            } catch {}
          }
        }
        let history = [...pointsByDate.values()].sort((a,b) => a.date.localeCompare(b.date));
        // Retain the embedded official graph parser as a fallback if the table markup changes.
        if (!history.length) history = parseVimGraph(firstHtml, fundId) || [];
        if (!history.length) return jsonResponse({
          error: 'VIM page loaded, but no official history table was found',
          sourceUrl, htmlLength: firstPageLength, pagesFetched,
          expectedGraphId: VIM_FUNDS[fundId].graphId
        }, 502);
        const latest = history[history.length - 1];
        return jsonResponse({
          fundId, graphFundId: VIM_FUNDS[fundId].graphId, source: sourceUrl,
          fetchedAt: new Date().toISOString(), pagesFetched, historyCount: history.length,
          date: latest.date, price: latest.price, nav: latest.nav, history
        }, 200, { 'Cache-Control': 'public, max-age=300, s-maxage=1800' });
      } catch (error) {
        return jsonResponse({ error: 'VIM source request failed', detail: String(error?.message || error).slice(0, 240) }, 502);
      }
    }
    if (incoming.pathname !== '/iss' && !incoming.pathname.startsWith('/iss/')) {
      return new Response('Not found', { status: 404, headers: CORS_HEADERS });
    }
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
    if (request.method !== 'GET') return jsonResponse({ error: 'Method not allowed' }, 405);

    // Fixed upstream host: this Worker is not an arbitrary open proxy.
    // MOEX ISS data is public; HTTP is used here because MOEX TLS validation
    // currently fails in the Cloudflare Worker runtime (HTTP 526).
    // Do not send credentials, tokens, or private data through this upstream.
    const upstreamUrl = new URL(incoming.pathname + incoming.search, 'http://iss.moex.com');
    let lastFailure = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const upstream = await fetch(upstreamUrl.toString(), {
          headers: { 'Accept': 'application/json' },
          cf: { cacheEverything: true, cacheTtl: 60 }
        });

        if (upstream.ok) {
          const headers = new Headers(upstream.headers);
          for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
          headers.set('Cache-Control', 'public, max-age=30, s-maxage=60');
          headers.set('X-MOEX-Upstream-Status', String(upstream.status));
          return new Response(upstream.body, { status: upstream.status, headers });
        }

        const detail = (await upstream.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 900);
        lastFailure = {
          error: 'MOEX ISS returned HTTP ' + upstream.status,
          upstreamStatus: upstream.status,
          detail: detail || null,
          attempt
        };

        if (attempt < 2 && (upstream.status === 429 || upstream.status >= 500)) {
          await wait(250);
          continue;
        }

        return jsonResponse(lastFailure, upstream.status, {
          'X-MOEX-Upstream-Status': String(upstream.status)
        });
      } catch (error) {
        lastFailure = {
          error: 'MOEX ISS network request failed',
          detail: String(error?.message || error).slice(0, 240),
          attempt
        };
        if (attempt < 2) {
          await wait(250);
          continue;
        }
      }
    }

    return jsonResponse(lastFailure || { error: 'MOEX ISS unavailable' }, 502);
  }
};