import {readText} from './assets.js';
import {readTable} from './datasets.js';
import {normalizeDOI} from './evidence.js';
import {callOf,isAssayed} from './catalog.js';
import {alleleNames} from './alleles.js';

export const effectDirections={increase:'↑ 增加',decrease:'↓ 减少'};
export const evidenceBasis={association:'原文自然群体比较',functional:'原文功能验证'};
const requests=new Map();

export function parseTraitEvidence(pilotText,claimsText) {
  const pilot=readTable(pilotText,['RAP','MSU','文献主要作用','原始研究'],'V4 首批').objects();
  const fields=['gene_id','definition_id','marker_state','label','trait_id','trait','direction','judgment','basis','effect','context','locator','doi'];
  const claims=readTable(claimsText,fields,'单倍型原文证据').objects();
  const seen=new Set();
  for(const claim of claims){
    const key=JSON.stringify([claim.gene_id,claim.definition_id||claim.label,claim.trait_id,claim.doi]);
    if(seen.has(key)||fields.some(field=>!['definition_id','marker_state'].includes(field)&&!claim[field])||
      claim.marker_state&&!/^[-\w:]+=[ACGT]+$/.test(claim.marker_state)||
      !Object.hasOwn(effectDirections,claim.direction)||!Object.hasOwn(evidenceBasis,claim.basis)||
      !['favourable','unfavourable','effect'].includes(claim.judgment)||!/^10\.\d{4,9}\/\S+$/.test(normalizeDOI(claim.doi)))
      throw Error('单倍型原文证据条目无效：'+claim.label);
    seen.add(key);
  }
  return {pilot,claims};
}

export function loadTraitEvidence(base) {
  if(!requests.has(base)){
    const request=Promise.all([readText(base+'prior/core50_genes.tsv'),readText(base+'formats/haplotype-effects.tsv')])
      .then(([pilot,claims])=>parseTraitEvidence(pilot,claims)).catch(error=>{requests.delete(base);throw error;});
    requests.set(base,request);
  }
  return requests.get(base);
}

export function traitEvidenceFor(data,gene) {
  if(!data||!gene.catalog?.core)return {record:null,claims:[]};
  const record=data.pilot.find(row=>row.RAP&&row.RAP===gene.catalog.rap||row.MSU&&row.MSU===gene.catalog.msu);
  const claims=data.claims.filter(row=>row.gene_id===gene.id)
    .sort((a,b)=>Number(b.judgment==='favourable')-Number(a.judgment==='favourable'));
  return {record,claims};
}

export function reportedAllele(gene,claim,evidence) {
  const [id,state]=(claim.marker_state||'').split('=');
  const marker=gene.variants.find(v=>v.id===id);
  const proof=evidence.sites?.[id];
  if(!marker||proof?.level!=='原文功能位点'||!proof.primary?.some(doi=>normalizeDOI(doi)===normalizeDOI(claim.doi)))return null;
  return {marker,state,index:alleleNames(marker).indexOf(state)};
}

export function countReportedAllele(gene,claim,evidence,cohort) {
  const allele=reportedAllele(gene,claim,evidence);
  if(!allele)return null;
  const {marker,index}=allele;
  let callable=0,matched=0;
  for(const sample of cohort){
    if(!isAssayed(sample,marker))continue;
    const [a,b]=callOf(sample,marker);
    if(a===null||a!==b)continue;
    callable++;
    if(a===index)matched++;
  }
  return {callable,matched};
}
