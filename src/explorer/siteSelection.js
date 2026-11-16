import {retainedVariants} from './model.js';

export const siteOrder=(a,b)=>a.pos-b.pos||a.id.localeCompare(b.id);

// Preserve unavailable requests. Dropping them would change the user's definition.
export function resolveSites(gene,selection){
  const ids=selection?.markerIds||[],requested=new Set(ids);
  const variants=gene.variants.filter(v=>requested.has(v.id)).sort(siteOrder);
  const missing=ids.filter(id=>!variants.some(v=>v.id===id));
  const assemblyMismatch=!!selection?.assembly&&selection.assembly!==gene.assembly;
  return {variants,missing,assemblyMismatch,markerIds:[...variants.map(v=>v.id),...missing],
    ready:ids.length>0&&!missing.length&&!assemblyMismatch};
}

export function analysisSites(cohort,gene,selection,minMaf,maxMissing){
  if(selection)return {...resolveSites(gene,selection),mode:'manual'};
  const variants=retainedVariants(cohort,gene,minMaf,maxMissing).sort(siteOrder);
  return {variants,markerIds:variants.map(v=>v.id),missing:[],assemblyMismatch:false,ready:!!variants.length,mode:'qc'};
}

export function validateSiteSelections(selections){
  if(selections===undefined)return;
  if(!selections||typeof selections!=='object'||Array.isArray(selections)||Object.values(selections).some(s=>
    !s||typeof s.assembly!=='string'||!Array.isArray(s.markerIds)||s.markerIds.length>10000||
    s.markerIds.some(id=>typeof id!=='string'||!id||id.length>300)||new Set(s.markerIds).size!==s.markerIds.length))throw Error('自选位点设置无效');
}
