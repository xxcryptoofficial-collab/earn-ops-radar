import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(process.argv[2]??new URL('../..',import.meta.url).pathname);
const local=JSON.parse(await readFile(resolve(root,'current.json'),'utf8'));
const response=await fetch('https://api.github.com/repos/xxcryptoofficial-collab/earn-ops-radar/git/ref/heads/earn-public-data?check='+Date.now(),{signal:AbortSignal.timeout(25000)});
if(!response.ok)throw Error('PUBLIC_HEAD_READ_FAILED');
const head=await response.json();if(!/^[0-9a-f]{40}$/.test(head.object?.sha??''))throw Error('PUBLIC_HEAD_INVALID');
const base=`https://raw.githubusercontent.com/xxcryptoofficial-collab/earn-ops-radar/${head.object.sha}/`;
const key=`?verify=${encodeURIComponent(local.snapshotRunId)}`;
const fetchBytes=async path=>{const response=await fetch(new URL(path,base),{signal:AbortSignal.timeout(25000)});if(!response.ok)throw Error('PUBLIC_READBACK_HTTP_FAILED');return Buffer.from(await response.arrayBuffer());};
const online=JSON.parse(await fetchBytes('current.json'+key));
if(online.releaseId!==local.releaseId||online.snapshotRunId!==local.snapshotRunId||JSON.stringify(online.files)!==JSON.stringify(local.files))throw Error('PUBLIC_RELEASE_MISMATCH');
for(const [role,f]of Object.entries(local.files)){
 if(!/^releases\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\.json$/.test(f.path))throw Error('PUBLIC_PATH_REJECTED');
 const b=await fetchBytes(f.path+key);if(createHash('sha256').update(b).digest('hex')!==f.sha256)throw Error('PUBLIC_HASH_MISMATCH');
 const d=JSON.parse(b);if(role==='snapshot'){if(d.meta.runId!==local.snapshotRunId||d.meta.releaseId!==local.releaseId)throw Error('PUBLIC_SNAPSHOT_BINDING_FAILED');}
 else if(d.releaseId!==local.releaseId||(d.runId??d.snapshotRunId)!==local.snapshotRunId)throw Error('PUBLIC_DATA_BINDING_FAILED');
}
const attempt=JSON.parse(await readFile(resolve(root,'latest-attempt.json'),'utf8'));
if(attempt.runId!==local.snapshotRunId||attempt.releaseId!==local.releaseId)throw Error('PUBLIC_ATTEMPT_BINDING_FAILED');
await writeFile(resolve(root,'latest-attempt.json'),JSON.stringify({...attempt,stage:'READBACK_VERIFIED',publication:{status:'READBACK_VERIFIED',dataCommit:head.object.sha,verifiedAt:new Date().toISOString()}}));
console.log(JSON.stringify({status:'READBACK_VERIFIED',runId:local.snapshotRunId,releaseId:local.releaseId}));
