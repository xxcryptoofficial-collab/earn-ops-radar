const RATE_STATUSES = new Set(["live", "fresh", "manual", "partial", "stale", "failed"]);

function isIsoTime(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function requireKeys(record, keys, path, errors) {
  for (const key of keys) {
    if (!(key in record)) errors.push(`${path}.${key} 缺失`);
  }
}

function checkRateRecord(record, path, errors) {
  requireKeys(record, ["status", "dataAsOf", "fetchedAt", "source", "sourceUrl"], path, errors);
  if (!RATE_STATUSES.has(record.status)) errors.push(`${path}.status 非法`);
  if (!isIsoTime(record.dataAsOf)) errors.push(`${path}.dataAsOf 不是有效时间`);
  if (!isIsoTime(record.fetchedAt)) errors.push(`${path}.fetchedAt 不是有效时间`);
  if (isIsoTime(record.dataAsOf) && isIsoTime(record.fetchedAt) && Date.parse(record.dataAsOf) > Date.parse(record.fetchedAt) + 300_000) errors.push(`${path}.dataAsOf 晚于抓取时间`);
  if (typeof record.source !== "string" || record.source.trim() === "") errors.push(`${path}.source 为空`);
  if (typeof record.sourceUrl !== "string" || !record.sourceUrl.startsWith("https://")) errors.push(`${path}.sourceUrl 必须是公开 HTTPS 链接`);
}

export function validateSnapshot(snapshot) {
  const errors = [];
  if (!snapshot || typeof snapshot !== "object") return ["快照不是对象"];
  requireKeys(snapshot, ["schemaVersion", "meta", "upstream", "competitorApy", "competitorActions", "mechanisms", "productCoverage", "categoryHeat", "ledger", "sourceRuns"], "snapshot", errors);
  if (snapshot.schemaVersion !== "1.0") errors.push("schemaVersion 必须为 1.0");
  if (!snapshot.meta || snapshot.meta.scope !== "external-public-only") errors.push("meta.scope 必须是 external-public-only");

  if (!Array.isArray(snapshot.upstream) || snapshot.upstream.length !== 6) errors.push("upstream 必须正好包含 6 条曲线");
  for (const [index, indicator] of (snapshot.upstream ?? []).entries()) {
    // Explicit absence is valid; it must never be rendered as a zero or seed.
    if (indicator.status === 'failed' && indicator.originKind === 'unavailable' && indicator.value === null && indicator.dataAsOf === null && indicator.fetchedAt === null && Array.isArray(indicator.history) && indicator.history.length === 0) continue;
    checkRateRecord(indicator, `upstream[${index}]`, errors);
    if (!Number.isFinite(indicator.value)) errors.push(`upstream[${index}].value 必须是数字`);
    if (!Array.isArray(indicator.history) || indicator.history.length < 2) errors.push(`upstream[${index}].history 至少 2 点`);
    for (const [pointIndex, point] of (indicator.history ?? []).entries()) {
      if (!Number.isFinite(point.value)) errors.push(`upstream[${index}].history[${pointIndex}].value 非数字`);
      if (!new Set(["live", "manual", "mock"]).has(point.kind)) errors.push(`upstream[${index}].history[${pointIndex}].kind 缺失或非法`);
    }
  }

  if (snapshot.externalYields !== undefined && !Array.isArray(snapshot.externalYields)) errors.push("externalYields 必须是数组");
  for (const [index, item] of (snapshot.externalYields ?? []).entries()) {
    checkRateRecord(item, `externalYields[${index}]`, errors);
    if (!Number.isFinite(item.value) || item.value < 0) errors.push(`externalYields[${index}].value 非有效年化`);
    if (!new Set(["DEX", "Web2"]).has(item.sector)) errors.push(`externalYields[${index}].sector 非法`);
    if (typeof item.id !== "string" || !item.id.trim()) errors.push(`externalYields[${index}].id 缺失`);
    if (!/^% (APR|APY)$/.test(item.unit ?? "")) errors.push(`externalYields[${index}].unit 非 APR/APY`);
    if (item.dataTimeKind === "date-only" && !/^\d{4}-\d{2}-\d{2}$/.test(item.dataAsOf)) errors.push(`externalYields[${index}] 日期精度非法`);
  }

  if (!Array.isArray(snapshot.competitorApy)) errors.push("competitorApy 必须是数组");
  for (const [index, entry] of (snapshot.competitorApy ?? []).entries()) {
    checkRateRecord(entry, `competitorApy[${index}]`, errors);
    if (!Number.isFinite(entry.apy)) errors.push(`competitorApy[${index}].apy 必须是数字`);
  }
  for (const [index, action] of (snapshot.competitorActions ?? []).entries()) {
    requireKeys(action, ["publishedAt", "fetchedAt", "source", "sourceUrl", "soWhat"], `competitorActions[${index}]`, errors);
    if ((action.publishedAt !== null && !isIsoTime(action.publishedAt)) || !isIsoTime(action.fetchedAt) || (action.publishedAt===null&&!isIsoTime(action.firstObservedAt))) errors.push(`competitorActions[${index}] 双时间非法`);
    if (action.contentKind==='activity' && (!isIsoTime(action.startsAt)||!isIsoTime(action.validUntil)||Date.parse(action.validUntil)<=Date.parse(action.startsAt))) errors.push(`competitorActions[${index}] 活动窗口非法`);
    if (!action.sourceUrl?.startsWith("https://")) errors.push(`competitorActions[${index}].sourceUrl 必须是公开 HTTPS 链接`);
  }
  const platforms = new Set((snapshot.productCoverage?.platforms ?? []));
  if (platforms.size !== 8 || !platforms.has("CoinW")) errors.push("产品覆盖矩阵必须包含 CoinW + 7 家竞品");
  if ((snapshot.productCoverage?.rows ?? []).length !== 12) errors.push("产品覆盖矩阵必须包含 12 条产品线");
  const unavailableCoverage = snapshot.productCoverage?.source === 'No verified public coverage' && snapshot.productCoverage?.dataAsOf === null && snapshot.productCoverage?.fetchedAt === null && snapshot.productCoverage?.rows?.every(row=>Object.keys(row.values??{}).length===0);
  if (!unavailableCoverage && (!isIsoTime(snapshot.productCoverage?.dataAsOf) || !isIsoTime(snapshot.productCoverage?.fetchedAt))) errors.push("产品覆盖矩阵双时间非法");
  if (typeof snapshot.productCoverage?.source !== "string" || snapshot.productCoverage.source.trim() === "") errors.push("产品覆盖矩阵来源为空");

  for (const [index, product] of (snapshot.ledger?.products ?? []).entries()) {
    requireKeys(product, ["listingApy", "listingDataAsOf", "listingFetchedAt", "source", "sourceUrl", "status"], `ledger.products[${index}]`, errors);
    if (!Number.isFinite(product.listingApy)) errors.push(`ledger.products[${index}].listingApy 非数字`);
    if (!isIsoTime(product.listingDataAsOf) || !isIsoTime(product.listingFetchedAt)) errors.push(`ledger.products[${index}] 双时间非法`);
    if (!product.sourceUrl?.startsWith("https://")) errors.push(`ledger.products[${index}].sourceUrl 非公开链接`);
  }

  const serialized = JSON.stringify(snapshot);
  const forbiddenKeys = ["aum", "userId", "email", "phone", "internalCost", "apiKey", "token"];
  for (const key of forbiddenKeys) {
    if (new RegExp(`\\"${key}\\"`, "i").test(serialized)) errors.push(`公开快照出现禁止字段 ${key}`);
  }
  return errors;
}
