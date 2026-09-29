import { formatPercent, sortByLatestUpdate, buildSpreadAlerts } from '../domain/derive.js';
import { groupProducts, filterProducts } from '../domain/products.js';
import { visibleSnapshot } from '../domain/visibility.js';
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const formatTime=v=>/^\d{4}-\d{2}-\d{2}$/.test(v??'')?`${v.slice(5,7)}/${v.slice(8,10)}（仅日期）`:Number.isFinite(Date.parse(v))?new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(v)):'未披露';
const source=(url,label='原始来源')=>/^https:\/\//.test(url??'')?`<a class="source-link" href="${esc(url)}" target="_blank" rel="noreferrer">${esc(label)} ↗</a>`:'';
const times=(a,f)=>`<p class="time-line"><span class="date-stamp">归属 <strong class="date-value date-primary">${formatTime(a)}</strong></span><span class="date-stamp">抓取 <strong class="date-value date-secondary">${formatTime(f)}</strong></span></p>`;
const head=(t,n='')=>`<header class="section-head"><h2>${esc(t)}</h2>${n?`<span class="section-count">${esc(n)}</span>`:''}</header>`;
const empty=t=>`<div class="empty-state"><strong>${esc(t)}</strong></div>`;
function chart(points,id) {
  if(points.length<2)return '<p class="coverage">有效历史不足，暂不绘制趋势</p>';
  const values=points.map(p=>p.value),dates=points.map(p=>Date.parse(p.date)),min=Math.min(...values),spread=Math.max(...values)-min||1,span=dates.at(-1)-dates[0]||1;
  const xy=points.map((p,i)=>`${((dates[i]-dates[0])/span*170).toFixed(1)},${(46-(p.value-min)/spread*40).toFixed(1)}`);
  const segments=[];let segment=[];points.forEach((p,i)=>{if(i&&dates[i]-dates[i-1]>36*3600000){segments.push(segment);segment=[];}segment.push(xy[i]);});segments.push(segment);
  return `<svg class="sparkline" viewBox="0 0 170 52" role="img" aria-label="${esc(id)}真实历史；缺测无数据点">${segments.map(seg=>seg.length>1?`<polyline points="${seg.join(' ')}"/>`:`<circle cx="${seg[0].split(',')[0]}" cy="${seg[0].split(',')[1]}" r="2" fill="currentColor"/>`).join('')}</svg><p class="coverage">${formatTime(points[0].date)} — ${formatTime(points.at(-1).date)} · ${points.length} 次观测 · 缺测断开 · 范围 ${min.toFixed(2)}–${Math.max(...values).toFixed(2)}</p>`;
}
function rateCard(r,kind='产品收益') {
 return `<article class="rate-card"><div class="rate-card-head"><span class="rate-kind">${esc(kind)}</span></div><h4>${esc(r.name)}</h4><div class="rate-value"><strong>${formatPercent(r.value)}</strong><span>${esc(r.unit)}</span></div>${times(r.dataAsOf,r.fetchedAt)}<details data-product-key="yield-${esc(r.id??r.name)}"><summary>口径与来源</summary>${Array.isArray(r.history)?chart(r.history,r.name):''}<p class="coverage">${esc(r.coverage??'条件以官方原文为准')}</p>${source(r.sourceUrl,r.source)}</details></article>`;
}
const isReference=r=>['mechanism','distribution','regional'].includes(r.contentKind);
const researchKinds={activity:'活动规则',update:'产品更新',mechanism:'机制参考',distribution:'渠道参考',regional:'地区研究'};
function researchCard(r) {
 const key=`research-${r.id??r.sourceUrl+'-'+r.title}`;
 const published=Number.isFinite(Date.parse(r.publishedAt))?new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(r.publishedAt)):'精确时间未记录';
 const window=(r.contentKind==='activity'?`<p class="research-window">规则窗口 ${formatTime(r.startsAt)} — ${formatTime(r.validUntil)}<span>资格、地区与额度以原文为准，不代表当前可参与</span>${r.conditions?`<strong class="research-caveat">${esc(r.conditions)}</strong>`:''}</p>`:'')+(r.dataAsOf?times(r.dataAsOf,r.fetchedAt):'');
 return `<article class="research-card" data-content-kind="${esc(r.contentKind??'update')}"><div class="research-meta"><strong>${esc(r.platform)}</strong><span>${esc(r.geo??r.sector??'未分类')}</span><span>${esc(researchKinds[r.contentKind]??'公开动态')}</span>${r.type?`<span>${esc(r.type)}</span>`:''}</div><h3>${esc(r.title)}</h3><p class="research-fact">${esc(r.fact||r.summary)}</p>${r.studyPeriod?`<p class="research-study">研究期 ${esc(r.studyPeriod)}</p>`:''}${window}<p class="time-line research-times"><span class="date-stamp">核验 <strong class="date-value date-secondary">${formatTime(r.fetchedAt)}</strong></span><span class="research-published">发布 ${published}</span></p><div class="research-links">${source(r.sourceUrl,r.source||'原始来源')}${r.conditions?`<details data-product-key="${esc(key)}"><summary>${r.contentKind==='regional'?'样本与适用范围':'适用条件'}</summary><p>${esc(r.conditions)}</p>${r.firstObservedAt?`<p class="research-observed">首次观察 ${formatTime(r.firstObservedAt)}</p>`:''}</details>`:''}</div></article>`;
}
function actions(s) {
 const rows=sortByLatestUpdate(s.competitorActions.filter(r=>!isReference(r)),['fetchedAt']);
 return `<section class="panel research-panel">${head('最新调研',rows.length+' 条 · 按核验时间排序')}${rows.length?`<div class="research-grid">${rows.slice(0,3).map(researchCard).join('')}</div>${rows.length>3?`<details class="research-more" data-product-key="research-more"><summary>展开其余 ${rows.length-3} 条调研</summary><div class="research-grid">${rows.slice(3).map(researchCard).join('')}</div></details>`:''}`:empty('暂无近期可核验的活动或更新')}</section>`;
}
function regionalResearch(s) {
 const groups=['东亚','中东','欧美'];
 const rows=s.competitorActions.filter(r=>r.contentKind==='regional'&&groups.includes(r.regionGroup));
 if(!rows.length)return '';
 return `<section class="panel regional-panel">${head('地区研究','公开调查与市场观察 · 研究期见卡片')}<div class="regional-grid">${groups.map(group=>{const list=sortByLatestUpdate(rows.filter(r=>r.regionGroup===group),['fetchedAt']);return `<section class="regional-group" data-region="${esc(group)}"><h3>${esc(group)} <small>${list.length} 条</small></h3>${list.length?list.map(researchCard).join(''):empty('暂无可核验地区研究')}</section>`;}).join('')}</div></section>`;
}
const routes=[
 ['Binance','https://www.binance.com/en/earn','核实公开动态产品请求；签名账户接口不作为匿名替代。'],
 ['OKX','https://www.okx.com/earn','核实公开产品明细与区域可用性；不绕访问限制。'],
 ['Bybit','https://api.bybit.com/v5/earn/product?category=FlexibleSaving','公开产品接口；活期、链上分类和 APR、阶梯条件分别保留。'],
 ['Bitget','https://www.bitget.com/earning','优先解析公开网页产品数据及阶梯；不取聚合上限。'],
 ['Gate','https://www.gate.com/earn','核实公开产品明细；借贷资金利率不冒充挂牌收益。'],
 ['HTX','https://www.htx.com/en-us/financial/','核实当前公开入口与区域可用性；不绕访问限制。'],
 ['KuCoin','https://www.kucoin.com/earn','展开具体产品和资格；参考区间不替代活期基础档。']
];
export const viewFilters={platform:'',coin:'',term:''};
function quoteTimes(r) {
 const label=r.dataTimeKind==='observed'?'页面观察':r.dataTimeKind==='response'?'公开响应':'数据时点';
 return times(r.dataAsOf,r.fetchedAt).replace('归属 ',label+' ')+(r.dataTimeKind==='observed'||r.dataTimeKind==='response'?'<small class="time-note">源端利率更新时间未披露</small>':'');
}
function rates(s) {
 const products=groupProducts(filterProducts(s.competitorApy,viewFilters));
 const select=(key,label,values)=>`<label>${label}<select data-filter="${key}"><option value="">全部</option>${values.map(v=>`<option value="${esc(v)}" ${viewFilters[key]===v?'selected':''}>${esc(v)}</option>`).join('')}</select></label>`;
 const filters=`<div class="quote-filters">${select('coin','币种',['USDT','USDC','BTC','ETH','SOL'])}${select('term','类型',['活期','定期'])}<button type="button" data-clear>清除</button><span>${products.length} 款 · ${products.reduce((n,p)=>n+p.tiers.length,0)} 条额度报价 · 产品按更新时间排序</span></div>`;
 const content=routes.filter(([name])=>products.some(p=>p.platform===name)).map(([name])=>{
   const list=products.filter(p=>p.platform===name);
   const common=list.length&&list.every(p=>p.dataAsOf===list[0].dataAsOf&&p.fetchedAt===list[0].fetchedAt&&p.dataTimeKind===list[0].dataTimeKind);
   return `<section class="platform-group" data-platform="${esc(name)}"><div class="platform-heading"><h3>${esc(name)} <small>${list.length} 款</small></h3>${common?quoteTimes(list[0]):''}</div><div class="product-list">${list.map(p=>`<article class="product-item"><div class="product-title"><h4>${esc(p.coin)}</h4><span class="product-term">${esc(p.term)}</span></div><div class="tier-preview">${p.tiers.map(t=>`<div><strong>${formatPercent(t.apy)} <small>${esc(t.rateType)}</small></strong><span>${esc(t.tier??'额度未披露')}</span></div>`).join('')}</div>${p.eligibility?`<small class="key-condition">${esc(p.eligibility)}</small>`:''}${p.validUntil?`<small class="key-condition">有效至 ${formatTime(p.validUntil)}</small>`:''}${!common?quoteTimes(p):''}<details data-product-key="${esc(p.key)}"><summary>条款 ↗</summary><div class="product-detail" tabindex="0"><p>挂牌年化，基础与奖励未单列。</p><p>${esc(p.note??'更多资格条件需核对原始产品页')}</p><p>产品编号 ${esc(p.productId)}</p>${quoteTimes(p)}${source(p.sourceUrl,'报价原文')}</div></details></article>`).join('')}</div></section>`;
 }).join('');
 const missing=routes.filter(([name])=>!s.competitorApy.some(p=>p.platform===name));
 const uncovered=missing.length?`<details class="source-coverage" data-product-key="source-coverage"><summary>${missing.length} 家尚无可验证当期挂牌 · 查看取数路径</summary><div class="coverage-list">${missing.map(([name,url,next])=>`<p><strong>${esc(name)}</strong><span>未取得可展示报价；${esc(next)}</span>${source(url,'官方入口')}</p>`).join('')}</div></details>`:'';
 const filteredEmpty=!products.length&&s.competitorApy.length?empty('当前筛选无匹配产品'):'';
 const funding=s.upstream.filter(r=>r.id==='funding-mean');
 return `<section class="yield-sector" data-sector="CEX"><div class="yield-sector-head"><h3>CEX · 交易所挂牌</h3><span>${products.length} 款有效产品</span></div>${filters}<div class="exchange-grid">${content}</div>${filteredEmpty}${uncovered}${funding.length?`<div class="yield-benchmarks"><span>市场参考，不是 Earn 挂牌</span>${funding.map(r=>rateCard(r,'资金费率基准')).join('')}</div>`:''}</section>`;
}

function alerts(s) {
 const rows=buildSpreadAlerts(s).filter(r=>r.evidenceKind!=='demo');
 return rows.length?`<section class="panel">${head('利率异动',rows.length+' 条')}<div class="alert-grid">${rows.map(r=>`<article class="alert-card"><h3>${esc(r.title)}</h3><p>${esc(r.whatChanged)}</p>${times(r.dataAsOf,r.fetchedAt)}${source(r.sourceUrl)}</article>`).join('')}</div></section>`:'';
}
function sectorReferences(s,sector) {
 const rows=sortByLatestUpdate(s.competitorActions.filter(r=>isReference(r)&&(r.sector===sector||(sector==='DEX'&&r.sector==='DeFi'))),['fetchedAt']);
 return rows.length?`<details class="sector-references" data-product-key="references-${esc(sector)}"><summary>机制与渠道参考 ${rows.length} 条</summary><div class="research-grid">${rows.map(researchCard).join('')}</div></details>`:'';
}
function externalSector(s,sector,title) {
 const own=s.externalYields.filter(r=>r.sector===sector);
 const ids=sector==='DEX'?new Set(['aave-stable','sol-staking-proxy','susde']):new Set(['treasury-3m']);
 const baseline=s.upstream.filter(r=>ids.has(r.id));
 const cards=[...own.map(r=>rateCard(r,sector==='Web2'?'储蓄产品':'协议收益')),...baseline.map(r=>rateCard(r,sector==='Web2'?'国债市场基准':'链上参考'))];
 return `<section class="yield-sector" data-sector="${sector}"><div class="yield-sector-head"><h3>${title}</h3><span>${own.length} 条产品/协议收益 · ${baseline.length} 条参考</span></div>${cards.length?`<div class="sector-rate-grid">${cards.join('')}</div>`:empty('暂无满足双时间与时效要求的收益报价')}${sectorReferences(s,sector)}</section>`;
}
function yieldUniverse(s) {
 return `<section class="panel yield-universe">${head('外部收益观察','CEX / DEX / Web2 · 各类口径分开')}<div class="yield-layout">${rates(s)}<div class="yield-lower">${externalSector(s,'DEX','DEX · 链上协议')}${externalSector(s,'Web2','Web2 · 储蓄与市场基准')}</div></div>${sectorReferences(s,'CEX')}</section>`;
}
export function renderApp(root,raw) {
 const s=visibleSnapshot(raw);
 const latest=s.meta.latestAttempt,status=latest?.status??s.meta.runStatus;
 root.innerHTML=`<div class="app-shell compact-dashboard"><main class="main-shell"><header class="masthead"><h1>Earn Radar</h1><div class="run-card"><span>最近采集</span><strong title="${esc(status)}">${status==='COMMITTED'?'已读取':status==='FAILED'?'本轮失败':'部分缺失'}</strong><strong class="date-value date-highlight">${formatTime(latest?.finishedAt??s.meta.generatedAt)}</strong></div></header><div class="content-shell"><div class="screen-stack">${actions(s)}${regionalResearch(s)}${alerts(s)}${yieldUniverse(s)}</div></div><footer>北京时间 UTC+8 · 过期内容不展示 · 来源与条件见各卡片</footer></main></div>`;
}
