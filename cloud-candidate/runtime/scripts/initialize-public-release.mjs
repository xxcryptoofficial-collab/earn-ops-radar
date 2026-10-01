import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {validateSnapshot} from '../src/domain/contract.js';
import {validateRunStatus} from '../src/domain/run-status.js';
const root=resolve(import.meta.dirname,'../..');const read=async name=>JSON.parse(await readFile(resolve(root,name),'utf8'));
const snapshot=await read('earn-snapshot.json'),status=await read('run-status.json'),references=await read('research-references.json');
if([...validateSnapshot(snapshot),...validateRunStatus(status)].length)throw Error('BASELINE_IMPORT_INVALID');
const releaseId='rel-initial-public-import',runId=snapshot.meta.runId;
snapshot.meta.releaseId=releaseId;snapshot.meta.deliveryMode='public-baseline-import';status.releaseId=releaseId;
references.originalAcquisitionRunId=references.runId;references.runId=runId;references.releaseId=releaseId;references.boundSnapshotRunId=runId;
const index={schemaVersion:'earn-public-research-index/1.0',scope:'external-public-only',releaseId,runId,records:references.records,sources:references.sources??[]};
const evidence={schemaVersion:'earn-public-evidence-index/1.0',scope:'external-public-only',releaseId,runId,evidence:references.records.flatMap(r=>r.acquisition??[])};
const dir=resolve(root,'releases',releaseId);await mkdir(dir,{recursive:true});const files={};
for(const [role,name,value]of [['snapshot','earn-snapshot.json',snapshot],['status','run-status.json',status],['references','research-references.json',references],['index','research-index.json',index],['evidence','evidence-index.json',evidence]]){
 const body=JSON.stringify(value);await writeFile(resolve(dir,name),body,{flag:'wx'});files[role]={path:`releases/${releaseId}/${name}`,sha256:createHash('sha256').update(body).digest('hex')};
}
for(const [name,value]of [['earn-snapshot.json',snapshot],['run-status.json',status],['research-references.json',references],['current.json',{schemaVersion:'earn-public-release/1.0',scope:'external-public-only',releaseId,snapshotRunId:runId,expectedNextAt:'2026-10-02T01:10:00Z',graceSeconds:3600,files}],['latest-attempt.json',{...status,stage:'BASELINE_IMPORTED_NOT_NEW_COLLECTION'}]])await writeFile(resolve(root,name),JSON.stringify(value));
console.log(JSON.stringify({releaseId,runId,mode:'public-baseline-import'}));
