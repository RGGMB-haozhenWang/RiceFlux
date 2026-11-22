import {typeMaterial,statusText} from './jointHaplotypes.js';
import {alleleNames,markerKind} from './alleles.js';
import {pavState} from './pav.js';

export function pavIdentity(assay){
  return {dataset_id:assay.datasetId,dataset_version:assay.version,pav_assay_id:assay.id,
    source_gene_id:assay.sourceGene,pav_kind:assay.event?'fragment':'gene',pav_event:assay.event||null};
}

export function comparePav({gene,assay,cohort,variants=[],view}){
  const markers=variants.slice().sort((a,b)=>a.pos-b.pos||a.id.localeCompare(b.id));
  const sites=markers.map(v=>({id:v.id,assembly:v.assembly||gene.assembly,chr:v.chromosome||gene.chromosome,
    position:v.pos,ref:v.ref,alt:alleleNames(v).slice(1)}));
  const identity={gene_id:gene.id,...pavIdentity(assay),variant_sites:JSON.stringify(sites)};
  const counts={present:0,absent:0,unknown:0,unassayed:0,short_missing:0,short_heterozygous:0,short_unassayed:0};
  const unavailable=assay.groups?'summary_only':!assay.sampleIndex?'no_individual_calls':
    markers.some(v=>!markerKind(alleleNames(v),true))?'unsupported_markers':null;
  if(unavailable)return {identity,sites,counts,groups:[],members:[],total:cohort.length,unavailable};
  const scheme={kind:'observed',ready:!!markers.length,positions:markers.map(v=>v.pos),markers};
  const groups=new Map(),members=[];
  for(const sample of cohort){
    const state=pavState(assay,sample)||'unknown';counts[state]++;
    const call=markers.length?typeMaterial(sample,scheme):{status:'called',bases:''};
    if(['missing','both'].includes(call.status))counts.short_missing++;
    if(['heterozygous','both'].includes(call.status))counts.short_heterozygous++;
    if(call.status==='uncovered')counts.short_unassayed++;
    let key=null;
    if(['present','absent'].includes(state)&&call.status==='called'){
      key=JSON.stringify([identity,call.bases,state]);
      if(!groups.has(key))groups.set(key,{key,bases:call.bases,state,members:[],values:[]});
      const group=groups.get(key);group.members.push(sample);
      const value=view?.active?.id?sample.phenotypes?.[view.active.id]:null;
      if(Number.isFinite(value))group.values.push(value);
    }
    members.push({sample,key,state,bases:call.bases,shortStatus:markers.length?call.status:'not_selected'});
  }
  const result=[...groups.values()].map(group=>{
    const values=group.values.sort((a,b)=>a-b),n=values.length;
    return {...group,n:group.members.length,ratio:cohort.length?group.members.length/cohort.length:0,
      pairedN:n,median:n?(values[Math.floor((n-1)/2)]+values[Math.ceil((n-1)/2)])/2:null};
  }).sort((a,b)=>b.n-a.n||a.key.localeCompare(b.key));
  return {identity,sites,counts,groups:result,members,total:cohort.length,unavailable:null,
    environmentId:view?.active?.id||'',unit:view?.unit||''};
}

export const comparisonStatus=status=>status==='not_selected'?'未选择短变异':statusText[status]||status;
export function pavComparisonRows(comparison){
  const context={...comparison.identity,pav_event:JSON.stringify(comparison.identity.pav_event),cohort_n:comparison.total,
    environment_id:comparison.environmentId||'',phenotype_unit:comparison.unit||''};
  return {
    groups:comparison.groups.map(group=>({...context,group_id:group.key,allele_vector:group.bases,pav_status:group.state,
      n:group.n,cohort_ratio:group.ratio,paired_n:group.pairedN,median:group.median})),
    materials:comparison.members.map(({sample,key,state,bases,shortStatus})=>({...context,
      sample_dataset_id:sample.dataset_id,sample_id:sample.source_sample_id??sample.id,population:sample.population_id,
      group_id:key||'',allele_vector:bases,pav_status:state,short_variant_status:shortStatus,
      phenotype:comparison.environmentId?sample.phenotypes?.[comparison.environmentId]??null:null})),
  };
}
