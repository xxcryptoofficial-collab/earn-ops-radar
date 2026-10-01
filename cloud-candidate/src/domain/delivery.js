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
    return {...snapshot,researchReferences:references??null,meta:{...snapshot.meta,latestAttempt:attempt,releaseStatus:status,deliveryMismatch:false,
      expectedNextAt:m.expectedNextAt,graceSeconds:m.graceSeconds??3600,
      missedOrStale:missed(m.expectedNextAt,m.graceSeconds),displayedSnapshotRunId:m.snapshotRunId,latestAttemptRunId:attempt?.runId??null}};
  } catch(error) {
    if(!previous)throw error;
    return {...previous,meta:{...previous.meta,latestAttempt:attempt,latestAttemptRunId:attempt?.runId??null,
      missedOrStale:missed(previous.meta.expectedNextAt,previous.meta.graceSeconds),
      deliveryMismatch:true,deliveryError:String(error.message)}};
  } finally {
    diagnosticController.abort(new Error('Optional diagnostic no longer needed'));
    await diagnostic; // Already settled or immediately canceled; never waits on transport.
  }
}
