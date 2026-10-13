import overviewCopy from './ui/overview-copy.js';
import {createDetailController} from './ui/detail-controller.js';
import { loadPublicBranch, loadBoundRelease } from "./domain/delivery.js";
import { verifyReferences, renderReferences } from './domain/references.js';
import { renderApp, viewFilters } from "./ui/render.js";


async function loadSnapshot() {
  return loadPublicBranch("xxcryptoofficial-collab", "earn-ops-radar", "earn-public-data", fetch, currentSnapshot);
}

const root = document.querySelector("#app");
let currentSnapshot;
let publicError=false;
const details=createDetailController(root,()=>currentSnapshot);
renderApp(root,null);
function draw(snapshot) {
  currentSnapshot = snapshot;
  document.title=overviewCopy.title;
  const open = new Set([...root.querySelectorAll('details[data-product-key][open]')].map(el=>el.dataset.productKey));
  const focusFilter = document.activeElement?.dataset?.filter;
  const directoryFocus = document.activeElement?.dataset?.directoryFilter;
  renderApp(root, snapshot,Date.now(),publicError);
  if(snapshot?.researchReferences)verifyReferences(snapshot.researchReferences,snapshot.meta.runId);
  if(snapshot)renderReferences(root.querySelector('[data-directory-host]'), snapshot.researchReferences);
  if(publicError&&snapshot){const p=document.createElement('p');p.className='public-load-error';p.setAttribute('role','status');p.textContent=overviewCopy.overview.loadingFailed;root.querySelector('.earn-workbench')?.append(p);}
  root.querySelectorAll('details[data-product-key]').forEach(el=>{el.open=open.has(el.dataset.productKey);});
  if(details.isOpen())details.refresh();
  if(focusFilter)root.querySelector(`[data-filter="${focusFilter}"]`)?.focus({preventScroll:true});
  if(directoryFocus)root.querySelector(`[data-directory-filter="${directoryFocus}"]`)?.focus({preventScroll:true});
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
    .then(snapshot=>{publicError=false;draw(snapshot);})
    .catch(() => { publicError=true; draw(currentSnapshot??null);
    });
}


setInterval(() => { if (!document.hidden) start(); }, 15 * 60 * 1000);
async function boot() {
  try {
    const bundled = await loadBoundRelease(new URL('../assets/public-baseline/',import.meta.url),fetch,null,Date.now(),{cacheKey:'earn-public-bundled-last-good',diagnostics:false});
    draw(bundled);
  } catch { publicError=true; draw(null); }
  start();
}
boot();
