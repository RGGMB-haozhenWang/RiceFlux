import {alleleNames,componentMarker,literalAllele,markerKind} from './alleles.js';
import {chromNum} from './exchange.js';
import {normalizeDOI} from './evidence.js';
import {reportedAllele} from './traitEvidence.js';

const assemblyName=value=>/^(?:IRGSP-1\.0(?:\s*\/\s*MSU7)?|MSU7)$/i.test(value||'')?'IRGSP-1.0/MSU7':value||null;
const markerType=marker=>marker.markerType||markerKind(alleleNames(marker),true);
export const sourceHaplotypeKey=(doi,id)=>JSON.stringify([normalizeDOI(doi),id]);

function markerAxis(gene,scheme) {
  const assembly=assemblyName(gene.assembly),chr=chromNum(gene.chromosome);
  if(!gene.id||!assembly||!chr||!scheme?.markers?.length||
    (scheme.assembly&&assemblyName(scheme.assembly)!==assembly))return null;
  const markers=scheme.markers;
  const keys=markers.map(marker=>{
    if(!marker||!Number.isSafeInteger(marker.pos)||marker.pos<=0||!literalAllele.test(marker.ref)||
      (marker.chromosome&&chromNum(marker.chromosome)!==chr)||
      (marker.assembly&&assemblyName(marker.assembly)!==assembly))return null;
    const kind=markerType(marker);
    return kind==='SNP'||kind==='InDel'?[marker.pos,marker.ref,kind].join(':'):null;
  });
  return keys.includes(null)||new Set(keys).size!==keys.length?null:{keys,markers,assembly,chr,geneId:gene.id};
}

function keyedVector(axis,states) {
  if(!axis||axis.keys.length!==states.length||
    states.some((state,i)=>!literalAllele.test(state)||!alleleNames(axis.markers[i]).includes(state)))return null;
  return axis.keys.map((key,i)=>[key,states[i]]).sort(([a],[b])=>a.localeCompare(b,'en'));
}

function publishedDefinitions(gene,schemes,claims,evidence) {
  const result=[];
  const add=(definition,axis,dois,kind)=>{
    if(!definition.id)return;
    const components=definition.components||[];
    const states=components.length?components.map(c=>c.state):definition.sequence.split('·');
    const vector=definition.valid?keyedVector(axis,states):null;
    const sites=vector?.map(([key,state])=>key+'='+state).join(';')||
      components.map(c=>c.pos+':'+(c.ref||'?')+'='+(c.state||'?')).join(';');
    for(const rawDoi of dois){
      const doi=normalizeDOI(rawDoi);
      if(doi)result.push({id:definition.id,doi,label:definition.label,sites,vector,kind});
    }
  };
  for(const scheme of schemes){
    if(scheme.kind!=='literature')continue;
    const axis=markerAxis(gene,scheme);
    for(const definition of scheme.definitions)add(definition,axis,scheme.doi,'haplotype');
  }
  for(const record of gene.records||[]){
    if(record.mode!=='单个位点'||record.components?.length!==1)continue;
    const dois=evidence.events?.[record.id]?.doi||[];
    if(!dois.length)continue;
    const marker=componentMarker(gene.variants,record.components[0]);
    add({...record,valid:true},markerAxis(gene,{markers:[marker]}),dois,'allele');
  }
  for(const claim of claims){
    if(claim.definition_id||!claim.marker_state)continue;
    const allele=reportedAllele(gene,claim,evidence);
    if(!allele||allele.index<0)continue;
    const id=claim.marker_state,doi=normalizeDOI(claim.doi);
    const vector=keyedVector(markerAxis(gene,{markers:[allele.marker]}),[allele.state]);
    if(doi)result.push({id,doi,label:claim.label,sites:vector?.map(([key,state])=>key+'='+state).join(';')||'',vector,kind:'allele'});
  }
  return result;
}

export function buildHaplotypeMapping(gene,scheme,sourceSchemes,groups,claims=[],evidence={}) {
  const axis=markerAxis(gene,scheme),byGroup=new Map(),bySource=new Map();
  const markerIndices=new Map(axis?.keys.map((key,i)=>[key,i]));
  const definitions=publishedDefinitions(gene,sourceSchemes,claims,evidence);
  for(const group of groups){
    const states=group.key.split(' '),vector=keyedVector(axis,states);
    if(!vector)continue;
    const id=JSON.stringify([axis.geneId,axis.assembly,axis.chr,vector]);
    byGroup.set(group.key,{id,states,sites:vector.map(([key,state])=>key+'='+state).join(';'),
      n:group.members.length,matches:[]});
  }
  const labelsByVector=new Map();
  for(const entry of definitions){
    if(!entry.vector||entry.kind!=='haplotype')continue;
    const key=JSON.stringify([entry.doi,entry.vector]);
    if(!labelsByVector.has(key))labelsByVector.set(key,new Set());
    labelsByVector.get(key).add(entry.label);
  }
  for(const entry of definitions){
    const sourceKey=sourceHaplotypeKey(entry.doi,entry.id);
    const prior=bySource.get(sourceKey);
    if(prior){
      if(prior.sites!==entry.sites||prior.label!==entry.label)prior.status='source_conflict';
      continue;
    }
    bySource.set(sourceKey,{...entry,groupKeys:[],status:'source_unresolved'});
  }
  for(const source of bySource.values()){
    if(source.status==='source_conflict'||!source.vector)continue;
    const indexes=source.vector.map(([key])=>markerIndices.get(key));
    if(indexes.includes(undefined)){
      source.status='current_missing_sites';
      continue;
    }
    const aliases=labelsByVector.get(JSON.stringify([source.doi,source.vector]));
    const relation=source.kind==='haplotype'&&aliases?.size>1?'ambiguous':source.vector.length===axis.keys.length?'exact':'extension';
    for(const [key,group] of byGroup){
      if(!source.vector.every(([,state],i)=>state===group.states[indexes[i]]))continue;
      source.groupKeys.push(key);
      group.matches.push(source);
    }
    source.status=source.groupKeys.length?relation:'not_observed';
  }
  return {byGroup,bySource,assembly:assemblyName(gene.assembly),chr:chromNum(gene.chromosome)};
}

export function haplotypeMappingRows(gene,mapping,cohort,scheme) {
  const rows=[],datasets=[...new Set(cohort.map(sample=>sample.dataset_id).filter(Boolean))].sort().join(';');
  const context={gene_id:gene.id,msu_id:gene.catalog?.msu,assembly:mapping.assembly,chr:mapping.chr||'',
    scheme_kind:scheme.kind,dataset_ids:datasets,cohort_n:cohort.length};
  const append=(group,source)=>rows.push({...context,observed_haplotype_id:group?.id,observed_sites:group?.sites,
    typed_n:group?.n,source_doi:source?.doi,source_definition_id:source?.id,source_label:source?.label,
    source_sites:source?.sites,source_definition_kind:source?.kind,mapping_status:source?.status||'no_source_match'});
  for(const group of mapping.byGroup.values()){
    if(group.matches.length)for(const source of group.matches)append(group,source);
    else append(group);
  }
  for(const source of mapping.bySource.values())if(!source.groupKeys.length)append(null,source);
  return rows;
}
