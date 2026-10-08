import {MAX_PRIVATE_FILE_BYTES, parsePrivateResearch} from '../domain/private-research.js';
const statuses = {'suggested':'建议 · 未采纳', 'adopted':'已有采纳证据', 'implemented':'已有实施证据', 'effect-verified':'已有效果证据'};
const states = {pending:'待验证', passed:'验证通过', blocked:'验证受阻'};
const questions = {Q01:'首次理财',Q02:'存量配置',Q03:'到期续投',Q04:'外部资金',Q05:'联合分发',Q06:'收益与供给'};
const el = (tag, value, className) => {const node=document.createElement(tag);if(value!=null)node.textContent=value;if(className)node.className=className;return node;};
const paragraph = (label, value) => {const block=el('div',null,'private-research-field');block.append(el('h4',label),el('p',value));return block;};
export function mountPrivateResearch(host) {
  if (!host) return;
  let generation=0;
  const panel=el('details',null,'private-research-panel');
  const summary=el('summary','研究结论 · 仅本设备');
  const content=el('div',null,'private-research-content');
  const note=el('p','选择你的私有研究展示文件，查看事实、启发与建议。文件仅在本页内存中读取，不上传、不保存；刷新后需重新加载。','private-research-notice');
  const toolbar=el('div',null,'private-research-toolbar');
  const label=el('label','加载研究文件','private-research-load');
  const input=el('input');input.type='file';input.accept='.json,application/json';input.id='private-research-file';label.htmlFor=input.id;
  const clear=el('button','清除本页研究');clear.type='button';clear.disabled=true;
  const message=el('p','尚未加载私有研究。','private-research-message');message.setAttribute('role','status');message.setAttribute('aria-live','polite');
  const cards=el('div',null,'private-research-cards');
  toolbar.append(label,input,clear);content.append(note,toolbar,message,cards);panel.append(summary,content);host.append(panel);
  const reset=()=>{generation++;cards.replaceChildren();input.value='';clear.disabled=true;message.textContent='尚未加载私有研究。';};
  clear.addEventListener('click',reset);
  input.addEventListener('change',async()=>{
    const file=input.files?.[0];if(!file)return;
    const token=++generation;cards.replaceChildren();clear.disabled=true;message.textContent='正在校验研究文件…';
    try {
      if(file.size>MAX_PRIVATE_FILE_BYTES)throw Error('文件过大，请选择不超过 1 MB 的研究展示文件。');
      const model=parsePrivateResearch(await file.text());if(token!==generation)return;
      for(const c of model.cards){
        const card=el('article',null,'private-research-card');card.dataset.privateCard=c.id;
        const meta=el('div',null,'private-research-meta');meta.append(el('span',c.platform),el('span','旧公告 · 本次文字核验'));
        card.append(meta,el('h3',c.title),paragraph('公开事实',c.fact),paragraph('业务启发',c.implication),paragraph('自身建议',c.suggestion));
        for(const r of c.recommendations){const state=el('p',`${r.questionId} ${questions[r.questionId]} · ${statuses[r.status]} · ${states[r.validation]}`,'private-research-state');card.append(state,paragraph('验证标准',r.acceptance));}
        card.append(paragraph('发表与核验',`公告 ${c.publishedDate}；文字核验 ${c.verifiedAt}（UTC）${c.validUntil?`；活动截止 ${c.validUntil}（UTC）`:''}`));
        if(c.validUntil&&Date.parse(c.validUntil)<=Date.now())card.append(el('p','公告所列活动窗口已结束；续期须另行核实。','private-research-expired'));
        card.append(paragraph('未验证范围',`没有新界面截图；未验证个人可参与性或登录后路径。${c.unknowns.join('；')}`));
        const a=el('a','官方原始来源 ↗');a.href=c.sourceUrl;a.target='_blank';a.rel='noopener noreferrer';card.append(a);cards.append(card);
      }
      message.textContent=`已载入 ${model.cards.length} 条研究 · 原记录 v${String(model.authority.version).padStart(3,'0')} · 仅本页显示；未自动同步。`;
      clear.disabled=false;panel.open=true;
    }catch(error){if(token!==generation)return;cards.replaceChildren();input.value='';message.textContent=error.message==='文件过大，请选择不超过 1 MB 的研究展示文件。'?error.message:'文件格式或来源链接不正确，本次内容未载入。';}
  });
  const followHash=()=>{if(location.hash==='#research-private'){panel.open=true;host.scrollIntoView({block:'start'});}};
  window.addEventListener('hashchange',followHash);followHash();
  // Back/forward cache must not retain the private selection either.
  window.addEventListener('pagehide',reset);
}
