export function latestUpdateTime(record, fields = ["updatedAt", "dataAsOf", "publishedAt", "listingDataAsOf", "fetchedAt", "listingFetchedAt", "recordedAt"]) {
  for (const field of fields) {
    const value = Date.parse(record?.[field]);
    if (Number.isFinite(value)) return value;
  }
  return -Infinity;
}

export function sortByLatestUpdate(records, fields) {
  return [...records].sort((a, b) => latestUpdateTime(b, fields) - latestUpdateTime(a, fields));
}

export function latestDelta(history) {
  const real = history.filter((point) => Number.isFinite(point.value));
  if (real.length < 2) return null;
  return real.at(-1).value - real.at(-2).value;
}

export function buildSpreadAlerts(snapshot, thresholdBp=50) {
  const alerts=[];
  for(const indicator of snapshot.upstream??[]) {
    const history=indicator.history??[], previous=history.at(-2), current=history.at(-1);
    const gap=Date.parse(current?.date)-Date.parse(previous?.date);
    if(!Number.isFinite(gap)||gap<=0||gap>36*3600000||previous?.kind!=='live'||current?.kind!=='live')continue;
    const delta=latestDelta(history), changeBp=Number.isFinite(delta)?delta*100:null;
    if(Number.isFinite(changeBp)&&Math.abs(changeBp)>=thresholdBp)alerts.push({id:'upstream-'+indicator.id,changeBp,dataAsOf:indicator.dataAsOf,fetchedAt:indicator.fetchedAt});
  }
  return alerts.sort((a,b)=>latestUpdateTime(b,['dataAsOf','fetchedAt'])-latestUpdateTime(a,['dataAsOf','fetchedAt'])||Math.abs(b.changeBp)-Math.abs(a.changeBp));
}
