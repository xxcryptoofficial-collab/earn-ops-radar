import {readFile,readdir,copyFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const source=resolve(process.argv[2]),destination=resolve(process.argv[3]);
const candidates=[];const first=new Map();
for(const directory of await readdir(source).catch(()=>[])){
 if(!/^\d+-\d+$/.test(directory))continue;
 const dir=resolve(source,directory);let m;
 try{m=JSON.parse(await readFile(resolve(dir,'current.json'),'utf8'));}catch{continue;}
 if(m.schemaVersion!=='earn-public-release/1.0'||m.scope!=='external-public-only')continue;
 const content={};
 for(const [role,f]of Object.entries(m.files)){
  if(!/^releases\/[a-zA-Z0-9_.-]+\/(earn-snapshot|run-status|research-references|research-index|evidence-index)\.json$/.test(f.path))throw Error('RESTORE_PATH_REJECTED');
  const b=await readFile(resolve(dir,f.path));if(createHash('sha256').update(b).digest('hex')!==f.sha256)throw Error('RESTORE_HASH_REJECTED');
  const d=JSON.parse(b);if((d.meta??d).runId!==m.snapshotRunId||(d.meta??d).releaseId!==m.releaseId)throw Error('RESTORE_VERSION_REJECTED');content[role]=d;
  const target=resolve(destination,f.path);await mkdir(dirname(target),{recursive:true});
  const existing=await readFile(target).catch(()=>null);if(existing&&!existing.equals(b))throw Error('RESTORE_IMMUTABLE_CONFLICT');if(!existing)await writeFile(target,b,{flag:'wx'});
 }
 for(const r of content.references.records){if(r.firstObservedAt&&(!first.has(r.id)||Date.parse(r.firstObservedAt)<Date.parse(first.get(r.id))))first.set(r.id,r.firstObservedAt);}
 candidates.push({directory,m,content});
}
if(!candidates.length){console.log('No prior pilot release; dated public baseline retained');process.exit(0);}
candidates.sort((a,b)=>Number(a.directory.split('-')[0])-Number(b.directory.split('-')[0]));
const chosen=candidates.at(-1);const refs=structuredClone(chosen.content.references);
for(const r of refs.records)if(first.has(r.id))r.firstObservedAt=first.get(r.id);
for(const [name,value]of [['earn-snapshot.json',chosen.content.snapshot],['run-status.json',chosen.content.status],['research-references.json',refs],['current.json',chosen.m]])await writeFile(resolve(destination,name),JSON.stringify(value));
console.log(JSON.stringify({restoredFrom:chosen.directory,releaseId:chosen.m.releaseId,snapshotRunId:chosen.m.snapshotRunId,previousReleases:candidates.length}));
