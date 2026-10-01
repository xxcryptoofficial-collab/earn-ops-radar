// Only accepts an independently reviewed PUBLIC package. Internal briefs are never inputs.
import { publicNews, isOwnContent } from '../src/domain/visibility.js';
const FIELDS = ['id', 'platform', 'growthLever', 'title', 'changeKind', 'fact', 'conditions', 'generalImplication', 'source', 'sourceUrl', 'publishedAt', 'dataAsOf', 'fetchedAt', 'publicSourceVerified', 'publicOnlyReviewed'];
const OPTIONAL = ['contentKind', 'sector', 'firstObservedAt', 'startsAt', 'validUntil', 'regionGroup', 'geo', 'studyPeriod'];
const LEVERS = new Set(['首次转化', '存量激活', '增资', '续投召回', '联合分发', '产品竞争', '上游收益']);
const KINDS = new Set(['新发生', '首次发现', '规则变更', '撤销', '过期']);
const iso = (v) => typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v) && Number.isFinite(Date.parse(v));

export function validatePublicResearch(input) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) return ['公开研究包不是对象'];
  if (Object.keys(input).some(k => !['schemaVersion', 'scope', 'records'].includes(k))) errors.push('公开研究包包含非白名单字段');
  if (input.schemaVersion !== '1.0' || input.scope !== 'external-public-only') errors.push('公开研究包版本或范围错误');
  if (!Array.isArray(input.records) || input.records.length > 100) return [...errors, 'records 必须为不超过 100 条的数组'];
  const ids = new Set();
  for (const [index, r] of input.records.entries()) {
    const fail = m => errors.push(`records[${index}] ${m}`);
    if (!r || typeof r !== 'object' || Array.isArray(r)) { fail('不是对象'); continue; }
    if (Object.keys(r).some(k => ![...FIELDS,...OPTIONAL].includes(k)) || FIELDS.some(k => !(k in r))) fail('字段不符合公开白名单');
    if (r.contentKind !== undefined && !['activity','mechanism','distribution','update','regional'].includes(r.contentKind)) fail('研究类别非法');
    if (r.sector !== undefined && !['CEX','DeFi','Web2'].includes(r.sector)) fail('领域非法');
    if (r.contentKind === 'regional' && (!['东亚','中东','欧美'].includes(r.regionGroup) || !r.geo || !r.studyPeriod)) fail('地区研究缺少地区、市场或研究期');
    for (const key of ['regionGroup','geo','studyPeriod']) if (r[key] !== undefined && (typeof r[key] !== 'string' || !r[key].trim() || r[key].length > 160)) fail(`${key} 无效`);
    for (const key of ['firstObservedAt','startsAt','validUntil']) if (r[key] !== undefined && r[key] !== null && !iso(r[key])) fail(`${key} 非法`);
    if (r.contentKind === 'activity' && (!iso(r.startsAt) || !iso(r.validUntil) || Date.parse(r.validUntil)<=Date.parse(r.startsAt))) fail('活动必须有有效起止窗口');
    if (r.firstObservedAt && Date.parse(r.firstObservedAt)>Date.parse(r.fetchedAt)) fail('首次观察晚于核实时间');
    if (!/^pub-[a-z0-9-]{3,80}$/.test(r.id) || ids.has(r.id)) fail('ID 非法或重复');
    ids.add(r.id);
    if (!LEVERS.has(r.growthLever) || !KINDS.has(r.changeKind)) fail('增长方向或变化类型非法');
    for (const key of ['platform', 'title', 'fact', 'conditions', 'generalImplication', 'source']) {
      if (typeof r[key] !== 'string' || !r[key].trim() || r[key].length > 1600) fail(`${key} 无效`);
    }
    if (!iso(r.fetchedAt) || (r.publishedAt !== null && !iso(r.publishedAt))) fail('时间非法');
    if (r.dataAsOf !== null && !iso(r.dataAsOf)) fail('数据归属时间非法');
    if (r.dataAsOf !== null && Date.parse(r.dataAsOf) > Date.parse(r.fetchedAt)) fail('数据归属时间晚于抓取时间');
    if (/\d\s*[%％]|\bAP[RY]\b|利率|收益率/i.test(`${r.title} ${r.fact} ${r.conditions}`) && !iso(r.dataAsOf)) fail('利率事实必须提供数据归属时间');
    if (r.publishedAt !== null && Date.parse(r.publishedAt) > Date.parse(r.fetchedAt)) fail('发布时间晚于抓取时间');
    if (r.publicSourceVerified !== true || r.publicOnlyReviewed !== true) fail('缺少公开出处核实或逐条内容检查');
    try {
      const u = new URL(r.sourceUrl);
      if (u.protocol !== 'https:' || u.username || u.password || !u.hostname.includes('.') || /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname) || /\.(local|internal)$/.test(u.hostname)) fail('来源不是公开 HTTPS 地址');
      if ([...u.searchParams.keys()].some(k => /token|secret|key|email|uid/i.test(k))) fail('来源含敏感参数');
    } catch { fail('来源 URL 无效'); }
    // Backstop only: semantic review remains mandatory; pattern checks cannot prove publicity.
    if (/\/Users\/|file:\/\/|CW-\d+|\bUID\b|内部目标|内部数据|未公开|净入金缺口|本月目标|Bearer\s/i.test(JSON.stringify(r))) fail('出现内部内容或标识风险');
  }
  return errors;
}

export function mergePublicResearch(previous, input, checkedAt) {
  const errors = validatePublicResearch(input);
  if (errors.length) throw new Error(`PUBLIC_RESEARCH_REJECTED: ${errors.join('；')}`);
  const merged = new Map(publicNews(previous).map(r => [r.id, r]));
  for (const r of input.records) {
    if (isOwnContent(r)) continue;
    const old = merged.get(r.id);
    if (old && Date.parse(old.fetchedAt) > Date.parse(r.fetchedAt)) continue;
    const stale = Date.parse(checkedAt) - Date.parse(r.fetchedAt) > 36 * 3600000;
    merged.set(r.id, {
      id: r.id, platform: r.platform, type: `${r.growthLever} · ${r.changeKind}`,
      title: r.title,
      summary: `${stale ? '【超过 36 小时未复核】' : ''}${r.publishedAt === null ? '【精确发布时间未记录】' : ''}${r.fact}；适用条件：${r.conditions}${r.dataAsOf ? `；数据归属：${r.dataAsOf}` : ''}`,
      soWhat: r.generalImplication, source: r.source, sourceUrl: r.sourceUrl,
      publishedAt: r.publishedAt, fetchedAt: r.fetchedAt,
      contentKind: r.contentKind ?? 'update', sector: r.sector ?? 'CEX',
      regionGroup: r.regionGroup ?? null, geo: r.geo ?? null, studyPeriod: r.studyPeriod ?? null,
      firstObservedAt: old?.firstObservedAt ?? r.firstObservedAt ?? r.fetchedAt,
      startsAt: r.startsAt ?? null, validUntil: r.validUntil ?? null,
      fact: r.fact, conditions: r.conditions, dataAsOf: r.dataAsOf,
    });
  }
  return [...merged.values()].sort((a, b) => Date.parse(b.fetchedAt) - Date.parse(a.fetchedAt));
}
