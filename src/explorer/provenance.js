import {callOf} from './catalog.js';
import {datasetBadge} from './datasetColors.js';

export function geneSupport(data,gene){
  const rows=(data.annotations?.support||[]).filter(r=>r.gene_id===gene.id);
  for(const b of data.datasetBundles||[]){
    if(rows.some(r=>r.dataset_id===b.manifest.id))continue;
    const markers=b.variants.filter(v=>v.gene===gene.id);if(!markers.length)continue;
    const levels=markers.map(v=>data.evidence?.sites[v.id]?.level);
    rows.push({dataset_id:b.manifest.id,badge:datasetBadge(b.manifest.id,data.datasetRegistry),gene_id:gene.id,marker_count:markers.length,
      functional_sites:levels.filter(s=>s==='原文功能位点').length,haplotype_components:levels.filter(s=>s==='文献单倍型组分').length,
      marker_ids:markers.map(v=>v.id).join(';'),high_confidence_sites:0,confidence_status:'not_certified'});
  }
  return rows;
}
export function geneEvidence(data,gene,dataset='all'){
  const support=geneSupport(data,gene).filter(row=>dataset==='all'||row.dataset_id===dataset);
  return {support,functional:Math.max(0,...support.map(r=>Number(r.functional_sites))),
    hap:Math.max(0,...support.map(r=>Number(r.haplotype_components))),
    papers:gene.catalog?.geneDOI?.length||gene.sources?.length||0};
}
export function identityFor(data,gene){return data.annotations?.identities.find(r=>r.gene_id===gene.id);}
export function datasetCalls(data,gene,cohort){
  return (data.datasetBundles||[]).map(b=>{
    const members=cohort.filter(s=>s.dataset_id===b.manifest.id);
    const markers=gene.variants.filter(v=>b.columns.has(v.id));
    let complete=0,heterozygous=0,called=0;
    for(const s of members){let full=markers.length>0,het=false;
      for(const v of markers){const pair=callOf(s,v);called+=pair.filter(a=>a!==null).length;full&&=pair.every(a=>a!==null);het||=pair.every(a=>a!==null)&&pair[0]!==pair[1];}
      complete+=Number(full);heterozygous+=Number(het);
    }
    return {dataset_id:b.manifest.id,name:b.manifest.name,version:b.manifest.version,source:b.manifest.source,genotype_evidence:b.manifest.genotype_evidence,
      samples:members.length,markers:markers.length,complete,heterozygous,called,total:members.length*markers.length*2,
      confidence:'not_certified',assay:b.manifest.assay_description||(b.manifest.id==='rice6044'?'来源重测序分型 / Source resequencing calls':'检测流程未登记 / Assay not supplied')};
  });
}
export function presetTitle(s){
  return s.provenance?.title||s.doi?.map(d=>'DOI '+d).join(' / ')||s.definitions?.[0]?.label||'位点组合 / Marker set';
}
export function readableDefinition(label){
  return label?.replace(/^FPLS1097622 (Hap\d+) seven-marker set$/, 'DTH7 $1 · Zhang 2022')||label;
}
