import { loadPublicBranch } from "./domain/delivery.js";
import { verifyReferences, renderReferences } from './domain/references.js';
import { renderApp, viewFilters } from "./ui/render.js";
import { renderGeneralResearch, renderRuleComparison, renderEvidenceScope } from './ui/general-research.js';

renderGeneralResearch(document.querySelector('#research-general'));

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
  renderGeneralResearch(document.querySelector('#research-general'), snapshot);
  renderRuleComparison(root.querySelector('[data-rule-comparison]'));
  renderReferences(root, snapshot.researchReferences);
  renderEvidenceScope(root.querySelector("[data-evidence-scope]"), snapshot);
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
      root.innerHTML = `<main class="fatal-state"><strong>当前无法打开理财雷达</strong><p>公开数据暂时无法读取</p><p>请稍后重试；当前没有可确认的数据。</p></main>`;
    });
}

window.addEventListener("hashchange", () => { if (currentSnapshot) draw(currentSnapshot); });
setInterval(() => { if (!document.hidden) start(); }, 15 * 60 * 1000);
start();

