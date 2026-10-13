// Accept only the public research contract, never the owner dashboard schema.
const forbidden = new Set(['operations','execution','recommendations','acceptance','authoritySyncRequests','cachedAuthority','dailyReportCheckpoint','dailyReportHistory','reportedAmount','reportedPeople','previousAmount','snapshotDifference','libraryFileId','privateDashboard','ownerEmail','password','accessToken','apiKey','__proto__','constructor','prototype']);
function publicTree(value) {
  if(!value || typeof value!=='object')return;
  for(const [key,item] of Object.entries(value)) {
    if(forbidden.has(key))throw Error('PRIVATE_FIELD_REJECTED');
    publicTree(item);
  }
}
function keys(object,allowed) {
  if(!object || typeof object!=='object' || Array.isArray(object))throw Error('PUBLIC_OBJECT_REQUIRED');
  if(Object.keys(object).some(key=>!allowed.includes(key)))throw Error('PUBLIC_FIELD_REJECTED');
}
const metaKeys=['runId','runStatus','generatedAt','dataDate','scope','disclaimer','historyNotice','releaseId','latestAttempt','releaseStatus','deliveryMismatch','deliveryCommit','expectedNextAt','graceSeconds','missedOrStale','displayedSnapshotRunId','latestAttemptRunId','cachedFallback','deliveryError','attemptCommit'];
const quoteKeys=['apy','coin','dataAsOf','dataTimeKind','deltaBp','fetchedAt','lastCheckedAt','note','platform','productId','rateType','source','sourceUrl','status','term','tier','eligibility','validUntil'];
const observationKeys=['conditions','contentKind','dataAsOf','fact','fetchedAt','firstObservedAt','geo','id','platform','publishedAt','regionGroup','sector','soWhat','source','sourceUrl','startsAt','studyPeriod','summary','title','type','validUntil','status','changeEvidence'];
const referenceKeys=['acquisition','classification','coin','conditions','contentKind','coverage','currentQuoteVerified','evidenceRefs','fact','fetchedAt','fieldsUnknown','firstObservedAt','id','observedAt','platform','publishedAt','rateAsOf','rawDisplay','retrievedAt','sector','source','sourceUrl','startsAt','term','title','validUntil','verifiedAt'];
const indicatorKeys=['coverage','dataAsOf','dataTimeKind','fetchedAt','history','id','lastCheckedAt','name','originKind','rateKind','sector','shortName','source','sourceUrl','status','unit','value'];
export function validatePublicReferences(data,runId,releaseId) {
  publicTree(data);
  keys(data,['schemaVersion','scope','releaseId','runId','boundSnapshotRunId','currentQuoteVerified','records','sources']);
  if(data.schemaVersion!=='earn-public-reference/1.0'||data.scope!=='external-public-only'||data.boundSnapshotRunId!==runId||data.releaseId!==releaseId||data.currentQuoteVerified!==false||!Array.isArray(data.records)||!Array.isArray(data.sources))throw Error('PUBLIC_REFERENCE_REJECTED');
  for(const item of data.records){keys(item,referenceKeys);if(item.classification!=='research-reference-only'||item.currentQuoteVerified!==false||!Array.isArray(item.acquisition))throw Error('PUBLIC_REFERENCE_CLASSIFICATION_REJECTED');}
  for(const item of data.sources)keys(item,['currentQuoteVerified','id','lastAccessAttemptAt','lastObservedAt','restriction','sourceUrl','status']);
  return data;
}
export function validatePublicSnapshot(data) {
  publicTree(data);
  keys(data,['schemaVersion','meta','upstream','competitorApy','competitorActions','mechanisms','categoryHeat','productCoverage','ledger','sourceRuns','externalYields','researchReferences']);
  keys(data.meta,metaKeys);
  if(data.schemaVersion!=='1.0'||data.meta.scope!=='external-public-only'||typeof data.meta.runId!=='string'||typeof data.meta.releaseId!=='string'||!Number.isFinite(Date.parse(data.meta.generatedAt)))throw Error('PUBLIC_SNAPSHOT_REJECTED');
  for(const key of ['upstream','competitorApy','competitorActions','mechanisms','categoryHeat','sourceRuns','externalYields'])if(!Array.isArray(data[key]))throw Error('PUBLIC_ARRAY_REQUIRED');
  for(const item of data.competitorApy)keys(item,quoteKeys);
  for(const item of data.competitorActions)keys(item,observationKeys);
  for(const item of [...data.upstream,...data.externalYields])keys(item,indicatorKeys);
  for(const item of data.sourceRuns)keys(item,['dataAsOf','fetchedAt','id','message','status']);
  if(data.ledger?.products?.length)throw Error('OWN_LEDGER_REJECTED');
  if(data.researchReferences)validatePublicReferences(data.researchReferences,data.meta.runId,data.meta.releaseId);
  // Unused own-product scaffolding never enters page state or the public cache.
  const {schemaVersion,meta,upstream,competitorApy,competitorActions,mechanisms,categoryHeat,sourceRuns,externalYields,researchReferences}=data;
  return {schemaVersion,meta,upstream,competitorApy,competitorActions,mechanisms,categoryHeat,sourceRuns,externalYields,...(researchReferences?{researchReferences}:{})};
}
export function validatePublicManifest(data) {
  publicTree(data);
  if(data?.schemaVersion!=='earn-public-release/1.0'||data.scope!=='external-public-only'||typeof data.releaseId!=='string'||typeof data.snapshotRunId!=='string'||!data.files?.snapshot||!data.files?.status)throw Error('PUBLIC_MANIFEST_REJECTED');
  return data;
}
export function publicAttempt(data) {
  if(!data || typeof data!=='object')return null;
  publicTree(data);
  return Object.fromEntries(['runId','status','startedAt','finishedAt'].filter(key=>typeof data[key]==='string').map(key=>[key,data[key]]));
}
