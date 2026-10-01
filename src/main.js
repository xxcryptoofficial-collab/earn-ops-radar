import { loadPublicBranch } from "./domain/delivery.js";
import { verifyReferences, renderReferences } from './domain/references.js';
import { renderApp, viewFilters } from "./ui/render.js";

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
  return response.json();
}

async function loadSnapshot() {
  return loadPublicBranch("xxcryptoofficial-collab", "earn-ops-radar", "earn-public-data", fetch, currentSnapshot);
}

const root = document.querySelector("#app");
let currentSnapshot;
function draw(snapshot) {
  currentSnapshot = snapshot;
  const open = new Set([...root.querySelectorAll('details[data-product-key][open]')].map(el=>el.dataset.productKey));
  const focusFilter = document.activeElement?.dataset?.filter;
  renderApp(root, snapshot);
  renderReferences(root, snapshot.researchReferences);
  const notice=document.createElement('p');notice.className='cloud-delivery-notice';
  notice.textContent=snapshot.meta.deliveryMode==='public-baseline-import'?'公开基线导入，来源时间未刷新；尚未作为新采集':snapshot.meta.deliveryMismatch?'本次读取失败，保留上一已核版本；来源时间未刷新':snapshot.meta.missedOrStale?'已超过下一轮更新时间，当前数据标为漏跑/过期':snapshot.meta.latestAttempt?.status==='FAILED'?'最近云采集失败，保留上一已核版本':`公开云数据版本 ${snapshot.meta.runId} · ${snapshot.meta.runStatus}；OKX托管来源仍受地区限制`;
  root.prepend(notice);
  root.querySelectorAll('details[data-product-key]').forEach(el=>{el.open=open.has(el.dataset.productKey);});
  if(focusFilter)root.querySelector(`[data-filter="${focusFilter}"]`)?.focus();
}
root.addEventListener('change', event=>{
  const key=event.target.dataset.filter;
  if(['platform','coin','term'].includes(key)){viewFilters[key]=event.target.value;if(currentSnapshot)draw(currentSnapshot);}
});
root.addEventListener('click', event=>{
  if(event.target.closest('[data-clear]')){Object.keys(viewFilters).forEach(key=>viewFilters[key]='');if(currentSnapshot)draw(currentSnapshot);root.querySelector('[data-clear]')?.focus();}
});

function start() {
  loadSnapshot()
    .then(draw)
    .catch((error) => {
      root.innerHTML = `<main class="fatal-state"><strong>当前无法打开理财雷达</strong><p>${String(error.message).replace(/[<>&]/g, "")}</p><p>没有使用旧值冒充新数据，请检查本地快照。</p></main>`;
    });
}

window.addEventListener("hashchange", () => { if (currentSnapshot) draw(currentSnapshot); });
setInterval(() => { if (!document.hidden) start(); }, 15 * 60 * 1000);
start();

