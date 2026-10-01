// New candidate loader. Pin a manifest once, then verify immutable bytes and IDs.
// Diagnostics must never delay authoritative data. Bound fetch AND body reads.
export async function loadBoundRelease(base, fetcher=fetch, previous=null, now=Date.now(), options={}) {
  const timeoutMs=options.timeoutMs??8000;
  const bounded=async (url,read,limit=timeoutMs,controller=new AbortController())=>{
    let timer,onAbort;
    const boundary=new Promise((_,reject)=>{
      onAbort=()=>reject(controller.signal.reason??new Error('Request aborted'));
      controller.signal.addEventListener('abort',onAbort,{once:true});
      if(controller.signal.aborted)onAbort();
      timer=setTimeout(()=>controller.abort(new Error('Request timed out')),limit);
    });
    try {
      return await Promise.race([boundary,(async()=>{
        const response=await fetcher(url,{cache:'no-store',signal:controller.signal});
        if(!response.ok)throw new Error(`HTTP ${response.status}`);
        return read(response);
      })()]);
    } finally {clearTimeout(timer);controller.signal.removeEventListener('abort',onAbort);}
  };
  const json=(url,limit,controller)=>bounded(url,r=>r.json(),limit,controller);
  const missed=(expectedNextAt,graceSeconds)=>{
    const expected=Date.parse(expectedNextAt);
    return !Number.isFinite(expected)||now>expected+(graceSeconds??3600)*1000;
  };
  const cacheKey=options.cacheKey??`earn-public-last-good:${base.href}`;
  const cache=options.cache??globalThis.localStorage;
  const digest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
  const saveCache=async snapshot=>{try{if(!cache)return;const body=JSON.stringify(snapshot);cache.setItem(cacheKey,JSON.stringify({schemaVersion:'earn-public-cache/1.0',body,sha256:await digest(body)}));}catch{}};
  const cachedPrevious=async()=>{try{if(!cache)return null;const c=JSON.parse(cache.getItem(cacheKey));if(c.schemaVersion!=='earn-public-cache/1.0'||await digest(c.body)!==c.sha256)return null;const s=JSON.parse(c.body);if(s.meta?.scope!=='external-public-only'||!s.meta.releaseId||!s.meta.runId)return null;if(s.researchReferences&&(s.researchReferences.releaseId!==s.meta.releaseId||s.researchReferences.boundSnapshotRunId!==s.meta.runId))return null;return s;}catch{return null;}};
  let attempt=null;
  const diagnosticController=new AbortController();
  // Start separately; a pending/failed optional diagnostic never gates render.
  const diagnostic=json(new URL('latest-attempt.json',base),options.diagnosticsTimeoutMs??2000,diagnosticController)
    .then(value=>{attempt=value;}).catch(()=>{});
  try {
    const m=await json(new URL('current.json',base));
    const files=await Promise.all(['snapshot','status',...(m.files.references?['references']:[])].map(async key=>{
      const ref=m.files[key];
      if(!/^releases\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\.json$/.test(ref.path))throw new Error('unsafe release path');
      const bytes=await bounded(new URL(ref.path,base),r=>r.arrayBuffer());
      const actual=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
      if(actual!==ref.sha256)throw new Error('delivery hash mismatch');
      return JSON.parse(new TextDecoder().decode(bytes));
    }));
    const [snapshot,status,references]=files;
    if(references && (references.schemaVersion!=="earn-public-reference/1.0" || references.releaseId!==m.releaseId || references.boundSnapshotRunId!==snapshot.meta.runId))throw new Error("reference release mismatch");
    if(snapshot.meta.releaseId!==m.releaseId||status.releaseId!==m.releaseId||snapshot.meta.runId!==m.snapshotRunId||status.snapshotRunId!==m.snapshotRunId)throw new Error('delivery version mismatch');
    const result = {...snapshot,researchReferences:references??null,meta:{...snapshot.meta,latestAttempt:attempt,releaseStatus:status,deliveryMismatch:false,
      expectedNextAt:m.expectedNextAt,graceSeconds:m.graceSeconds??3600,
      missedOrStale:missed(m.expectedNextAt,m.graceSeconds),displayedSnapshotRunId:m.snapshotRunId,latestAttemptRunId:attempt?.runId??null}};
    await saveCache(result);
    return result;
  } catch(error) {
    previous=previous??await cachedPrevious();
    if(!previous)throw error;
    return {...previous,meta:{...previous.meta,latestAttempt:attempt,latestAttemptRunId:attempt?.runId??null,
      missedOrStale:missed(previous.meta.expectedNextAt,previous.meta.graceSeconds),
      deliveryMismatch:true,cachedFallback:true,deliveryError:String(error.message)}};
  } finally {
    diagnosticController.abort(new Error('Optional diagnostic no longer needed'));
    await diagnostic; // Already settled or immediately canceled; never waits on transport.
  }
}


// Resolve the public branch to a commit before reading the manifest. Raw branch
// CDN max-age is not bypassed by no-store; commit URLs prevent hybrid delivery.
export async function loadPublicBranch(owner,repo,branch,fetcher=fetch,previous=null,now=Date.now(),options={}) {
 if(!/^[a-zA-Z0-9_.-]+$/.test(owner)||!/^[a-zA-Z0-9_.-]+$/.test(repo)||!/^[a-zA-Z0-9_.-]+$/.test(branch))throw new Error('public identity rejected');
 const prefix=options.prefix??'';
 if(prefix&&!/^[a-zA-Z0-9_./-]+$/.test(prefix))throw new Error('public prefix rejected');
 const stableKey=`earn-public-last-good:${owner}/${repo}/${branch}/${prefix}`;
 try{
  const controller=new AbortController();let timer;
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('public head timeout'));},options.timeoutMs??8000);});
  let head;
  try{head=await Promise.race([deadline,(async()=>{const response=await fetcher(`https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${branch}?check=${now}`,{signal:controller.signal,cache:'no-store'});if(!response.ok)throw new Error('public head unavailable');return response.json();})()]);}finally{clearTimeout(timer);}
  if(head.ref!==`refs/heads/${branch}`||head.object?.type!=='commit'||!/^[0-9a-f]{40}$/.test(head.object?.sha??''))throw new Error('public head rejected');
  const result=await loadBoundRelease(new URL(`https://raw.githubusercontent.com/${owner}/${repo}/${head.object.sha}/${prefix}`),fetcher,previous,now,{...options,cacheKey:stableKey});
  return {...result,meta:{...result.meta,deliveryCommit:head.object.sha}};
 }catch{
  return loadBoundRelease(new URL(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${prefix}`),()=>Promise.reject(new Error('Public head lookup failed')),previous,now,{...options,cacheKey:stableKey});
 }
}
