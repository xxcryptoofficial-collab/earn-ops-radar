import { execFile } from "node:child_process";
import { promisify } from "node:util";

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 24 * 1024 * 1024;
const execFileAsync = promisify(execFile);
const ALLOWED_SOURCE_HOSTS = new Set([
  "api.bybit.com",
  "www.bitget.com",
  "app.ethena.fi",
  "eth-api.lido.fi",
  "fapi.binance.com",
  "home.treasury.gov",
  "kobe.mainnet.jito.network",
  "www.ally.com",
  "www.okx.com",
  "yields.llama.fi",
]);

export function assertAllowedSourceUrl(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !ALLOWED_SOURCE_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error("公开源地址不在 HTTPS 白名单");
  }
}

function hasConfiguredProxy() {
  return Boolean(process.env.HTTPS_PROXY || process.env.https_proxy || process.env.ALL_PROXY || process.env.all_proxy);
}

function responseFromText(body) {
  return {
    ok: true,
    status: 200,
    async json() {
      return JSON.parse(body);
    },
    async text() {
      return body;
    },
  };
}

async function fetchWithCurl(url, options, timeoutMs) {
  const seconds = Math.max(1, Math.ceil(timeoutMs / 1000));
  const headers = { "user-agent": "earn-ops-radar/0.1 public-readonly", ...(options.headers ?? {}) };
  const args = [
    "--silent",
    "--show-error",
    "--fail",
    "--location",
    "--compressed",
    "--proto",
    "=https",
    "--proto-redir",
    "=https",
    "--connect-timeout",
    String(seconds),
    "--max-time",
    String(seconds),
    "--max-filesize",
    String(MAX_RESPONSE_BYTES),
  ];
  if (options.method) args.push("--request", options.method);
  for (const [name, value] of Object.entries(headers)) args.push("--header", `${name}: ${value}`);
  if (options.body !== undefined) args.push("--data-binary", String(options.body));
  args.push(url);

  try {
    const { stdout } = await execFileAsync("curl", args, {
      encoding: "utf8",
      maxBuffer: MAX_RESPONSE_BYTES,
      timeout: timeoutMs + 1_000,
    });
    return responseFromText(stdout);
  } catch (error) {
    const code = Number(error?.code);
    if (code === 28 || error?.killed) throw new Error(`公开源代理读取超时（${timeoutMs}ms）`);
    throw new Error(`公开源代理读取失败（curl ${Number.isFinite(code) ? code : "unknown"}）`);
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  assertAllowedSourceUrl(url);
  if (hasConfiguredProxy()) return fetchWithCurl(url, options, timeoutMs);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response;
    try {
      response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: { "user-agent": "earn-ops-radar/0.1 public-readonly", ...(options.headers ?? {}) },
      });
    } catch {
      return await fetchWithCurl(url, options, timeoutMs);
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response;
  } finally {
    clearTimeout(timer);
  }
}

function annualizeFunding(periodRate, hours) {
  return periodRate * (24 / hours) * 365 * 100;
}

export function parseApyPercent(value) {
  const raw = String(value ?? "").trim();
  const numeric = Number(raw.endsWith("%") ? raw.slice(0, -1) : raw);
  if (!Number.isFinite(numeric)) return NaN;
  return raw.endsWith("%") || numeric > 1 ? numeric : numeric * 100;
}

function parseEthenaTimestamp(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value < 10_000_000_000 ? value * 1000 : value).toISOString();
  }
  const match = String(value ?? "").trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{2}|\d{4})$/);
  if (!match) throw new Error("Ethena 缺少有效数据归属时间");
  const months = new Map([
    ["jan", 0], ["feb", 1], ["mar", 2], ["apr", 3], ["may", 4], ["jun", 5],
    ["jul", 6], ["aug", 7], ["sep", 8], ["oct", 9], ["nov", 10], ["dec", 11],
  ]);
  const month = months.get(match[2].toLowerCase());
  if (month === undefined) throw new Error("Ethena 数据归属月份无效");
  const yearNumber = Number(match[3]);
  const year = yearNumber < 100 ? 2000 + yearNumber : yearNumber;
  const parsed = new Date(Date.UTC(year, month, Number(match[1])));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month || parsed.getUTCDate() !== Number(match[1])) {
    throw new Error("Ethena 数据归属日期无效");
  }
  return parsed.toISOString();
}

export function parseEthenaYield(payload) {
  const candidate = payload?.stakingYield ?? payload?.staking_apy ?? payload?.sUSDeAPY ?? payload?.susdeApy;
  const rawValue = candidate && typeof candidate === "object" ? candidate.value : candidate;
  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric)) throw new Error("Ethena 返回结构不完整");
  const sourceTime = candidate && typeof candidate === "object" ? candidate.lastUpdated : payload?.timestamp;
  return {
    value: numeric <= 1 ? numeric * 100 : numeric,
    dataAsOf: parseEthenaTimestamp(sourceTime),
  };
}

export async function fetchOkxFunding() {
  const url = "https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP";
  const payload = await (await fetchWithTimeout(url)).json();
  const row = payload?.data?.[0];
  if (payload?.code !== "0" || !row) throw new Error("OKX 返回结构不完整");
  const rate = Number(row.fundingRate);
  const periodHours = (Number(row.nextFundingTime) - Number(row.fundingTime)) / 3_600_000 || 8;
  return { provider: "OKX", annualized: annualizeFunding(rate, periodHours), rawRate: rate, dataAsOf: new Date(Number(row.ts)).toISOString(), sourceUrl: url };
}

export async function fetchBybitFunding() {
  const url = "https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT";
  const payload = await (await fetchWithTimeout(url)).json();
  const row = payload?.result?.list?.[0];
  if (payload?.retCode !== 0 || !row) throw new Error("Bybit 返回结构不完整");
  const rate = Number(row.fundingRate);
  const periodHours = Number(row.fundingIntervalHour) || 8;
  return { provider: "Bybit", annualized: annualizeFunding(rate, periodHours), rawRate: rate, dataAsOf: new Date(Number(payload.time)).toISOString(), sourceUrl: url };
}

export async function fetchBinanceFunding() {
  const url = "https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT";
  const payload = await (await fetchWithTimeout(url)).json();
  const rate = Number(payload.lastFundingRate);
  if (!Number.isFinite(rate) || !Number.isFinite(Number(payload.time))) throw new Error("Binance 返回结构不完整");
  return { provider: "Binance", annualized: annualizeFunding(rate, 8), rawRate: rate, dataAsOf: new Date(Number(payload.time)).toISOString(), sourceUrl: url };
}

export async function fetchDefiLlamaAave() {
  const url = "https://yields.llama.fi/pools";
  const payload = await (await fetchWithTimeout(url, {}, 18_000)).json();
  const candidates = (payload?.data ?? []).filter((pool) =>
    String(pool.project).toLowerCase().includes("aave") &&
    ["USDC", "USDT"].includes(String(pool.symbol).toUpperCase()) &&
    pool.apy !== null && pool.apy !== "" && Number.isFinite(Number(pool.apy))
  );
  candidates.sort((a, b) => Number(b.tvlUsd ?? 0) - Number(a.tvlUsd ?? 0));
  if (!candidates.length) throw new Error("DefiLlama 未找到 Aave USDT/USDC 池");
  const selected = ["USDT", "USDC"].flatMap((symbol) => {
    const match = candidates.find((pool) => String(pool.symbol).toUpperCase() === symbol);
    return match ? [match] : [];
  });
  if (selected.length !== 2) throw new Error("DefiLlama 未同时找到 Aave USDT 与 USDC 主池");
  const chartRows = await Promise.all(selected.map(async (pool) => {
    if (!/^[a-f0-9-]{36}$/i.test(String(pool.pool))) throw new Error("DefiLlama 池 ID 无效");
    const chartUrl = `https://yields.llama.fi/chart/${pool.pool}`;
    const chart = await (await fetchWithTimeout(chartUrl, {}, 18_000)).json();
    return { pool, ...parseDefiLlamaYieldChart(chart, pool.symbol) };
  }));
  if (chartRows.some((row) => row.timestamp > Date.now() + 300_000)) throw new Error("DefiLlama 池历史时间在未来");
  return {
    value: chartRows.reduce((sum, row) => sum + row.value, 0) / chartRows.length,
    dataAsOf: new Date(Math.min(...chartRows.map((row) => row.timestamp))).toISOString(),
    sourceUrl: url,
    source: "DefiLlama Aave USDT/USDC 池历史",
    explanation: "Aave 两个高 TVL 稳定币池最新供应 APY 的简单平均；仅作链上借贷参考，非 CEX 保本或同风险报价。",
    note: chartRows.map(({ pool }) => `${pool.chain}/${pool.symbol} (${pool.pool})`).join(" + ") + "；利率与归属时间取各池历史最新点",
  };
}

export function parseDefiLlamaYieldChart(chart, symbol) {
  if (chart?.status !== "success" || !Array.isArray(chart.data)) throw new Error(`DefiLlama ${symbol} 历史结构无效`);
  const latest = chart.data
    .filter((point) => point?.apy !== null && point?.apy !== "" && Number.isFinite(Number(point?.apy)) && Number(point.apy) >= 0 && Number.isFinite(Date.parse(point.timestamp)))
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))[0];
  if (!latest) throw new Error(`DefiLlama ${symbol} 历史点缺少利率或归属时间`);
  return { value: Number(latest.apy), timestamp: Date.parse(latest.timestamp) };
}

export async function fetchJitoSolApy() {
  const url = "https://kobe.mainnet.jito.network/api/v1/stake_pool_stats";
  const end = new Date();
  const start = new Date(end.getTime() - 14 * 86_400_000);
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ bucket_type: "Daily", range_filter: { start: start.toISOString(), end: end.toISOString() }, sort_by: { field: "BlockTime", order: "Asc" } }),
  });
  const payload = await response.json();
  const latest = payload?.apy?.at(-1);
  if (!latest || !Number.isFinite(Number(latest.data))) throw new Error("Jito 返回结构不完整");
  return { value: Number(latest.data) * 100, dataAsOf: latest.date, sourceUrl: url, note: "JitoSOL APY proxy" };
}

export async function fetchEthenaSusde() {
  const url = "https://app.ethena.fi/api/yields/protocol-and-staking-yield";
  try {
    const payload = await (await fetchWithTimeout(url, {}, 18_000)).json();
    const official = parseEthenaYield(payload);
    const age = Date.now() - Date.parse(official.dataAsOf);
    if (Number.isFinite(age) && age >= -300_000 && age <= 36 * 3_600_000) {
      return {
        ...official, sourceUrl: url, source: "Ethena 官方 sUSDe 年化",
        explanation: "sUSDe 协议收益率，非银行存款或保本产品；实际回报随协议收益与赎回条件变化。",
        note: "Ethena 官方源最新值",
      };
    }
  } catch {
    // 官方源失效或归属过旧时，只尝试有独立时间戳的公开池历史。
  }
  return fetchDefiLlamaSusde();
}

export async function fetchDefiLlamaSusde() {
  const poolsUrl = "https://yields.llama.fi/pools";
  const payload = await (await fetchWithTimeout(poolsUrl, {}, 18_000)).json();
  const selected = (payload?.data ?? [])
    .filter((pool) => pool.project === "ethena-usde" && pool.chain === "Ethereum" && String(pool.symbol).toUpperCase() === "SUSDE")
    .sort((a, b) => Number(b.tvlUsd ?? 0) - Number(a.tvlUsd ?? 0))[0];
  if (!selected || !/^[a-f0-9-]{36}$/i.test(String(selected.pool))) throw new Error("DefiLlama 未找到可核实的 sUSDe 池");
  const chartUrl = `https://yields.llama.fi/chart/${selected.pool}`;
  const chart = await (await fetchWithTimeout(chartUrl, {}, 18_000)).json();
  const latest = parseDefiLlamaYieldChart(chart, "sUSDe");
  if (latest.timestamp > Date.now() + 300_000) throw new Error("DefiLlama sUSDe 历史时间在未来");
  return {
    value: latest.value, dataAsOf: new Date(latest.timestamp).toISOString(), sourceUrl: chartUrl,
    source: "DefiLlama ethena-usde sUSDe 池历史",
    explanation: "sUSDe 链上池的公开 APY 参考；非银行存款或保本产品，解除质押及区域条件需另核。",
    note: `Ethena 官方源未取得 36 小时内数据；改用 DefiLlama ${selected.chain}/sUSDe 池历史；${selected.poolMeta || "退出规则以协议为准"}`,
  };
}

export function parseLidoSteth(payload) {
  const value = Number(payload?.data?.apr);
  const seconds = Number(payload?.data?.timeUnix);
  if (payload?.meta?.symbol !== "stETH" || !Number.isFinite(value) || value < 0 || !Number.isInteger(seconds) || seconds < 1_600_000_000) {
    throw new Error("Lido APR 或源端业务时间无效");
  }
  return {
    id: "lido-steth", sector: "DEX", name: "Lido stETH 质押", shortName: "Lido", value, unit: "% APR",
    rateKind: "staking", dataAsOf: new Date(seconds * 1000).toISOString(),
    source: "Lido 官方 APR", sourceUrl: "https://eth-api.lido.fi/v1/protocol/steth/apr/last",
    coverage: "stETH 最近一次重基准 APR；不等于固定收益或即时赎回报价",
  };
}

export async function fetchLidoSteth() {
  const url = "https://eth-api.lido.fi/v1/protocol/steth/apr/last";
  return parseLidoSteth(await (await fetchWithTimeout(url)).json());
}

export function parseAllySavings(html) {
  const rateMatch = html.match(/([0-9]+(?:\.[0-9]+)?)% correct as of (\d{2})\/(\d{2})\/(\d{2})/);
  const dateMatch = html.match(/Our Annual Percentage Yields \(APYs\) are accurate as of[\s\S]{0,180}?<time[^>]*>(\d{2})\/(\d{2})\/(\d{4})<\/time>/);
  if (!rateMatch || !dateMatch) throw new Error("Ally 未取得同页利率与生效日");
  const [, rate, month, day, yearShort] = rateMatch;
  const sourceDate = `${dateMatch[3]}-${dateMatch[1]}-${dateMatch[2]}`;
  const labelDate = `20${yearShort}-${month}-${day}`;
  const parsed = new Date(`${sourceDate}T00:00:00Z`);
  if (sourceDate !== labelDate || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== sourceDate || Number(rate) <= 0 || Number(rate) > 20) {
    throw new Error("Ally 利率、生效日不一致或越界");
  }
  return {
    id: "ally-savings", sector: "Web2", name: "Ally 储蓄账户", shortName: "Ally", value: Number(rate), unit: "% APY",
    rateKind: "bank-savings", dataAsOf: sourceDate, dataTimeKind: "date-only",
    source: "Ally 官方储蓄账户页", sourceUrl: "https://www.ally.com/bank/online-savings-account/",
    coverage: "美国储蓄账户；浮动 APY、地区与开户资格适用；官网仅标生效日期，未标具体时刻",
  };
}

export async function fetchAllySavings() {
  const url = "https://www.ally.com/bank/online-savings-account/";
  return parseAllySavings(await (await fetchWithTimeout(url, {}, 18_000)).text());
}

export function parseTreasury3mXml(xml) {
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((match) => match[1]);
  const parsed = entries.flatMap((entry) => {
    const rawDate = entry.match(/<d:NEW_DATE[^>]*>([^<]+)<\/d:NEW_DATE>/)?.[1];
    const date = /^\d{4}-\d{2}-\d{2}T00:00:00(?:\.000)?$/.test(rawDate ?? "") ? rawDate.slice(0, 10) : null;
    const value = entry.match(/<d:BC_3MONTH[^>]*>([^<]+)<\/d:BC_3MONTH>/)?.[1];
    const timestamp = date ? Date.parse(`${date}T00:00:00Z`) : NaN;
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === date && value !== "" && Number.isFinite(Number(value)) ? [{ date, value: Number(value) }] : [];
  });
  parsed.sort((a, b) => a.date.localeCompare(b.date));
  const latest = parsed.at(-1);
  if (!latest) throw new Error("Treasury XML 未找到 3M 值");
  return { value: latest.value, dataAsOf: latest.date, note: "财政部只披露业务日期，未披露日内时刻" };
}

export async function fetchTreasury3m() {
  const year = new Date().getUTCFullYear();
  const url = `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=${year}`;
  const xml = await (await fetchWithTimeout(url)).text();
  return { ...parseTreasury3mXml(xml), sourceUrl: url };
}

export function parseBybitEarn(payload) {
  if(payload?.retCode!==0 || !Number.isFinite(Number(payload.time)) || !Array.isArray(payload?.result?.list)) throw new Error('Bybit Earn 返回合同无效');
  const rows=[];
  for(const p of payload.result.list) {
    if(!['USDT','USDC','BTC','ETH','SOL'].includes(p.coin) || p.status!=='Available' || p.category!=='FlexibleSaving')continue;
    if(typeof p.productId!=='string'||!p.productId.trim())throw new Error('Bybit 产品 ID 缺失');
    const tiers=p.hasTieredApr?p.tierAprDetails:[{min:p.minStakeAmount,max:p.maxStakeAmount,apr:p.estimateApr}];
    if(!Array.isArray(tiers)||!tiers.length)throw new Error('Bybit 缺少阶梯');
    for(const t of tiers){
      if(!/^\d+(?:\.\d+)?$/.test(String(t.min??''))||!(/^-?\d+(?:\.\d+)?$/.test(String(t.max??'')))||!(Number(t.max)===-1||Number(t.max)>Number(t.min)))throw new Error('Bybit 阶梯范围无效');
      const raw=String(t.apr??t.estimateApr??'');
      if(!/^\d+(?:\.\d+)?%$/.test(raw))throw new Error('Bybit APR 单位不明确');
      const apy=Number(raw.slice(0,-1));
      rows.push({platform:'Bybit',coin:p.coin,productId:String(p.productId),term:'活期',tier:`${t.min}–${String(t.max)==='-1'?'无上限':t.max} ${p.coin}`,apy,rateType:'APR',dataTimeKind:'response',source:'Bybit public Earn API (FlexibleSaving)',sourceUrl:'https://api.bybit.com/v5/earn/product?category=FlexibleSaving',dataAsOf:new Date(Number(payload.time)).toISOString(),note:'预估年化；归属为公开响应时间，非产品独立更新时间；资格与余额以产品页为准'});
    }
  }
  if(new Set(rows.map(r=>r.coin)).size!==5)throw new Error('Bybit 目标币种覆盖不完整');
  return rows;
}
export async function fetchBybitEarnProducts() {
  const url='https://api.bybit.com/v5/earn/product?category=FlexibleSaving';
  return parseBybitEarn(await (await fetchWithTimeout(url)).json());
}
export function parseBitgetEarn(html,observedAt) {
  const legacy=html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  const zeus=html.match(/<script[^>]*>\s*window\.__ZEUS_REACT_QUERY_STATE__\s*=\s*([\s\S]*?)<\/script>/);
  if(!legacy&&!zeus)throw new Error('Bitget 无公开产品结构');
  const query=zeus?JSON.parse(zeus[1])?.queries?.find(q=>Array.isArray(q?.state?.data?.listData)):null;
  const groups=zeus?query?.state?.data?.listData:JSON.parse(legacy[1])?.props?.pageProps?.listData;
  if(!Array.isArray(groups))throw new Error('Bitget 结构变更');
  const responseTime=zeus?Number(query?.dehydratedAt):Date.parse(observedAt);
  if(!Number.isFinite(Date.parse(observedAt))||!Number.isFinite(responseTime)||responseTime>Date.parse(observedAt)+300_000)throw new Error('Bitget 页面响应时间无效');
  const dataAsOf=new Date(responseTime).toISOString();
  const rows=[],seen=new Set();
  for(const group of groups)for(const line of group.bizLineProductList??[])for(const p of line.productList??[]) {
    if(!['USDT','USDC','BTC','ETH','SOL'].includes(p.coinName)||p.secondBizLine!=='Savings'||p.productLevel!==1||p.visibleApy!==true)continue;
    if(!p.id||seen.has(p.id))continue; seen.add(p.id);
    if(![1,2].includes(p.periodType)||p.status!==2||!Array.isArray(p.apyList)||!p.apyList.length)throw new Error('Bitget 产品状态或阶梯需复核');
    if(p.periodType===2&&(!Number.isInteger(p.period)||p.period<=0))throw new Error('Bitget 定期期限无效');
    for(const t of p.apyList){
      if(!/^(?:\d+)(?:\.\d+)?$/.test(String(t.apy??''))||!/^\d+(?:\.\d+)?$/.test(String(t.minStepValue??''))||!/^\d+(?:\.\d+)?$/.test(String(t.maxStepValue??''))||Number(t.maxStepValue)<=Number(t.minStepValue))throw new Error('Bitget 阶梯不完整');
      rows.push({platform:'Bitget',coin:p.coinName,productId:String(p.id),term:p.periodType===1?'活期':`定期 ${p.period} 天`,tier:`${Number(t.minStepValue)}–${Number(t.maxStepValue)} ${p.coinName}`,apy:Number(t.apy),rateType:'APR',dataTimeKind:zeus?'response':'observed',source:'Bitget public SSR Savings',sourceUrl:'https://www.bitget.com/finance',dataAsOf,note:`普通 Savings 公开展示阶梯；归属为${zeus?'页面 SSR 响应':'页面观察'}时间，源端利率更新时间未披露；是否可购以产品页为准`});
    }
  }
  if(new Set(rows.filter(r=>r.term==='活期').map(r=>r.coin)).size!==5)throw new Error('Bitget 活期覆盖不完整');
  return rows;
}
export async function fetchBitgetEarnProducts() {
  const html=await(await fetchWithTimeout('https://www.bitget.com/finance',{},18000)).text();
  return parseBitgetEarn(html,new Date().toISOString());
}
