import {callOf,isAssayed} from './catalog.js';
import {geneSchemes} from './jointHaplotypes.js';
import {inspectMaterialGene} from './materialCheck.js';
import {reportedAllele} from './traitEvidence.js';
import {normalizeDOI} from './evidence.js';

// Match molecular identities, never gene names, frequency or aggregate PAV counts.
export function priorMaterialMatch(sample,gene,claim,evidence,localCalls){
  const prepare=marker=>localCalls?{...marker,column:undefined,assayedDatasets:new Set(localCalls.has(marker.id)?[sample.dataset_id]:[])}:marker;
  if(claim.marker_state){
    const allele=reportedAllele(gene,claim,evidence);
    if(!allele||allele.index<0)return {status:'undefined',bases:''};
    const marker=prepare(allele.marker);
    if(!isAssayed(sample,marker))return {status:'uncovered',bases:''};
    const pair=callOf(sample,marker),bases=pair.map(a=>a===null?'NA':(marker.alleles||[marker.ref,...marker.alt.split(',')])[a]).join('/');
    if(pair.some(a=>a===null))return {status:'missing',bases};
    if(pair[0]!==pair[1])return {status:'heterozygous',bases};
    return {status:pair[0]===allele.index?'matched':'different',bases};
  }
  const scheme=geneSchemes(gene,evidence).find(s=>s.kind==='literature'&&s.doi.some(d=>normalizeDOI(d)===normalizeDOI(claim.doi))&&s.definitions.some(d=>d.id===claim.definition_id));
  const definition=scheme?.definitions.find(d=>d.id===claim.definition_id);
  if(!scheme||!definition?.valid)return {status:'undefined',bases:''};
  const inspected=inspectMaterialGene(sample,scheme,localCalls),call=inspected.call;
  if(['uncovered','missing','both','heterozygous','no_sites'].includes(call.status))return {...call,status:call.status==='both'?'missing':call.status};
  return {status:call.bases.split(' ').join('|')===definition.components.map(c=>c.state).join('|')?'matched':'different',bases:call.bases};
}

export function pairedPriorPhenotypes(sample,claim,axes,localReadings){
  if(localReadings)return localReadings.filter(r=>[claim.trait_id,claim.trait].includes(r.trait)&&Number.isFinite(r.value)).map(r=>({value:r.value,axis:{id:r.trait,key:JSON.stringify([sample.id,r.trait,r.unit,r.site,r.year,r.method]),dataset:sample.dataset_id,trait_id:claim.trait_id,unit:r.unit,assay:r.method,source:{site:r.site,year:r.year}}}));
  return axes.filter(a=>a.dataset===sample.dataset_id&&a.trait_id===claim.trait_id&&Number.isFinite(sample.phenotypes?.[a.id]))
    .map(axis=>({axis,value:sample.phenotypes[axis.id]}));
}

export function priorCandidate(match,sample,readings){
  return match.status==='matched'&&['G_chip','G_direct'].includes(sample.genotype_evidence)&&readings.length>0;
}
