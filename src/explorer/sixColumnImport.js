import {readTable} from './datasets.js';
import {writeTSV} from './formats.js';
import {chromNum} from './exchange.js';
import {alleleNames,callPair,markerKind,missingCode} from './alleles.js';
import {msuGeneId,msuSiteId} from './msuIdentity.js';
import {canonicalTraitKey} from './traitVocabulary.js';

const headings=['编号','性状','基因','染色体','基因型','表型'];
const norm=value=>String(value??'').normalize('NFKC').trim().toLowerCase();
const has=value=>Boolean(value&&value!=='.'&&value!=='NA');
function indexRows(entries,key){
  const groups=new Map();
  for(const row of entries)for(const id of new Set(key(row).filter(Boolean).map(norm))){
    if(!groups.has(id))groups.set(id,[]);
    groups.get(id).push(row);
  }
  return groups;
}
function single(rows,label){
  if(rows.length!==1)throw Error(label+(rows.length?' 存在歧义，请提供规范 ID':' 未完成身份或试验对应'));
  return rows[0];
}
function setValue(data,entry,key,value,where){
  if(!data.has(entry))data.set(entry,new Map());
  const values=data.get(entry);
  if(values.has(key)&&values.get(key)!==value)throw Error(where+' 存在冲突记录：'+entry+' / '+key);
  values.set(key,value);
}
const fields=['marker_id','gene_id','chr','position','ref','alt'];

export function sixColumnTables(input,reference,target){
  const rows=readTable(input.observations,headings,'observations').objects();
  if(!rows.length)throw Error('observations 没有记录');
  const geneIndex=indexRows(reference.genes,g=>[msuGeneId(g),g.catalog?.rap,g.id,g.name,...g.catalog?.aliases||[]]);
  const declared=(input.variants?readTable(input.variants,fields,'variants').objects():[]);
  const sourceMarkers=[...reference.genes.flatMap(g=>g.variants.map(v=>({...v,gene:g.id}))),...(target?.variants||[])];
  const catalog=declared.length?declared.map(v=>{
    const gene=single(geneIndex.get(norm(v.gene_id))||[],'位点 '+v.marker_id);
    const g=msuGeneId(gene),kind=markerKind(alleleNames({ref:v.ref,alt:has(v.alt)?v.alt:null}),true);
    const id=msuSiteId(v.chr,v.position,v.ref,kind);
    if(!id||id!==v.marker_id||!g||v.gene_id!==g)throw Error('位点表须先使用核对后的 MSU7 ID 和正链等位：'+v.marker_id);
    return v;
  }):[...new Map(sourceMarkers.flatMap(v=>{
    const gene=(geneIndex.get(norm(v.gene))||[]).find(g=>g.id===v.gene);
    const geneId=msuGeneId(gene),kind=markerKind(alleleNames(v),true),chr=chromNum(v.chromosome);
    const id=msuSiteId(chr,v.pos,v.ref,kind);
    return geneId&&id?[[id,{marker_id:id,gene_id:geneId,chr:'Chr'+chr,position:v.pos,ref:v.ref,alt:alleleNames(v).slice(1).join(',')}]]:[];
  })).values()];
  const loci=indexRows(catalog,v=>[v.gene_id]);
  if(catalog.length!==new Set(catalog.map(v=>v.marker_id)).size)throw Error('位点表存在重复规范 ID');
  const envTable=input.environments?readTable(input.environments,['environment_id','trait_id','trait_name'],'environments'):null;
  const environments=envTable?.objects()||[];
  const envs=indexRows(environments,e=>[e.environment_id]);
  const eligibleByTrait=indexRows(environments,e=>[canonicalTraitKey(e.trait_id),canonicalTraitKey(e.trait_name)]);
  const samples=new Map(),calls=new Map(),values=new Map(),used=new Map();
  rows.forEach((row,i)=>{
    const label='observations 第 '+(i+2)+' 行';
    const id=row.编号.trim();
    if(!has(id)||!has(row.性状))throw Error(label+' 缺少编号或性状');
    const gene=single(geneIndex.get(norm(row.基因))||[],label+' 基因 '+row.基因);
    const geneId=msuGeneId(gene);
    if(!geneId||!gene.model||!chromNum(row.染色体)||chromNum(row.染色体)!==chromNum(gene.chromosome))
      throw Error(label+' 基因尚未核对 MSU7 模型，或染色体不一致');
    samples.set(id,{sample_id:id,name:id,source_group:'NA',subspecies:'NA',region:'NA',material_type:'unclassified'});
    if(has(row.基因型)){
      const matches=(loci.get(norm(geneId))||[]).filter(v=>!has(row.位点)||v.marker_id===row.位点);
      const site=single(matches,label+' 位点');
      used.set(site.marker_id,site);
      const alleles=alleleNames({ref:site.ref,alt:has(site.alt)?site.alt:null});
      let pair;
      try{pair=callPair(row.基因型.trim(),alleles);}
      catch(error){throw Error(label+' '+error.message);}
      const call=pair.map(a=>a??missingCode).sort((a,b)=>a-b).map(a=>a===missingCode?'.':a).join('/');
      setValue(calls,id,site.marker_id,call,label);
    }
    if(has(row.表型)){
      const trait=canonicalTraitKey(row.性状);
      const env=single(has(row.试验编号)?(envs.get(norm(row.试验编号))||[]):(eligibleByTrait.get(norm(trait))||[]),label+' 试验');
      if(![env.trait_id,env.trait_name].some(value=>canonicalTraitKey(value)===trait))throw Error(label+' 性状与试验不一致');
      setValue(values,id,env.environment_id,row.表型,label);
    }
  });
  const render=(data,keys)=>writeTSV(['sample_id',...keys],[...samples.keys()].map(sample_id=>({
    ...Object.fromEntries(data.get(sample_id)||[]),sample_id,
  })));
  const rosterColumns=['sample_id','name','source_group','subspecies','region','material_type'];
  if(input.samples){
    const registered=readTable(input.samples,rosterColumns,'samples').objects();
    if(registered.length!==samples.size||new Set(registered.map(s=>s.sample_id)).size!==samples.size||
      registered.some(s=>!samples.has(s.sample_id)))throw Error('六列表与 samples 的材料轴不一致');
  }
  if(!used.size&&!values.size)throw Error('六列表没有有效分型或表型');
  return {samples:input.samples||writeTSV(rosterColumns,[...samples.values()]),
    ...used.size&&{variants:writeTSV(fields,[...used.values()]),genotypes:render(calls,[...used.keys()])},
    ...values.size&&{environments:input.environments,phenotypes:render(values,environments.map(e=>e.environment_id))}};
}
