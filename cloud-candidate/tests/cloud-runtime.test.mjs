import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,cp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {parseCatalog} from '../runtime/scripts/binance-reference.mjs';
import {expectedNextAt,runCloudDaily} from '../runtime/scripts/cloud-daily.mjs';
import {loadBoundRelease} from '../src/domain/delivery.js';
const repo=resolve(import.meta.dirname,'..');
const raw=await readFile(resolve(repo,'tests/fixtures/binance-catalog.txt'),'utf8');
const seen='2026-10-01T03:40:06.363Z';
test('actual hosted catalog yields10 parent references, never current quotes',()=>{const r=parseCatalog(raw,seen);assert.equal(r.length,10);assert.ok(r.every(r=>r.currentQuoteVerified===false&&r.rateAsOf===null));assert.equal(r.find(r=>r.coin==='USDT').rawDisplay,'3.19% ~ 6.68%');});
test('FAQ percentage/skeleton cannot pass catalog parser',()=>{assert.throws(()=>parseCatalog('Simple Earn FAQ\nEarn 10% today',seen),/STRUCTURE/);});
test('Shanghai0910 next cadence',()=>{assert.equal(expectedNextAt('2026-10-01T00:00:00Z'),'2026-10-01T01:10:00.000Z');assert.equal(expectedNextAt('2026-10-01T03:00:00Z'),'2026-10-02T01:10:00.000Z');});
test('isolated fixture replay preserves observation and creates bound immutable release',async()=>{
 const out=await mkdtemp(resolve(tmpdir(),'earn-isolated-runtime-'));
 for(const name of ['earn-snapshot.json','research-references.json'])await cp(resolve(repo,name),resolve(out,name));
 const result=await runCloudDaily({outputRoot:out,fixtureText:raw,fixtureObservedAt:seen,now:new Date('2026-10-01T04:00:00Z')});
 assert.equal(result.status,'PARTIAL');const m=JSON.parse(await readFile(resolve(out,'current.json'),'utf8'));
 for(const f of Object.values(m.files)){const b=await readFile(resolve(out,f.path));assert.equal(createHash('sha256').update(b).digest('hex'),f.sha256);}
 const fetcher=async url=>{const b=await readFile(resolve(out,new URL(url).pathname.slice(1)));return new Response(b);};
 globalThis.crypto??=(await import('node:crypto')).webcrypto;
 const snap=await loadBoundRelease(new URL('https://example.org/'),fetcher);
 assert.equal(snap.meta.runId,result.runId);assert.equal(snap.researchReferences.releaseId,result.releaseId);
 assert.ok(snap.researchReferences.records.filter(r=>r.id.startsWith('reference-binance')).every(r=>r.observedAt===seen));
 const latest=JSON.parse(await readFile(resolve(out,'latest-attempt.json'),'utf8'));assert.equal(latest.acquisitionMode,'fixture_replay');
 assert.equal(snap.researchReferences.sources.find(r=>r.id==='okx-catalog-hosted').status,'restricted_no_retry');
});

test('missing baseline leaves terminal failed attempt without replacing prior release',async()=>{
 const out=await mkdtemp(resolve(tmpdir(),'earn-missing-baseline-'));await assert.rejects(runCloudDaily({outputRoot:out,now:new Date('2026-10-01T04:01:00Z')}),/CLOUD_COLLECTION_FAILED/);
 const status=JSON.parse(await readFile(resolve(out,'latest-attempt.json'),'utf8'));assert.equal(status.status,'FAILED');assert.equal(status.snapshotRunId,null);
});
