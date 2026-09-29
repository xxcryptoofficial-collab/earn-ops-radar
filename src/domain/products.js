import { sortByLatestUpdate } from './derive.js';

// Only tiers of exactly the same product, conditions, source and observation merge.
export function groupProducts(rows) {
  const groups = new Map();
  for (const [index, row] of sortByLatestUpdate(rows, ['dataAsOf', 'fetchedAt']).entries()) {
    const key = JSON.stringify([row.platform, row.productId || `unknown-${index}`, row.coin, row.term,
      row.rateType, row.note, row.sourceUrl, row.dataAsOf, row.fetchedAt, row.dataTimeKind,
      row.validUntil, row.status, row.eligibility]);
    if (!groups.has(key)) groups.set(key, { ...row, key, tiers: [] });
    groups.get(key).tiers.push(row);
  }
  return [...groups.values()];
}

export function filterProducts(rows, filters = {}) {
  return rows.filter(r => (!filters.platform || r.platform === filters.platform)
    && (!filters.coin || r.coin === filters.coin)
    && (!filters.term || (filters.term === '活期' ? r.term === '活期' : /^定期/.test(r.term ?? ''))));
}
