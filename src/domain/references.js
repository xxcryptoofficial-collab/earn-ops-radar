export function verifyReferences(data,snapshotRunId){
 if(data?.schemaVersion!=='earn-public-reference/1.0'||data.scope!=='external-public-only'||data.boundSnapshotRunId!==snapshotRunId||!Array.isArray(data.records)||data.currentQuoteVerified!==false)throw Error('REFERENCE_VERSION_MISMATCH');
 if(data.records.some(r=>r.classification!=='research-reference-only'||r.currentQuoteVerified!==false||!Array.isArray(r.acquisition)))throw Error('REFERENCE_CLASSIFICATION_INVALID');
 return data;
}
export function referenceState(record,now=Date.now()){
 if(record.validUntil&&Date.parse(record.validUntil)<=now)return '已过期历史资料';
 if(!record.observedAt||!record.verifiedAt)return '原网页时效未知，仅供研究';
 if(now-Date.parse(record.verifiedAt)>8*86400000)return '超过八日未复核，仅供历史研究';
 return '公开页面观察，仅供研究';
}
export function renderReferences(root,data){
 root.querySelector('[data-research-references]')?.remove();
 const section=document.createElement('section');section.dataset.researchReferences='';section.className='research-reference-section';
 const title=document.createElement('h2');title.textContent='竞品公开研究参考';section.append(title);
 const notice=document.createElement('p');notice.textContent='目录与活动条款中的百分比仅为来源引用，未验证为实时挂牌。资格、额度、归属时间未知处保留未知。';section.append(notice);
 if(!data){const p=document.createElement('p');p.textContent='参考资料未加载或版本核验未通过。';section.append(p);root.append(section);return;}
 for(const status of data.sources??[]){const note=document.createElement('p');note.textContent=`${status.id}：${status.status}；最后来源观察 ${status.lastObservedAt??status.lastAccessAttemptAt??'未知'}`;section.append(note);}
 const version=document.createElement('p');version.textContent=`研究版本 ${data.releaseId} · ${data.runId}`;section.append(version);
 for(const r of data.records){
  const card=document.createElement('details');const summary=document.createElement('summary');summary.textContent=`${r.platform} · ${r.title} · ${referenceState(r)}`;card.append(summary);
  for(const text of [r.fact,r.conditions,`观察时间：${r.observedAt??'未知'}；工具取回：${r.retrievedAt??r.fetchedAt??'未知'}；利率归属：${r.rateAsOf??'未知'}`,`未知字段：${(r.fieldsUnknown??[]).join('、')||'参见条件'}`]){const p=document.createElement('p');p.textContent=text;card.append(p);}
  const source=document.createElement('a');source.textContent='官方来源';source.href=r.sourceUrl;source.target='_blank';source.rel='noopener noreferrer';card.append(source);
  section.append(card);
 }
 root.append(section);
}
