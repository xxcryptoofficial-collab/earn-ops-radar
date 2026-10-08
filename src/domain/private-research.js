// Pure validation of a user-selected file. No network or browser storage.
export const MAX_PRIVATE_FILE_BYTES = 1024 * 1024;
const statuses = new Set(['suggested', 'adopted', 'implemented', 'effect-verified']);
const states = new Set(['pending', 'passed', 'blocked']);
const fail = () => { throw new Error('请选择有效的研究展示文件；本次内容未载入。'); };
const text = (v, max = 12000) => typeof v === 'string' && v.length > 0 && v.length <= max ? v : fail();
const date = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(v) && Number.isFinite(Date.parse(v)) ? v : fail();
export function safeSourceUrl(v) {
  text(v, 2048);
  let u; try { u = new URL(v); } catch { fail(); }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443') || !u.hostname.includes('.') || /^(localhost|127\.|0\.|\[)/i.test(u.hostname)) fail();
  return u.href;
}
export function parsePrivateResearch(input) {
  if (typeof input !== 'string' || new TextEncoder().encode(input).length > MAX_PRIVATE_FILE_BYTES) fail();
  let data; try { data = JSON.parse(input); } catch { fail(); }
  if (!data || data.schemaVersion !== 'earn-private-research-view/1.0' || data.scope !== 'internal-only') fail();
  const a = data.authority;
  if (!a || !Number.isInteger(a.version) || a.version < 1 || !/^[a-f0-9]{64}$/.test(a.internalSha256 ?? '') || !/^[a-f0-9]{64}$/.test(a.briefSha256 ?? '')) fail();
  if (!Array.isArray(data.cards) || !data.cards.length || data.cards.length > 40) fail();
  const ids = new Set();
  const cards = data.cards.map(c => {
    if (!c || ids.has(c.id)) fail();
    ids.add(text(c.id, 160));
    if (!Array.isArray(c.unknowns) || c.unknowns.length > 30 || !Array.isArray(c.recommendations) || !c.recommendations.length || c.recommendations.length > 10) fail();
    const keys = new Set();
    const recommendations = c.recommendations.map(r => {
      if (!r || !/^Q0[1-6]$/.test(r.questionId) || !statuses.has(r.status) || !states.has(r.validation)) fail();
      const key = `${r.questionId}:${text(r.issueKey, 160)}`;
      if (keys.has(key)) fail(); keys.add(key);
      // Construct an allowlisted model, rather than passing arbitrary input through.
      return {id:text(r.id, 160), questionId:r.questionId, issueKey:r.issueKey, status:r.status, validation:r.validation, acceptance:text(r.acceptance)};
    });
    if (c.evidenceKind !== 'official-text' || c.uiVerified !== false || c.currentAvailabilityVerified !== false) fail();
    return {id:c.id, platform:text(c.platform, 80), title:text(c.title, 240), fact:text(c.fact), implication:text(c.implication), suggestion:text(c.suggestion), sourceUrl:safeSourceUrl(c.sourceUrl), publishedDate:date(c.publishedDate), verifiedAt:date(c.verifiedAt), validUntil:c.validUntil == null ? null : date(c.validUntil), evidenceKind:c.evidenceKind, uiVerified:false, currentAvailabilityVerified:false, unknowns:c.unknowns.map(v=>text(v, 1000)), recommendations};
  });
  return {schemaVersion:data.schemaVersion, scope:data.scope, generatedAt:date(data.generatedAt), authority:{caseId:text(a.caseId, 160), version:a.version, internalSha256:a.internalSha256, briefSha256:a.briefSha256}, cards};
}
