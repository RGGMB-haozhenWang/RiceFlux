import {callOf} from './catalog.js';
import {regionalView} from './regions.js';
export function validateDataset(data) {
  const observed=data?.meta?.synthetic===false && ['RiceFlux modern indica 1.0','RiceFlux registry 2.0'].includes(data.meta.schema);
  if(!observed && data?.meta?.synthetic!==true) throw new Error('需要带来源版本的实测数据或明确标记的合成数据。');
  for(const key of ['individuals','genes','populations','traits']) {
    if(!Array.isArray(data[key])||!data[key].length||data[key].some(x=>typeof x?.id!=='string'||!x.id)||new Set(data[key].map(x=>x.id)).size!==data[key].length) throw new Error(`${key} 标识缺失或重复`);
  }
  for(const gene of data.genes) {
    if(!Array.isArray(gene.variants)||!Array.isArray(gene.features)||!gene.trait_ids?.length||gene.trait_ids.some(id=>!data.traits.some(t=>t.id===id))||(!(gene.start<gene.end)&&!(observed&&gene.catalog&&!gene.model&&gene.start===null&&gene.end===null&&!gene.variants.length&&!gene.features.length))) throw new Error('基因结构或性状映射无效');
    if(gene.variants.some(v=>!v.id||!Number.isInteger(v.pos)||v.pos<gene.start||v.pos>gene.end||!['A','C','G','T'].includes(v.ref)||(!['A','C','G','T'].includes(v.alt) && !(observed && v.alt===null))||v.ref===v.alt)) throw new Error('SNP 注释无效');
  }
  if(data.traits.some(t=>!data.genes.some(g=>g.trait_ids.includes(t.id)))) throw new Error('性状缺少关联的演示基因');
  const variants=data.genes.flatMap(g=>g.variants);
  if(new Set(variants.map(v=>v.id)).size!==variants.length) throw new Error('变异 ID 重复');
  for(const individual of data.individuals) {
    if(individual.ploidy!==2||!data.populations.some(p=>p.id===individual.population_id)) throw new Error('群体或倍性无效');
    for(const v of variants) {
      const gt=callOf(individual,v);
      if(!Array.isArray(gt)||gt.length!==2||gt.some(a=>a!==null&&a!==0&&(a!==1||v.alt===null))) throw new Error('位点须使用二倍体双等位编码');
    }
    if(!individual.phenotypes||Object.values(individual.phenotypes).some(v=>v!==null&&!Number.isFinite(v))) throw new Error('表型必须为数值或 null');
  }
  return data;
}
export function inMaterialScope(s,scope) {
  if(scope==='legacy')return s.legacy===true;
  return !scope||scope==='all'||s.kind===scope;
}
export function selectCohort(data,popIds,individualIds,individualOnly,scope) {
  return data.individuals.filter(s=>inMaterialScope(s,scope)&&popIds.includes(s.population_id)&&(!individualOnly||individualIds.includes(s.id)));
}
export function alleleStats(samples,variant) {
  let ref=0,alt=0,complete=0,het=0;
  for(const s of samples) {
    const gt=callOf(s,variant);
    for(const a of gt) {if(a===0)ref++;else if(a===1)alt++;}
    if(gt.every(a=>a!==null)){complete++;if(gt[0]!==gt[1])het++;}
  }
  const called=ref+alt,total=samples.reduce((n,s)=>n+s.ploidy,0);
  return {ref,alt,called,total,complete,het,n:samples.length,af:called?alt/called:null,maf:called?Math.min(ref,alt)/called:null,missing:total?(total-called)/total:null};
}
export function retainedVariants(samples,gene,minMaf,maxMissing) {
  return gene.variants.filter(v=>{const s=alleleStats(samples,v);return s.called>0&&s.maf>=minMaf&&s.missing<=maxMissing;});
}
export function gtToken(gt,v) {return gt.map(a=>a===null?'·':a===0?v.ref:v.alt).sort().join('/');}
export function genotypeGroups(samples,variants) {
  if(!variants.length) return [];
  const groups=new Map();
  for(const s of samples) {
    if(variants.some(v=>callOf(s,v).includes(null)))continue;
    const key=variants.map(v=>callOf(s,v).slice().sort().join('/')).join('|');
    if(!groups.has(key))groups.set(key,{key,id:`G${key.replaceAll('/','').replaceAll('|','')}`,tokens:variants.map(v=>gtToken(callOf(s,v),v)),members:[]});
    groups.get(key).members.push(s);
  }
  return [...groups.values()].sort((a,b)=>b.members.length-a.members.length||a.key.localeCompare(b.key));
}
export function quantile(values,p) {
  const v=values.filter(Number.isFinite).slice().sort((a,b)=>a-b);
  if(!v.length)return null;
  const i=(v.length-1)*p,lo=Math.floor(i),hi=Math.ceil(i);
  return v[lo]+(v[hi]-v[lo])*(i-lo);
}
export const percent=n=>n===null?'—':`${(100*n).toFixed(1)}%`;
export function exportSnapshot(data,state) {
  const gene=data.genes.find(g=>g.id===state.geneId);
  const cohort=selectCohort(data,state.popIds,state.individualIds,state.individualOnly,state.materialScope);
  const retained=retainedVariants(cohort,gene,state.minMaf,state.maxMissing);
  const selected=retained.find(v=>v.id===state.variantId)||retained[0];
  // Older saved selections identify one worksheet column directly.
  const trait=data.traits.find(t=>t.id===state.traitId) || data.traits.find(t=>t.environments?.some(e=>e.id===state.traitId));
  const oldEndpoint=trait?.environments?.find(e=>e.id===state.traitId);
  const view=regionalView(trait,state.phenotypeView || (oldEndpoint && {assay:oldEndpoint.assay,year:oldEndpoint.source.year,site:oldEndpoint.source.site}));
  const valueId=view?.active.id || state.traitId;
  const regional=view && {assay:view.assay,year:view.year,unit:view.unit,active_site:view.active.source.site,active_column:view.active.source.column,
    sites:view.sites.map(({site,endpoint})=>({site,column:endpoint?.source.column??null}))};
  return {dataset:data.meta,exported_at:new Date().toISOString(),trait:view?{id:trait.id,name:trait.name,unit:view.unit,source:view.active.source}:trait,...(view?{phenotype_view:regional}:{}),gene:{id:gene.id,name:gene.name,assembly:gene.assembly,...(gene.catalog?{prior:gene.catalog}:{} )},selection:{...state,variantId:selected?.id??null},cohort_ids:cohort.map(s=>s.id),frequency_denominator:'called allele copies; partial calls contribute known copies',genotype_denominator:'complete individuals across retained markers',variants:gene.variants.map(v=>({...v,reference_allele:v.ref,alternate_allele:v.alt,...(data.evidence?{qtn_evidence:data.evidence.sites[v.id]}:{}),retained:retained.includes(v),...alleleStats(cohort,v)})),population_stats:selected?state.popIds.map(id=>({id,...alleleStats(cohort.filter(s=>s.population_id===id),selected)})):[],genotype_groups:genotypeGroups(cohort,retained).map(g=>({id:g.id,tokens:g.tokens,member_ids:g.members.map(s=>s.id)})),individuals:cohort.map(s=>({id:s.id,name:s.name,population_id:s.population_id,...(s.kind?{material_type:s.kind,registered_subspecies:s.subspecies,ped_id:s.ped}:{}),phenotype:s.phenotypes[valueId]??null,...(view?{phenotypes_by_column:Object.fromEntries(view.sites.filter(r=>r.endpoint).map(({endpoint:e})=>[e.source.column,s.phenotypes[e.id]??null]))}:{}),genotypes:Object.fromEntries(retained.map(v=>[v.id,callOf(s,v)]))}))};
}

export function literatureMatches(gene,definitions,cohort) {
  const byPosition=new Map(gene.variants.map(v=>[v.pos,v]));
  return definitions.map(row=>{
    const states=row.components.map(c=>c.state??'—').join('·');
    const variants=row.components.map(c=>byPosition.get(c.pos));
    const valid=row.components.length>1&&row.components.every((c,i)=>variants[i]&&/^[ACGT]$/.test(c.state)&&c.ref===variants[i].ref);
    if(!valid)return {row,states,matched:null,callable:null};
    let matched=0,callable=0;
    for(const s of cohort) {
      const pairs=variants.map(v=>callOf(s,v));
      if(pairs.some(([a,b])=>a===null||a!==b))continue;
      callable++;
      if(pairs.every(([a],i)=>(a===0?variants[i].ref:variants[i].alt)===row.components[i].state))matched++;
    }
    return {row,states,matched,callable};
  });
}
