import { renderApp, viewFilters } from "./ui/render.js";

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
  return response.json();
}

async function loadSnapshot() {
  let snapshot;
  const source = "static-public";
  snapshot = await fetchJson(new URL("../earn-snapshot.json", import.meta.url));
  let latestAttempt = null;
  try {
    latestAttempt = await fetchJson(new URL("../run-status.json", import.meta.url));
  } catch {
    // 初次部署或本地静态预览没有云端状态时，快照仍可独立展示。
  }
  return {
    ...snapshot,
    meta: { ...snapshot.meta, deliverySource: source, latestAttempt },
    sourceRuns: latestAttempt?.sourceRuns?.length ? latestAttempt.sourceRuns : snapshot.sourceRuns,
  };
}

const root = document.querySelector("#app");
let currentSnapshot;
function draw(snapshot) {
  currentSnapshot = snapshot;
  const open = new Set([...root.querySelectorAll('details[data-product-key][open]')].map(el=>el.dataset.productKey));
  const focusFilter = document.activeElement?.dataset?.filter;
  renderApp(root, snapshot);
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
