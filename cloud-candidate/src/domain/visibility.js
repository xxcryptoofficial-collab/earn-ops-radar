export const FRESH_MS = 36 * 60 * 60 * 1000;
export function isCurrent(row, now = Date.now(), fields = ['dataAsOf', 'fetchedAt']) {
  if (!row || ['stale','failed','expired','withdrawn'].includes(row.status)) return false;
  if (row.validUntil && (!Number.isFinite(Date.parse(row.validUntil)) || Date.parse(row.validUntil)<=now)) return false;
  return fields.every(key=>{const t=Date.parse(row[key]);return Number.isFinite(t)&&t<=now+300000&&now-t<=FRESH_MS;});
}
export function isOwnContent(row) {return /coinw|币赢/i.test(`${row.platform??''} ${row.source??''} ${row.sourceUrl??''}`);}
export function publicNews(rows=[]) {return rows.filter(r=>!isOwnContent(r));}
export function isResearchCurrent(r, now=Date.now()) {
  if (!r || ['stale','failed','expired','withdrawn'].includes(r.status) || /撤销|过期/.test(r.type??'')) return false;
  const fetched=Date.parse(r.fetchedAt), first=Date.parse(r.firstObservedAt??r.publishedAt);
  const reference=['mechanism','distribution','regional'].includes(r.contentKind);
  const ttl=reference?8*86400000:FRESH_MS;
  if (!Number.isFinite(fetched)||fetched>now+300000||now-fetched>ttl) return false;
  if (r.dataAsOf && !isCurrent(r,now)) return false;
  if (r.validUntil && (!Number.isFinite(Date.parse(r.validUntil))||Date.parse(r.validUntil)<=now)) return false;
  if (r.contentKind==='activity') return Number.isFinite(Date.parse(r.startsAt))&&Date.parse(r.startsAt)<=now&&Number.isFinite(Date.parse(r.validUntil));
  if (reference) return true;
  const event=Date.parse(r.publishedAt??r.firstObservedAt);
  return Number.isFinite(event)&&event<=now+300000&&now-event<=7*86400000&&(!Number.isFinite(first)||first<=now+300000);
}
export function visibleSnapshot(s,now=Date.now()) {
  const upstream=(s.upstream??[]).filter(r=>isCurrent(r,now)).map(r=>({...r,history:(r.history??[]).filter(p=>p.kind!=='mock'&&Number.isFinite(p.value)&&Number.isFinite(Date.parse(p.date))&&Date.parse(p.date)<=now&&now-Date.parse(p.date)<=30*86400000).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date))}));
  const ids=new Set(upstream.map(r=>r.id));
  return {...s,upstream,
    externalYields:(s.externalYields??[]).filter(r=>isCurrent(r,now)&&!isOwnContent(r)),
    competitorApy:(s.competitorApy??[]).filter(r=>!isOwnContent(r)&&isCurrent(r,now)&&['APR','APY'].includes(r.rateType)&&typeof r.productId==='string'&&r.productId.trim()&&!(r.platform==='Bybit'&&r.term!=='活期')),
    competitorActions:publicNews(s.competitorActions).filter(r=>isResearchCurrent(r,now)),
    mechanisms:publicNews(s.mechanisms).filter(r=>r.sourceUrl&&isCurrent(r,now,['fetchedAt'])),
    categoryHeat:publicNews(s.categoryHeat).filter(r=>r.sourceUrl&&isCurrent(r,now)),
    productCoverage:isCurrent(s.productCoverage,now)?s.productCoverage:null,
    ledger:{...s.ledger,products:(s.ledger?.products??[]).filter(r=>isCurrent(r,now,['listingDataAsOf','listingFetchedAt'])&&ids.has(r.anchorId))},
    sourceRuns:(s.sourceRuns??[]).filter(r=>isCurrent({...r,status:'fresh'},now,['fetchedAt']))};
}

