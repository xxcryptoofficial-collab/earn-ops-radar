export const PLATFORMS = ["CoinW", "Binance", "OKX", "Bybit", "Bitget", "Gate", "HTX", "KuCoin"];
export const ASSETS = ["USDT", "USDC", "BTC", "ETH", "SOL"];
export const TERMS = ["活期", "定期"];

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

export function formatPercent(value, digits = 2) {
  return Number.isFinite(value) ? `${value.toFixed(digits)}%` : "待录";
}

export function formatBp(value) {
  if (!Number.isFinite(value)) return "无变化数据";
  if (value === 0) return "较前日 0 bp →";
  return `较前日 ${value > 0 ? "+" : ""}${Math.round(value)} bp ${value > 0 ? "↑" : "↓"}`;
}

export function latestDelta(history) {
  const real = history.filter((point) => Number.isFinite(point.value));
  if (real.length < 2) return null;
  return real.at(-1).value - real.at(-2).value;
}

export function sevenDayDelta(history) {
  const real = history.filter((point) => Number.isFinite(point.value));
  if (real.length < 2) return null;
  return real.at(-1).value - real[0].value;
}

export function sparklinePoints(history, width = 170, height = 52) {
  const values = history.map((point) => point.value).filter(Number.isFinite);
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  return values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
    const y = height - 6 - ((value - min) / spread) * (height - 12);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

export function buildApyLookup(entries) {
  const lookup = new Map();
  for (const entry of entries) {
    lookup.set(`${entry.platform}|${entry.coin}|${entry.term}`, entry);
  }
  return lookup;
}

export function buildSpreadAlerts(snapshot, thresholdBp = 50) {
  const alerts = [];
  for (const entry of snapshot.competitorApy) {
    if (Number.isFinite(entry.deltaBp) && Math.abs(entry.deltaBp) >= thresholdBp) {
      alerts.push({
        id: `apy-${entry.platform}-${entry.coin}-${entry.term}`,
        severity: Math.abs(entry.deltaBp) >= 100 ? "high" : "medium",
        title: `${entry.platform} · ${entry.coin} ${entry.term}`,
        changeBp: entry.deltaBp,
        whatChanged: `挂牌 APY ${entry.deltaBp > 0 ? "上调" : "下调"} ${Math.abs(entry.deltaBp)} bp`,
        soWhat: entry.deltaBp > 0
          ? "竞品在抬高获客或留存成本，先确认是否为限额促销，再决定是否跟。"
          : "竞品主动收息，说明补贴或上游空间收窄；CoinW 对应币种应进入定价复核。",
        dataAsOf: entry.dataAsOf,
        fetchedAt: entry.fetchedAt,
        sourceUrl: entry.sourceUrl,
        evidenceKind: entry.note?.includes("演示") ? "demo" : entry.status,
      });
    }
  }
  for (const indicator of snapshot.upstream) {
    const previousPoint = indicator.history.at(-2);
    const currentPoint = indicator.history.at(-1);
    const gap = Date.parse(currentPoint?.date) - Date.parse(previousPoint?.date);
    if (!Number.isFinite(gap) || gap <= 0 || gap > 36 * 3600000) continue;
    const isDemoTransition = previousPoint?.kind === "mock" || currentPoint?.kind === "mock";
    const isSourceTransition = previousPoint?.kind && currentPoint?.kind && previousPoint.kind !== currentPoint.kind && !isDemoTransition;
    if (isSourceTransition) continue;
    const change = latestDelta(indicator.history);
    const changeBp = Number.isFinite(change) ? change * 100 : null;
    if (Number.isFinite(changeBp) && Math.abs(changeBp) >= thresholdBp) {
      alerts.push({
        id: `upstream-${indicator.id}`,
        severity: Math.abs(changeBp) >= 100 ? "high" : "medium",
        title: indicator.shortName,
        changeBp,
        whatChanged: `上游收益率单日${changeBp > 0 ? "上行" : "下行"} ${Math.abs(changeBp).toFixed(0)} bp`,
        soWhat: changeBp > 0
          ? "资产端空间扩大，先观察是否持续，不必当天追涨挂牌。"
          : "资产端空间收窄，长期不调挂牌会扩大隐含补贴。",
        dataAsOf: indicator.dataAsOf,
        fetchedAt: indicator.fetchedAt,
        sourceUrl: indicator.sourceUrl,
        evidenceKind: isDemoTransition ? "demo" : indicator.status,
      });
    }
  }
  return alerts.sort((a, b) => {
    const timeDiff = latestUpdateTime(b, ["dataAsOf", "fetchedAt"]) - latestUpdateTime(a, ["dataAsOf", "fetchedAt"]);
    return timeDiff || Math.abs(b.changeBp) - Math.abs(a.changeBp);
  });
}

export function buildLedgerRows(snapshot) {
  const anchors = new Map(snapshot.upstream.map((item) => [item.id, item]));
  return snapshot.ledger.products.map((product) => {
    const anchor = anchors.get(product.anchorId);
    const anchorValue = anchor?.value ?? null;
    const spread = Number.isFinite(anchorValue) ? product.listingApy - anchorValue : null;
    return {
      ...product,
      anchorName: anchor?.shortName ?? "锚缺失",
      anchorValue,
      anchorDataAsOf: anchor?.dataAsOf ?? null,
      anchorFetchedAt: anchor?.fetchedAt ?? null,
      anchorSource: anchor?.source ?? "无",
      anchorSourceUrl: anchor?.sourceUrl ?? "#",
      anchorStatus: anchor?.status ?? "failed",
      spread,
      spreadBp: Number.isFinite(spread) ? spread * 100 : null,
    };
  }).sort((a, b) => {
    const timeDiff = latestUpdateTime(b, ["listingDataAsOf", "listingFetchedAt"]) - latestUpdateTime(a, ["listingDataAsOf", "listingFetchedAt"]);
    return timeDiff || (b.spread ?? -Infinity) - (a.spread ?? -Infinity);
  });
}

export function hasConsecutiveDecline(history, days = 5) {
  const points = history.slice(-days - 1);
  if (points.length < days + 1) return false;
  for (let index = 1; index < points.length; index += 1) {
    if (!(points[index].value < points[index - 1].value)) return false;
  }
  return true;
}

export function buildPricingWarnings(snapshot, days = 5) {
  const anchors = new Map(snapshot.upstream.map((item) => [item.id, item]));
  const warnings = snapshot.ledger.products.flatMap((product) => {
    const anchor = anchors.get(product.anchorId);
    const listingFlat = product.listingHistory?.slice(-days - 1).every((value) => value === product.listingHistory.at(-1));
    if (!anchor || !listingFlat || !hasConsecutiveDecline(anchor.history, days)) return [];
    return [{
      id: product.id,
      product: product.product,
      days,
      listingApy: product.listingApy,
      anchorName: anchor.shortName,
      anchorNow: anchor.value,
      dataAsOf: anchor.dataAsOf,
      fetchedAt: anchor.fetchedAt,
      isDemo: anchor.history.some((point) => point.kind === "mock"),
      soWhat: `上游连续 ${days} 个演示日下行，而公开挂牌未变；这不是自动调价命令，是优先核对补贴来源和挂牌时效。`,
    }];
  });
  return sortByLatestUpdate(warnings, ["dataAsOf", "fetchedAt"]);
}

export function freshnessLabel(status) {
  return ({ live: "自动回读", fresh: "自动回读", manual: "人工种子", partial: "部分回读", stale: "可能过时", failed: "抓取失败" })[status] ?? status;
}

