import {callOf} from './catalog.js';
import {datasetBadge} from './datasetColors.js';
import {bundleGeneCoverage} from './geneCoverage.js';
import {canonicalTraitKey} from './traitVocabulary.js';

const coverageIndexes=new WeakMap();
function indexGeneSupport(data){
  const versions=new Map((data.datasetRegistry||[]).map(r=>[r.id,r.version]));
  const byKey=new Map(),packedVersions=new Set();
  function add(row){
    const key=JSON.stringify([row.gene_id,row.dataset_id]);
    const legacy=byKey.get(key);
    byKey.set(key,{...legacy,...row,badge:row.badge||legacy?.badge||datasetBadge(row.dataset_id,data.datasetRegistry),
      confidence_status:legacy?.confidence_status??row.confidence_status});
  }
  for(const row of data.annotations?.support||[])add(row);
  for(const row of data.annotations?.variantCoverage||[]){
    if(versions.get(row.dataset_id)!==row.dataset_version)continue;
    packedVersions.add(JSON.stringify([row.dataset_id,row.dataset_version]));
    add(row);
  }
  for(const b of data.datasetBundles||[]){
    if(packedVersions.has(JSON.stringify([b.manifest.id,b.manifest.version])))continue;
    for(const row of bundleGeneCoverage(b,data.evidence))add(row);
  }
  const byGene=new Map();
  for(const row of byKey.values()){
    if(!byGene.has(row.gene_id))byGene.set(row.gene_id,[]);
    byGene.get(row.gene_id).push(row);
  }
  return byGene;
}
export function geneSupport(data,gene){
  if(!coverageIndexes.has(data))coverageIndexes.set(data,indexGeneSupport(data));
  return coverageIndexes.get(data).get(gene.id)||[];
}
export function geneEvidence(data,gene,dataset='all'){
  const support=geneSupport(data,gene).filter(row=>dataset==='all'||row.dataset_id===dataset);
  return {support,functional:Math.max(0,...support.map(r=>Number(r.functional_sites))),
    hap:Math.max(0,...support.map(r=>Number(r.haplotype_components))),
    papers:gene.catalog?.geneDOI?.length||gene.sources?.length||0,
    indel:support.some(row=>Number(row.indel_sites)>0)};
}
export function identityFor(data,gene){
  if(gene.catalog?.collection==='cloned_catalog')return {
    gene_id:gene.id,msu_id:gene.catalog.msu,rap_id:gene.catalog.rap,display_name:gene.name,
    identity_status:gene.model?'参考模型已登记':'参考模型待核',review_scope:'扩展目录编号及参考注释'};
  return data.annotations?.identities.find(r=>r.gene_id===gene.id);
}
export function geneTraits(data,gene){
  if(data.meta.synthetic)return [];
  const curated=data.reference?.genes.find(g=>g.id===gene.id)||gene;
  // Some source records place notes next to endpoint names in the same field.
  const reported=(curated.catalog?.traits||[]).flatMap(label=>label.split(/[;；]/)).map(label=>label.trim())
    .filter(label=>label&&!/[。！？：:%％，]/.test(label)&&!/^(作者|已审|样本量|基因背景|基因\/材料背景)/.test(label));
  const names=new Set(reported.map(canonicalTraitKey));
  const registry=data.traits.filter(t=>t.family!=='prior'||t.id.startsWith('prior_'));
  // The shared sheath link serves exploratory comparisons in the core collection.
  const linked=registry.filter(t=>curated.trait_ids.includes(t.id)&&(t.id!=='sheath'||names.has(canonicalTraitKey(t.name))));
  const options=new Map();
  function add(name,registered){
    const key=canonicalTraitKey(name)||registered?.id;
    if(options.has(key))return;
    if(registered&&registered.family!=='prior'){
      options.set(key,registered);return;
    }
    const matches=registry.filter(t=>canonicalTraitKey(t.name)===key);
    const endpoints=matches.filter(t=>t.family!=='prior'||t.environments?.length);
    const trait=endpoints.length===1?endpoints[0]:registered??(matches.length===1?matches[0]:{id:'prior_'+name,name,category:'当前基因关联性状',family:'prior',unit:'无配对表型'});
    options.set(key,trait);
  }
  for(const t of linked)add(t.name,t);
  for(const name of reported)add(name);
  return [...options.values()];
}
export function hasPhenotypes(trait,dataset='all'){
  return Boolean(trait?.environments?.some(e=>e.source.n>0&&(dataset==='all'||e.source.dataset_id===dataset)));
}
export function phenotypeSupport(data,gene,dataset='all'){
  return geneTraits(data,gene).filter(t=>hasPhenotypes(t,dataset));
}
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
export function provenanceSources(manifest) {
  const archive=manifest.provenance;
  if(!archive)return new Map();
  if(archive.schema!=='RiceFlux provenance 1.0'||!Array.isArray(archive.sources)||!archive.sources.length)
    throw Error('溯源档案版本或来源列表无效。');
  if(archive.gaps&&(!Array.isArray(archive.gaps)||archive.gaps.some(gap=>typeof gap!=='string')))
    throw Error('溯源档案 gaps 应为文本列表。');
  if(archive.artifacts&&(!Array.isArray(archive.artifacts)||archive.artifacts.some(file=>!file?.label||
    !/^[-\w]+\/[\w.-]+$/.test(file.path)||!/^[a-f0-9]{64}$/.test(file.sha256||''))))
    throw Error('溯源档案含无效的产物路径或哈希。');
  const sources=new Map();
  for(const source of archive.sources){
    if(!/^[\w-]+$/.test(source.id||'')||sources.has(source.id)||
      !['genotype','pav','phenotype','identity','reference'].includes(source.role)||
      ![source.release,source.citation,source.method].every(x=>typeof x==='string'&&x.trim()))
      throw Error('溯源档案缺少来源身份、版本或方法。');
    if(source.url&&!/^https:\/\//.test(source.url))throw Error('溯源链接须为 HTTPS。');
    if(source.doi&&!/^10\.\d{4,9}\/\S+$/.test(source.doi))throw Error('溯源 DOI 无效。');
    if(source.files&&(!Array.isArray(source.files)||source.files.some(f=>!f.name||!/^[0-9a-f]{64}$/.test(f.sha256||''))))
      throw Error('溯源原文件名或 SHA-256 无效。');
    sources.set(source.id,source);
  }
  return sources;
}
