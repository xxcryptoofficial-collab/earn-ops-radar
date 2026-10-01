const RUN_STATUSES = new Set(["COMMITTED", "PARTIAL", "FAILED"]);
const SOURCE_STATUSES = new Set(["fresh", "failed"]);

function isIsoTime(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

export function validateRunStatus(status) {
  const errors = [];
  if (!status || typeof status !== "object") return ["运行状态不是对象"];
  for (const key of ["schemaVersion", "runId", "status", "startedAt", "finishedAt", "message", "sourceRuns"]) {
    if (!(key in status)) errors.push(`runStatus.${key} 缺失`);
  }
  if (status.schemaVersion !== "1.0") errors.push("runStatus.schemaVersion 必须为 1.0");
  if (typeof status.runId !== "string" || status.runId.trim() === "") errors.push("runStatus.runId 为空");
  if (!RUN_STATUSES.has(status.status)) errors.push("runStatus.status 非法");
  if (!isIsoTime(status.startedAt) || !isIsoTime(status.finishedAt)) errors.push("runStatus 起止时间非法");
  if (!Array.isArray(status.sourceRuns)) errors.push("runStatus.sourceRuns 必须是数组");
  for (const [index, source] of (status.sourceRuns ?? []).entries()) {
    if (typeof source.id !== "string" || source.id.trim() === "") errors.push(`runStatus.sourceRuns[${index}].id 为空`);
    if (!SOURCE_STATUSES.has(source.status)) errors.push(`runStatus.sourceRuns[${index}].status 非法`);
    if (!isIsoTime(source.fetchedAt)) errors.push(`runStatus.sourceRuns[${index}].fetchedAt 非法`);
    if (source.dataAsOf !== null && !isIsoTime(source.dataAsOf)) errors.push(`runStatus.sourceRuns[${index}].dataAsOf 非法`);
    if (typeof source.message !== "string" || source.message.trim() === "") errors.push(`runStatus.sourceRuns[${index}].message 为空`);
  }
  return errors;
}
