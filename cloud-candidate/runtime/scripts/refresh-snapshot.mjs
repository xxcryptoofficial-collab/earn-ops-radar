import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  fetchBinanceFunding,
  fetchBybitEarnProducts,
  fetchBitgetEarnProducts,
  fetchBybitFunding,
  fetchDefiLlamaAave,
  fetchEthenaSusde,
  fetchJitoSolApy,
  fetchLidoSteth,
  fetchAllySavings,
  fetchOkxFunding,
  fetchTreasury3m,
} from "./source-adapters.mjs";
import { validateSnapshot } from "../src/domain/contract.js";
import { validateRunStatus } from "../src/domain/run-status.js";
import { mergePublicResearch } from "./public-research.mjs";
import { publicNews } from '../src/domain/visibility.js';

const projectRoot = resolve(import.meta.dirname, "..");
const defaultSnapshotPath = resolve(projectRoot, "public/earn-snapshot.json");
const defaultManualPath = resolve(projectRoot, "data/manual-competitor-input.json");
const defaultStatusPath = resolve(projectRoot, "data/run-status/latest.json");
const defaultArchiveDir = resolve(projectRoot, "data/archive");
export const RATE_STALE_AFTER_MS = 36 * 60 * 60 * 1000;
const defaultAdapters = {
  fetchBinanceFunding,
  fetchBybitEarnProducts,
  fetchBitgetEarnProducts,
  fetchBybitFunding,
  fetchDefiLlamaAave,
  fetchEthenaSusde,
  fetchJitoSolApy,
  fetchLidoSteth,
  fetchAllySavings,
  fetchOkxFunding,
  fetchTreasury3m,
};

async function readJson(pathname) {
  return JSON.parse(await readFile(pathname, "utf8"));
}

async function writeJsonAtomic(pathname, value) {
  await mkdir(resolve(pathname, ".."), { recursive: true });
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  const tempPath = `${pathname}.${process.pid}.tmp`;
  await writeFile(tempPath, serialized, "utf8");
  await rename(tempPath, pathname);
}

function iso(now) {
  return now().toISOString();
}

function makeRunId(startedAt, offline) {
  return `earn-${startedAt.replaceAll("-", "").replaceAll(":", "").replace(/\.\d{3}Z$/, "Z")}-${offline ? "offline" : "daily"}`;
}

export function markStale(previous, reason, checkedAt) {
  const next = {
    ...previous,
    status: "stale",
    lastCheckedAt: checkedAt,
  };
  if ("coverage" in previous) {
    const baseCoverage = String(previous.coverage || "保留上次值").replace(/；本轮失败：.*$/, "");
    next.coverage = `${baseCoverage}；本轮失败：${reason}`;
  } else {
    const baseNote = String(previous.note || "保留上次值").replace(/；本轮失败：.*$/, "");
    next.note = `${baseNote}；本轮失败：${reason}`;
  }
  return next;
}

export function markOverdue(record, checkedAt, maxAgeMs = RATE_STALE_AFTER_MS) {
  const fetchedAt = Date.parse(record.fetchedAt ?? record.listingFetchedAt);
  if (!Number.isFinite(fetchedAt) || Date.parse(checkedAt) - fetchedAt <= maxAgeMs) return record;
  const reason = `超过 ${Math.round(maxAgeMs / 3_600_000)} 小时未取得新值`;
  if ("listingFetchedAt" in record) {
    return { ...record, originKind: record.originKind ?? (record.status === "manual" ? "manual" : undefined), status: "stale", lastCheckedAt: checkedAt, note: `${String(record.note ?? "").replace(/；已过期：.*$/, "")}；已过期：${reason}` };
  }
  const aged = markStale(record, reason, checkedAt);
  if (record.status === "manual") aged.originKind = record.originKind ?? "manual";
  if ("coverage" in aged) aged.coverage = aged.coverage.replace("本轮失败", "已过期");
  if ("note" in aged) aged.note = aged.note.replace("本轮失败", "已过期");
  return aged;
}

function appendCurrentPoint(indicator, value, dataAsOf, checkedAt, kind = "live") {
  const date = String(dataAsOf).slice(0, 10);
  const history = [...indicator.history.filter((point) => point.date !== date), { date, value, kind }].slice(-370);
  return { ...indicator, value, dataAsOf, fetchedAt: checkedAt, lastCheckedAt: checkedAt, status: "live", history };
}

async function persistStatus(status, statusPath) {
  const errors = validateRunStatus(status);
  if (errors.length) throw new Error(`运行状态校验失败：${errors.join("；")}`);
  await writeJsonAtomic(statusPath, status);
}

export async function refreshSnapshot(options = {}) {
  const now = options.now ?? (() => new Date());
  const offline = options.offline ?? false;
  const snapshotPath = options.snapshotPath ?? defaultSnapshotPath;
  const manualPath = options.manualPath ?? defaultManualPath;
  const statusPath = options.statusPath ?? defaultStatusPath;
  const archiveDir = options.archiveDir ?? defaultArchiveDir;
  const adapters = { ...defaultAdapters, ...(options.adapters ?? {}) };
  const startedAt = iso(now);
  const runId = makeRunId(startedAt, offline);
  const previous = await readJson(snapshotPath);
  const manual = await readJson(manualPath);
  const sourceRuns = [];
  const upstreamById = new Map(previous.upstream.map((item) => [item.id, item]));
  const externalYieldsById = new Map((previous.externalYields ?? []).map((item) => [item.id, item]));
  const manualUpstreamIds = new Set(previous.upstream.filter((item) => item.status === "manual" || item.originKind === "manual").map((item) => item.id));
  const initialCheckedAt = startedAt;
  let competitorApy = manual.entries.map((entry) => markOverdue(entry, initialCheckedAt));

  async function runAdapter(id, adapter) {
    try {
      const result = await adapter();
      const checkedAt = iso(now);
      const rows = Array.isArray(result) ? result : [result];
      if (!rows.length) throw new Error("公开源未返回可用记录");
      const sourceTimes = rows.map((row) => Date.parse(row?.dataAsOf));
      if (sourceTimes.some((time) => !Number.isFinite(time) || time > Date.parse(checkedAt) + 300_000 || Date.parse(checkedAt) - time > RATE_STALE_AFTER_MS)) {
        const oldest = Math.min(...sourceTimes.filter(Number.isFinite));
        throw new Error(Number.isFinite(oldest)
          ? `公开源最近归属 ${new Date(oldest).toISOString()} 无效、在未来或超过 36 小时`
          : "公开源缺少有效数据归属时间");
      }
      sourceRuns.push({
        id,
        status: "fresh",
        dataAsOf: new Date(Math.min(...sourceTimes)).toISOString(),
        fetchedAt: checkedAt,
        message: "公开源回读成功",
      });
      return { ok: true, result, fetchedAt: checkedAt };
    } catch (error) {
      const checkedAt = iso(now);
      const reason = error instanceof Error ? error.message : String(error);
      sourceRuns.push({
        id,
        status: "failed",
        dataAsOf: null,
        fetchedAt: checkedAt,
        message: `抓取失败：${reason}`,
      });
      return { ok: false, error: reason, fetchedAt: checkedAt };
    }
  }

  try {
    let competitorActions = publicNews(previous.competitorActions);
    try {
      const research = await readJson(options.researchPath ?? resolve(projectRoot, 'data/public-research-input.json'));
      competitorActions = mergePublicResearch(competitorActions, research, startedAt);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (!offline) {
      const fundingResults = await Promise.all([
        runAdapter("binance-funding", adapters.fetchBinanceFunding),
        runAdapter("okx-funding", adapters.fetchOkxFunding),
        runAdapter("bybit-funding", adapters.fetchBybitFunding),
      ]);
      const availableFunding = fundingResults.filter((result) => result.ok).map((result) => result.result);
      const oldFunding = upstreamById.get("funding-mean");
      if (availableFunding.length) {
        const mean = availableFunding.reduce((sum, item) => sum + item.annualized, 0) / availableFunding.length;
        const latestTime = new Date(Math.max(...availableFunding.map((item) => Date.parse(item.dataAsOf)))).toISOString();
        const checkedAt = iso(now);
        upstreamById.set("funding-mean", {
          ...appendCurrentPoint(oldFunding, mean, latestTime, checkedAt),
          status: availableFunding.length === 3 ? "live" : "partial",
          source: `${availableFunding.map((item) => item.provider).join(" + ")} BTC 永续公开接口均值`,
          sourceUrl: availableFunding[0].sourceUrl,
          coverage: `${availableFunding.length}/3 家回读；按各自真实结算周期年化`,
        });
      } else {
        const latestFailure = fundingResults.map((result) => result.fetchedAt).sort().at(-1);
        upstreamById.set("funding-mean", markStale(oldFunding, "三家资金费率均失败", latestFailure));
      }

      const upstreamAdapters = [
        ["aave-stable", "defillama-aave", adapters.fetchDefiLlamaAave],
        ["sol-staking-proxy", "jito-sol", adapters.fetchJitoSolApy],
        ["susde", "ethena-susde", adapters.fetchEthenaSusde],
        ["treasury-3m", "treasury-3m", adapters.fetchTreasury3m],
      ];
      for (const [indicatorId, sourceId, adapter] of upstreamAdapters) {
        const old = upstreamById.get(indicatorId);
        const outcome = await runAdapter(sourceId, adapter);
        if (outcome.ok) {
          upstreamById.set(indicatorId, {
            ...appendCurrentPoint(old, outcome.result.value, outcome.result.dataAsOf, outcome.fetchedAt),
            source: outcome.result.source ?? old.source,
            sourceUrl: outcome.result.sourceUrl,
            explanation: outcome.result.explanation ?? old.explanation,
            coverage: outcome.result.note ?? "公开源回读成功",
          });
        } else {
          upstreamById.set(indicatorId, markStale(old, outcome.error, outcome.fetchedAt));
        }
      }

      for (const [id, adapter] of [["lido-steth", adapters.fetchLidoSteth], ["ally-savings", adapters.fetchAllySavings]]) {
        const outcome = await runAdapter(id, adapter);
        if (outcome.ok) {
          externalYieldsById.set(id, { ...outcome.result, status: "live", fetchedAt: outcome.fetchedAt });
        } else if (externalYieldsById.has(id)) {
          externalYieldsById.set(id, markStale(externalYieldsById.get(id), outcome.error, outcome.fetchedAt));
        }
      }

      const bybitProducts = await runAdapter("bybit-earn", adapters.fetchBybitEarnProducts);
      if (bybitProducts.ok) {
        const withoutBybit = competitorApy.filter((entry) => entry.platform !== "Bybit");
        competitorApy = [
          ...withoutBybit,
          ...bybitProducts.result.map((entry) => ({
            ...entry,
            deltaBp: 0,
            status: "live",
            fetchedAt: bybitProducts.fetchedAt,
            note: entry.note,
          })),
        ];
      } else {
        const previousBybit = previous.competitorApy
          .filter((entry) => entry.platform === "Bybit")
          .map((entry) => markStale(entry, bybitProducts.error, bybitProducts.fetchedAt));
        competitorApy = [
          ...competitorApy.filter((entry) => entry.platform !== "Bybit"),
          ...previousBybit,
        ];
      }
      const bitget = await runAdapter('bitget-earn', adapters.fetchBitgetEarnProducts);
      competitorApy = [
        ...competitorApy.filter(r=>r.platform!=='Bitget'),
        ...(bitget.ok ? bitget.result.map(r=>({...r,deltaBp:null,status:'live',fetchedAt:bitget.fetchedAt})) : previous.competitorApy.filter(r=>r.platform==='Bitget').map(r=>markStale(r,bitget.error,bitget.fetchedAt)))
      ];
    } else {
      sourceRuns.push({
        id: "offline-seed",
        status: "fresh",
        dataAsOf: previous.meta.dataDate,
        fetchedAt: iso(now),
        message: "仅合并人工公开种子；未触发网络请求",
      });
    }

    const manualCheckAt = iso(now);
    for (const [id, item] of upstreamById.entries()) {
      if (["manual", "stale"].includes(item.status)) upstreamById.set(id, markOverdue(item, manualCheckAt));
    }
    for (const [id, item] of externalYieldsById.entries()) {
      externalYieldsById.set(id, markOverdue(item, manualCheckAt));
    }
    const ledgerProducts = previous.ledger.products.map((product) => markOverdue(product, manualCheckAt));
    const manualCompetitorRows = competitorApy.filter((entry) => !['Bybit','Bitget'].includes(entry.platform));
    const staleManualCompetitorRows = manualCompetitorRows.filter((entry) => entry.status === "stale");
    const manualUpstreamRows = [...upstreamById.values()].filter((entry) => manualUpstreamIds.has(entry.id) || entry.originKind === "manual");
    const staleManualUpstream = manualUpstreamRows.filter((entry) => entry.status === "stale");
    const staleLedgerRows = ledgerProducts.filter((entry) => entry.status === "stale");
    const addManualRun = (id, rows, staleRows, label) => {
      const dataTimes = rows.map((entry) => Date.parse(entry.dataAsOf ?? entry.listingDataAsOf)).filter(Number.isFinite);
      sourceRuns.push({
        id,
        status: staleRows.length ? "failed" : "fresh",
        dataAsOf: dataTimes.length ? new Date(Math.max(...dataTimes)).toISOString() : null,
        fetchedAt: manualCheckAt,
        message: staleRows.length ? `${label}有 ${staleRows.length}/${rows.length} 条超过 36 小时未复核` : `${label}仍在 36 小时时效内`,
      });
    };
    addManualRun("manual-competitor-input", manualCompetitorRows, staleManualCompetitorRows, "人工竞品挂牌");
    addManualRun("manual-upstream-seed", manualUpstreamRows, staleManualUpstream, "人工上游种子");
    addManualRun("manual-coinw-ledger", ledgerProducts, staleLedgerRows, "CoinW 公开挂牌种子");

    const finishedAt = iso(now);
    const runStatus = offline || sourceRuns.some((run) => run.status === "failed") ? "PARTIAL" : "COMMITTED";
    const next = {
      ...previous,
      meta: {
        ...previous.meta,
        runId,
        runStatus,
        generatedAt: finishedAt,
        dataDate: finishedAt.slice(0, 10),
      },
      upstream: [...upstreamById.values()],
      externalYields: [...externalYieldsById.values()],
      competitorApy,
      competitorActions,
      ledger: { ...previous.ledger, products: ledgerProducts },
      sourceRuns,
    };
    const snapshotErrors = validateSnapshot(next);
    if (snapshotErrors.length) throw new Error(`快照校验失败：${snapshotErrors.join("；")}`);

    await writeJsonAtomic(snapshotPath, next);
    await mkdir(archiveDir, { recursive: true });
    await writeFile(resolve(archiveDir, `${runId}.json`), `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    const status = {
      schemaVersion: "1.0",
      runId,
      status: runStatus,
      startedAt,
      finishedAt,
      snapshotRunId: runId,
      message: runStatus === "COMMITTED" ? "全部自动来源回读成功" : "部分来源未取得有效数据；过期内容不展示，旧值仅保留历史",
      sourceRuns,
    };
    await persistStatus(status, statusPath);
    return { snapshot: next, status };
  } catch (error) {
    const finishedAt = iso(now);
    const reason = error instanceof Error ? error.message : String(error);
    const status = {
      schemaVersion: "1.0",
      runId,
      status: "FAILED",
      startedAt,
      finishedAt,
      snapshotRunId: previous.meta.runId,
      message: reason,
      sourceRuns,
    };
    await persistStatus(status, statusPath);
    throw error;
  }
}

if (process.argv[1] === import.meta.filename) {
  refreshSnapshot({ offline: process.argv.includes("--offline") })
    .then(({ snapshot, status }) => {
      console.log(JSON.stringify({
        status: status.status,
        runId: status.runId,
        upstream: snapshot.upstream.length,
        competitorApy: snapshot.competitorApy.length,
        sourceRuns: status.sourceRuns.length,
      }, null, 2));
    })
    .catch((error) => {
      console.error(JSON.stringify({ status: "FAILED", error: error.message }, null, 2));
      process.exitCode = 1;
    });
}
