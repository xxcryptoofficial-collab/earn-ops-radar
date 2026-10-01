import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'../..');
const local=JSON.parse(await readFile(resolve(root,'current.json'),'utf8'));
const base='https://xxcryptoofficial-collab.github.io/earn-ops-radar/';
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
for(const name of ['index.html','src/styles.css','src/main.js','src/ui/render.js','src/domain/derive.js','src/domain/products.js','src/domain/visibility.js','src/domain/delivery.js','src/domain/references.js']){
 if(!(await fetchBytes(name+key)).equals(await readFile(resolve(root,name))))throw Error('PUBLIC_RESOURCE_MISMATCH');
}
console.log(JSON.stringify({status:'READBACK_VERIFIED',runId:local.snapshotRunId,releaseId:local.releaseId}));
