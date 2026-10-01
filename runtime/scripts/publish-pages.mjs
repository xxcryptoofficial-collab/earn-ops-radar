import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateSnapshot } from '../src/domain/contract.js';
import { validateRunStatus } from '../src/domain/run-status.js';
import { publicNews } from '../src/domain/visibility.js';

const root = resolve(import.meta.dirname, '..');
export const browserFiles = [
  'index.html', 'src/styles.css', 'src/main.js', 'src/ui/render.js',
  'src/domain/derive.js', 'src/domain/products.js', 'src/domain/visibility.js',
];
const publishedFiles = [...browserFiles, '.nojekyll', 'earn-snapshot.json', 'run-status.json'];

function gh(args, input) {
  const result = spawnSync('gh', args, { cwd: root, input, encoding: 'utf8', timeout: 30000 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`GitHub publication failed: ${result.stderr.slice(0,500)}`);
  return result.stdout.trim();
}
function api(path, body) {
  return JSON.parse(gh(['api', path, ...(body ? ['--method','POST','--input','-'] : [])],
    body ? JSON.stringify(body) : undefined));
}

// This is an export projection, not a sanitised copy of internal research.
// Unknown fields, historical strategy sections and raw diagnostics never ship.
function pick(record, keys) {
  return Object.fromEntries(keys.split(' ').filter(key => key in record).map(key => {
    const value = record[key];
    if (value !== null && !['string','number','boolean'].includes(typeof value)) throw new Error(`Non-scalar public field: ${key}`);
    return [key,value];
  }));
}
const rateKeys = 'id name shortName unit value status dataAsOf fetchedAt source sourceUrl coverage lastCheckedAt originKind dataTimeKind';
const safeRuns = rows => rows.map(row => ({...pick(row,'id status dataAsOf fetchedAt'),message:row.status==='failed'?'Public source unavailable':'Public source checked'}));
export function publicProjection(snapshot,status) {
  const safe = {
    schemaVersion:snapshot.schemaVersion,
    meta:{...pick(snapshot.meta,'runId runStatus generatedAt dataDate scope'),disclaimer:'Public information only',historyNotice:'Historical observations; no interpolated points'},
    upstream:snapshot.upstream.map(row=>row.originKind==='manual'?{
      ...pick(row,'id name shortName unit sourceUrl'),value:null,status:'failed',source:'No verified public observation',
      dataAsOf:null,fetchedAt:null,history:[],originKind:'unavailable',
    }:{...pick(row,rateKeys),history:row.history.filter(point=>point.kind==='live').map(point=>pick(point,'date value kind dataAsOf fetchedAt'))}),
    competitorApy:snapshot.competitorApy.filter(row=>row.originKind!=='manual'&&!/coinw/i.test(row.platform)).map(row=>pick(row,'platform coin term tier apy deltaBp status dataAsOf fetchedAt source sourceUrl note lastCheckedAt originKind productId rateType dataTimeKind')),
    // pub-* rows are compiled by the reviewed PUBLIC input adapter; July report
    // rows have no provenance fields and must not become public via this export.
    competitorActions:publicNews(snapshot.competitorActions).filter(row=>row.id?.startsWith('pub-')&&row.contentKind&&row.firstObservedAt&&row.sourceUrl?.startsWith('https://')&&!/调研报告/.test(row.source)).map(row=>pick(row,'id platform type title summary soWhat source sourceUrl publishedAt fetchedAt contentKind sector regionGroup geo studyPeriod firstObservedAt startsAt validUntil fact conditions dataAsOf')),
    mechanisms:[], categoryHeat:[],
    // Legacy matrix is retained only as an empty contract scaffold, never as a claim.
    productCoverage:{platforms:['CoinW','Binance','OKX','Bybit','Bitget','Gate','HTX','KuCoin'],rows:Array.from({length:12},(_,i)=>({product:`unverified-${i+1}`,values:{}})),source:'No verified public coverage',dataAsOf:null,fetchedAt:null},
    ledger:{disclaimer:'No verified public listing',products:[]},
    sourceRuns:safeRuns(snapshot.sourceRuns),
    externalYields:(snapshot.externalYields??[]).map(row=>pick(row,`${rateKeys} sector rateKind`)),
  };
  const publicStatus = {...pick(status,'schemaVersion runId status startedAt finishedAt snapshotRunId'),message:status.status==='FAILED'?'Update failed; last verified snapshot retained':status.status==='PARTIAL'?'Some public sources unavailable':'Public update completed',sourceRuns:safeRuns(status.sourceRuns)};
  return {snapshot:safe,status:publicStatus};
}

export async function buildPublicBundle(snapshot, status) {
  const errors = [...validateSnapshot(snapshot), ...validateRunStatus(status)];
  if (status.snapshotRunId !== snapshot.meta.runId) errors.push('snapshot/status runId mismatch');
  if (errors.length) throw new Error(`Public bundle rejected: ${errors.join('; ')}`);
  const projected = publicProjection(snapshot,status);
  const safe = projected.snapshot;
  const projectedErrors = [...validateSnapshot(safe),...validateRunStatus(projected.status)];
  if(projectedErrors.length) throw new Error(`Public projection rejected: ${projectedErrors.join('; ')}`);
  const files = Object.fromEntries(await Promise.all(browserFiles.map(async name => [name, await readFile(resolve(root,name),'utf8')])));
  files['.nojekyll'] = '';
  files['earn-snapshot.json'] = JSON.stringify(safe);
  files['run-status.json'] = JSON.stringify(projected.status);
  return files;
}

export async function publishPagesState({ snapshot, status, includeCode = false }) {
  const config = JSON.parse(await readFile(resolve(root,'config/publishing.json'),'utf8'));
  if (config.repository !== 'xxcryptoofficial-collab/earn-ops-radar' || config.branch !== 'main'
    || config.account !== 'xxcryptoofficial-collab') throw new Error('PUBLISH_IDENTITY_MISMATCH');
  if (gh(['api','user','--jq','.login']) !== config.account) throw new Error('GITHUB_ACCOUNT_MISMATCH');
  const repository = api(`repos/${config.repository}`);
  if (repository.full_name !== config.repository || repository.private || !repository.permissions?.push) throw new Error('PUBLIC_REPOSITORY_MISMATCH');
  const ref = api(`repos/${config.repository}/git/ref/heads/${config.branch}`);
  const parent = api(`repos/${config.repository}/git/commits/${ref.object.sha}`);
  const previous = api(`repos/${config.repository}/git/trees/${parent.tree.sha}?recursive=1`);
  if (previous.truncated || previous.tree.some(file => file.type === 'blob' && !publishedFiles.includes(file.path))) throw new Error('UNEXPECTED_REMOTE_FILES');
  if (!includeCode && browserFiles.some(path=>!previous.tree.some(file=>file.path===path&&file.type==='blob'))) throw new Error('STATIC_RUNTIME_NOT_PUBLISHED');
  if (status.status === 'FAILED') {
    // Preserve the last published snapshot, while publishing this failed attempt's status.
    const saved = api(`repos/${config.repository}/contents/earn-snapshot.json?ref=${config.branch}`);
    snapshot = JSON.parse(Buffer.from(saved.content,'base64').toString('utf8'));
    status = { ...status, snapshotRunId: snapshot.meta.runId };
  }
  const files = await buildPublicBundle(snapshot,status);
  const tree = [];
  for (const [path,content] of Object.entries(files)) {
    if (!includeCode && browserFiles.includes(path)) {
      tree.push({path,mode:'100644',type:'blob',sha:previous.tree.find(file=>file.path===path).sha});
      continue;
    }
    const blob = api(`repos/${config.repository}/git/blobs`, { content: Buffer.from(content).toString('base64'), encoding:'base64' });
    tree.push({ path, mode:'100644', type:'blob', sha:blob.sha });
  }
  const nextTree = api(`repos/${config.repository}/git/trees`, { tree });
  if (nextTree.sha === parent.tree.sha) return { status:status.status, runId:status.runId, snapshotPublished:status.status!=='FAILED', target:'github-pages', commit:ref.object.sha, changed:false, url:config.url };
  const commit = api(`repos/${config.repository}/git/commits`, { message:`Public radar ${status.runId}`, tree:nextTree.sha, parents:[ref.object.sha] });
  // No force: a competing writer makes this fail rather than overwrite its publication.
  const result = spawnSync('gh',['api',`repos/${config.repository}/git/refs/heads/${config.branch}`,'--method','PATCH','--input','-'],
    {cwd:root,input:JSON.stringify({sha:commit.sha,force:false}),encoding:'utf8',timeout:30000});
  if (result.error || result.status !== 0) throw new Error('PUBLICATION_REF_UPDATE_FAILED');
  return { status:status.status, runId:status.runId, snapshotPublished:status.status!=='FAILED', target:'github-pages', commit:commit.sha, changed:true, url:config.url };
}
