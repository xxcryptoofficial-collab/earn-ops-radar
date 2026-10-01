import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {refreshSnapshot} from './refresh-snapshot.mjs';
import {setSourceEvidenceRecorder} from './source-adapters.mjs';
import {publicProjection} from './publish-pages.mjs';
import {validateSnapshot} from '../src/domain/contract.js';
import {validateRunStatus} from '../src/domain/run-status.js';
import {collectBinanceReference,parseCatalog} from './binance-reference.mjs';
const root=resolve(import.meta.dirname,'../..');
const json=async path=>JSON.parse(await readFile(path,'utf8'));
const bytes=x=>JSON.stringify(x);
const hash=s=>createHash('sha256').update(s).digest('hex');
async function atomic(path,value){await mkdir(dirname(path),{recursive:true});const tmp=path+'.tmp';await writeFile(tmp,bytes(value));await rename(tmp,path);}
export function expectedNextAt(now){const n=new Date(now);let next=Date.UTC(n.getUTCFullYear(),n.getUTCMonth(),n.getUTCDate(),1,10);if(next<=n.getTime())next+=86400000;return new Date(next).toISOString();}
export async function runCloudDaily({outputRoot=root,fixtureText=null,fixtureObservedAt=null,adapters,now=new Date()}={}){
 const startedAt=now.toISOString(),runId='earn-cloud-'+startedAt.replace(/[^0-9TZ]/g,'');
 const releaseId='rel-'+runId;let baseline=null;
 const previous=await json(resolve(outputRoot,'research-references.json')).catch(()=>({records:[],sources:[]}));
 const state=resolve(outputRoot,'runtime/state');await mkdir(state,{recursive:true});
 await atomic(resolve(outputRoot,'latest-attempt.json'),{schemaVersion:'1.0',runId,status:'RUNNING',startedAt,snapshotRunId:null});
 try{
  baseline=await json(resolve(outputRoot,'earn-snapshot.json'));
  await atomic(resolve(state,'snapshot.json'),baseline);await atomic(resolve(state,'manual.json'),{entries:[]});
  await atomic(resolve(state,'PUBLIC.json'),{schemaVersion:'1.0',scope:'external-public-only',records:[]});
  const apiResponses=[];setSourceEvidenceRecorder(response=>apiResponses.push(response));
  const refreshed=await refreshSnapshot({snapshotPath:resolve(state,'snapshot.json'),manualPath:resolve(state,'manual.json'),researchPath:resolve(state,'PUBLIC.json'),statusPath:resolve(state,'status.json'),archiveDir:resolve(state,'archive'),offline:fixtureText!==null, ...(adapters?{adapters}:{}),now:()=>fixtureText!==null?now:new Date()});
  let records=previous.records.filter(r=>!r.id.startsWith('reference-binance-catalog-'));let evidence=null;let browserStatus='failed';
  try{
   const result=fixtureText===null?await collectBinanceReference(previous.records):{records:parseCatalog(fixtureText,fixtureObservedAt,previous.records),evidence:{schemaVersion:'earn-public-browser-evidence/1.0',sourceUrl:'https://www.binance.com/en/earn/simple-earn',acquisitionMethod:'fixture-replay',observedAt:fixtureObservedAt,bodySha256:hash(fixtureText),body:fixtureText,currentQuoteVerified:false}};
   records.push(...result.records);evidence=result.evidence;browserStatus=fixtureText===null?'partial_catalog_read':'fixture_replay';
  }catch{
   records.push(...previous.records.filter(r=>r.id.startsWith('reference-binance-catalog-')));
  }
  const finishedAt=new Date().toISOString();
  const realSources=refreshed.status.sourceRuns.filter(s=>!s.id.startsWith('manual-'));
  const apiAttempts=realSources.map(s=>({id:s.id,status:s.status,dataAsOf:s.dataAsOf,fetchedAt:s.fetchedAt,errorCode:s.status==='failed'?(s.message.match(/HTTP\s+(\d{3})/)?.[1]??'SOURCE_READ_OR_CONTRACT_FAILED'):null}));
  const rawStatus={...refreshed.status,sourceRuns:realSources,runId,status:'PARTIAL',startedAt,finishedAt,snapshotRunId:runId,message:'公开API逐源记录；Binance仅目录参考，OKX托管来源地区限制，非完整挂牌覆盖'};
  const rawSnapshot={...refreshed.snapshot,sourceRuns:realSources,meta:{...refreshed.snapshot.meta,runId,runStatus:'PARTIAL',generatedAt:finishedAt}};
  const projected=publicProjection(rawSnapshot,rawStatus);projected.snapshot.meta.releaseId=releaseId;projected.status.releaseId=releaseId;
  const errors=[...validateSnapshot(projected.snapshot),...validateRunStatus(projected.status)];if(errors.length)throw Error('PROJECTED_CONTRACT_REJECTED');
  const references={schemaVersion:'earn-public-reference/1.0',scope:'external-public-only',releaseId,runId,boundSnapshotRunId:runId,currentQuoteVerified:false,records,sources:[{id:'binance-catalog',status:browserStatus,lastObservedAt:evidence?.observedAt??previous.sources?.find(s=>s.id==='binance-catalog')?.lastObservedAt??null,currentQuoteVerified:false},{id:'okx-catalog-hosted',status:'restricted_no_retry',sourceUrl:'https://www.okx.com/earn/simple-earn',lastAccessAttemptAt:'2026-10-01T03:40:37.267Z',restriction:'Official page states unavailable in runner country/region due to local laws and regulations; no locale/proxy/account bypass',currentQuoteVerified:false}]};
  const index={schemaVersion:'earn-public-research-index/1.0',scope:'external-public-only',releaseId,runId,records:records.map(r=>({...r,knowledgeClass:'source-reference-with-stated-limitations',analysisInference:null})),sources:references.sources};
  const evidenceIndex={schemaVersion:'earn-public-evidence-index/1.0',scope:'external-public-only',releaseId,runId,apiAttempts,apiResponses,evidence:evidence?[evidence]:[]};
  const dir=resolve(outputRoot,'releases',releaseId);await mkdir(dir,{recursive:true});
  const payloads={snapshot:['earn-snapshot.json',projected.snapshot],status:['run-status.json',projected.status],references:['research-references.json',references],index:['research-index.json',index],evidence:['evidence-index.json',evidenceIndex]};const files={};
  for(const [key,[name,value]]of Object.entries(payloads)){const data=bytes(value);await writeFile(resolve(dir,name),data,{flag:'wx'});files[key]={path:`releases/${releaseId}/${name}`,sha256:hash(data)};}
  const manifest={schemaVersion:'earn-public-release/1.0',scope:'external-public-only',releaseId,snapshotRunId:runId,expectedNextAt:expectedNextAt(finishedAt),graceSeconds:3600,files};
  await atomic(resolve(outputRoot,'earn-snapshot.json'),projected.snapshot);await atomic(resolve(outputRoot,'run-status.json'),projected.status);await atomic(resolve(outputRoot,'research-references.json'),references);
  await atomic(resolve(outputRoot,'current.json'),manifest);await atomic(resolve(outputRoot,'latest-attempt.json'),{...projected.status,stage:'COLLECTED_PENDING_PUBLICATION',acquisitionMode:fixtureText===null?'live':'fixture_replay'});
  setSourceEvidenceRecorder(null);
  return{runId,releaseId,status:'PARTIAL',browserStatus,referenceRecords:records.length};
 }catch{
  setSourceEvidenceRecorder(null);
  await atomic(resolve(outputRoot,'latest-attempt.json'),{schemaVersion:'1.0',runId,status:'FAILED',startedAt,finishedAt:new Date().toISOString(),snapshotRunId:baseline?.meta?.runId??null,message:'Cloud collection failed; previous verified release retained'});
  throw Error('CLOUD_COLLECTION_FAILED');
 }
}
if(process.argv[1]===import.meta.filename){runCloudDaily({outputRoot:process.argv.includes('--output-root')?resolve(process.argv[process.argv.indexOf('--output-root')+1]):root}).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1;});}
