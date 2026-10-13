import {visibleSnapshot,isResearchCurrent} from './visibility.js';
import {generalResearchState} from '../ui/general-research.js';
export function overviewModel(snapshot,now=Date.now()){
 if(!snapshot)return{loading:true,rules:generalResearchState(now),platforms:[],currentProducts:[],archive:[]};
 const live=visibleSnapshot(snapshot,now);const quotes=snapshot.competitorApy??[],references=snapshot.researchReferences?.records??[];
 const platforms=['Binance','Bybit','Bitget','OKX','Gate','HTX','KuCoin'].map(platform=>({platform,hasRule:['Binance','Bybit'].includes(platform),current:live.competitorApy.filter(r=>r.platform===platform).length,historical:quotes.filter(r=>r.platform===platform&&!live.competitorApy.includes(r)).length,directory:references.filter(r=>r.platform===platform).length,restricted:(snapshot.researchReferences?.sources??[]).some(r=>r.id.startsWith(platform.toLowerCase())&&r.status==='restricted_no_retry')}));
 const archive=(snapshot.competitorActions??[]).map(r=>({...r,evidenceState:r.validUntil&&Date.parse(r.validUntil)<=now?'expired':isResearchCurrent(r,now)?'current':'stale'}));
 // A freshness or acquisition label alone cannot prove a new rule or a difference.
 const confirmedChanges=archive.filter(r=>r.evidenceState==='current'&&typeof r.changeEvidence==='string'&&r.changeEvidence.trim());
 return{loading:false,rules:generalResearchState(now),platforms,currentProducts:live.competitorApy,archive,confirmedChanges,failed:(snapshot.sourceRuns??[]).filter(r=>r.status==='failed'),collectedAt:snapshot.meta.generatedAt,deliveryMismatch:!!snapshot.meta.deliveryMismatch,missedOrStale:!!snapshot.meta.missedOrStale};
}
