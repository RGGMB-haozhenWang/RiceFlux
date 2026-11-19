import {readPrior} from './exchange.js';
import {measuredTraits} from './regions.js';
import {readTable,readPackage,combineDatasets} from './datasets.js';
import {fetchBytes,readText,unpackGzip} from './assets.js';
import {openPackedDataset} from './packedDataset.js';
export {readText} from './assets.js';
// Adapt the released cohort and its ontology to the existing explorer data model.
const groupColors = {'SC':'#438e7b','CC-I':'#7b9fc6','SW-I':'#ba9cc6','NE':'#b78351','CC-J':'#50869b','NC':'#858649','SW-J':'#957a91'};
function hasPrior(trait, label) {
  switch(trait.family) {
    case 'heading': return label==='抽穗期';
    case 'length': return /粒长|粒型|粒形/.test(label);
    case 'width': return /粒宽|粒型|粒形/.test(label);
    case 'blast': return label.includes('稻瘟病');
    case 'blight': return label.includes('白叶枯');
    // No sheath-blight-specific gene claim in this collection; expose the measured endpoint for exploration.
    case 'sheath': return true;
    default: return false;
  }
}

export function observedDataset(cohort, ontology) {
  if(!['RiceFlux modern indica 1.0','RiceFlux registry 2.0'].includes(cohort.schema))throw new Error('群体数据版本不匹配');
  const nodes=ontology['@graph'],byId=new Map(nodes.map(n=>[n['@id'],n]));
  const resolve=ref=>byId.get(ref['@id']);
  const measured=measuredTraits(cohort.environments);
  const traits=[...measured,{id:'all_prior',name:'全部核心基因',unit:'未选择表型',family:'prior',category:'基因先验'}];
  const refTraits=new Map(measured.map(t=>[t.name,t]));
  const alleles=cohort.sites.map(()=>new Set());
  for(const s of cohort.samples){
    if(s.gt.length!==cohort.sites.length*2 || s.ph.length!==cohort.environments.length)throw new Error('材料位点或环境列数不匹配');
    for(let i=0;i<s.gt.length;i++){
      const a=s.gt[i];
      if('ACGT'.includes(a))alleles[Math.floor(i/2)].add(a);
      else if(!'0N'.includes(a))throw new Error('原始基因型编码无效');
    }
  }
  const variants=cohort.sites.map((s,i)=>{
    const alts=[...alleles[i]].filter(a=>a!==s.ref);
    if(alts.length>1)throw new Error('此版频率面板要求每个坐标最多一种已观测的非参考碱基');
    return {id:s.marker,pos:s.pos,ref:s.ref,alt:alts[0]??null,gene:s.gene,chromosome:s.chr};
  });
  const genes=nodes.filter(n=>n['@type']==='Gene').map(n=>{
    const id=n.rap,model=resolve(n.referenceModel),evidence=byId.get('rf:prior_'+id);
    const prior=resolve(evidence.aboutTrait).label;
    if(!refTraits.has(prior)){
      const t={id:'prior_'+prior,name:prior,unit:'无配对表型',family:'prior',category:'文献先验'};
      traits.push(t);refTraits.set(prior,t);
    }
    const features=model.cds['@list'].map(r=>{const x=resolve(r);return {type:'CDS',start:x.start,end:x.end};});
    const sites=variants.filter(s=>s.gene===id).sort((a,b)=>a.pos-b.pos);
    for(const s of sites){
      if(s.chromosome!==model.chromosome)throw new Error('位点与基因染色体不符');
      s.feature=features.some(f=>f.start<=s.pos && s.pos<=f.end)?'CDS':s.pos>=model.promoterStart && s.pos<=model.promoterEnd?'上游 2 kb':s.pos>=model.start && s.pos<=model.end?'基因区非 CDS':'基因侧翼';
    }
    const records=nodes.filter(x=>x.gene?.['@id']===n['@id'] && x.orderedComponents).map(e=>{
      const components=e.orderedComponents['@list'].map(r=>{const c=resolve(r);return {pos:c.locatedAt?resolve(c.locatedAt).position:null,ref:c.locatedAt?resolve(c.locatedAt).reference:null,state:c.reportedState??null};});
      const key=e['@id'].slice(3),source=byId.get('rf:ev_'+key),count=byId.get('rf:obs_'+key);
      return {id:key,label:e.label,mode:e.completeness,components,sources:(source?.supportedBy||[]).map(r=>r['@id']),matched:count?.matched};
    });
    return {id,name:n.label,description:evidence.claim,prior,chromosome:model.chromosome,assembly:model.assembly,strand:model.strand,
      gene_start:model.start,gene_end:model.end,start:Math.min(model.start,model.promoterStart,...sites.map(s=>s.pos)),end:Math.max(model.end,model.promoterEnd,...sites.map(s=>s.pos)),
      promoter:{start:model.promoterStart,end:model.promoterEnd},features,variants:sites,model:model.label,sources:evidence.supportedBy.map(s=>s['@id']),records,
      trait_ids:[...new Set(['all_prior',...measured.filter(t=>hasPrior(t,prior)).map(t=>t.id),refTraits.get(prior).id])]};
  });
  const pairs=new Map();
  function decode(raw,v){
    const key=v.ref+':'+(v.alt??'')+':'+raw;
    if(!pairs.has(key))pairs.set(key,[...raw].map(a=>{
      if(a==='0'||a==='N')return null;
      if(a===v.ref)return 0;
      if(a===v.alt)return 1;
      throw new Error('等位状态与实际分型不一致');
    }));
    return pairs.get(key);
  }
  const individuals=cohort.samples.map(s=>({
    id:s.id,name:s.name,population_id:s.group,ploidy:2,kind:s.type,subspecies:s.subspecies,ped:s.ped,legacy:s.legacy,
    genotypes:Object.fromEntries(variants.map((v,i)=>[v.id,decode(s.gt.slice(2*i,2*i+2),v)])),
    phenotypes:Object.fromEntries(cohort.environments.map((e,i)=>['env_'+e.column,s.ph[i]])),
  }));
  const present=new Set(cohort.samples.map(s=>s.group));
  const populations=Object.keys(groupColors).filter(id=>present.has(id)).map(id=>({id,name:id,color:groupColors[id]}));
  return {meta:{synthetic:false,schema:cohort.schema,assembly:cohort.assembly,source:'https://pubmed.ncbi.nlm.nih.gov/40083159/'},genes,traits,populations,individuals};
}

async function readJSON(path,signal){return JSON.parse(await readText(path,signal));}

export async function loadExplorer(base,demo,signal,initialGene){
  if(demo)return readJSON(base+'data/explorer_demo.json',signal);
  const names={identities:'gene_identity',support:'dataset_gene_support',populations:'populations',environments:'phenotyping',presets:'presets'};
  const annotationsRequest=Promise.all(Object.entries(names).map(async([key,file])=>[key,readTable(await readText(base+'annotations/'+file+'.tsv',signal)).objects()]));
  const indexRequest=readText(base+'datasets/index.tsv',signal).then(index=>{
    const rows=readTable(index,['id','name','version','manifest'],'index').objects();
    if(!rows.length||new Set(rows.map(r=>r.id)).size!==rows.length||rows.some(r=>!/^[-\w]+\/manifest\.json$/.test(r.manifest)))throw Error('数据集索引无效');
    return Promise.all([rows,registeredManifest(base,rows[0],signal)]);
  });
  const [reference,[registry,manifest],literature,config,regions,traitRegistry,annotations]=await Promise.all([
    readJSON(base+'datasets/reference.json.gz',signal),indexRequest,
    readText(base+'datasets/literature.tsv',signal),readJSON(base+'formats/deployment.json',signal),readText(base+'formats/genome_regions.tsv',signal),readText(base+'formats/traits.tsv',signal),annotationsRequest]);
  if(config.version!==1)throw Error('服务器配置版本无效');
  reference.datasetRegistry=registry;
  reference.genomeRegions=readTable(regions).objects();
  reference.traitRegistry=readTable(traitRegistry).objects();
  reference.annotations=Object.fromEntries(annotations);
  for(const g of reference.genes){
    const audit=reference.annotations.identities.find(r=>r.gene_id===g.id);
    if(audit){g.name=audit.display_name;g.catalog.aliases=[...new Set([...g.catalog.aliases,...audit.aliases.split(';')])];}
    g.presets=reference.annotations.presets.filter(r=>r.gene_id===g.id);
  }
  for(const g of reference.genes)g.genomeRegions=reference.genomeRegions.filter(r=>(r.assembly===g.assembly||g.assembly==='MSU7'&&r.assembly==='IRGSP-1.0')&&Number(r.chr.replace('Chr',''))===Number(g.chromosome?.replace('Chr','')));
  reference.literature=readTable(literature,['gene_id','doi','summary','scope','event_id']).objects();
  if(config.prior_file){
    const path=config.prior_file;
    if(typeof path!=='string'||!/^formats\/[a-zA-Z0-9_-]+\.tsv$/.test(path))throw Error('服务器先验文件应位于 formats 目录');
    let request;
    reference.loadDeploymentPrior=()=>request??=readText(base+path).then(readPrior).catch(error=>{request=undefined;throw error;});
    reference.deploymentPriorFile=path;
    reference.compareOnLoad=config.compare_on_load!==false;
  }
  const bundle=await readRegistered(base,registry[0],manifest,reference,signal);
  const data=combineDatasets(reference,[bundle]);
  if(data.loadGenes)await data.loadGenes([initialGene?.(data)??(data.genes.find(g=>g.name==='DTH7')||data.genes[0]).id],signal);
  return {...data,reference,datasetRegistry:registry,datasetBundles:[bundle]};
}

async function registeredManifest(base,row,signal){
  const manifest=await readJSON(base+'datasets/'+row.manifest,signal);
  if(manifest.id!==row.id||manifest.version!==row.version)throw Error('数据集索引与版本清单不一致');
  return manifest;
}

async function readRegistered(base,row,manifest,reference,signal){
  const root=new URL(base+'datasets/',location.href),directory=new URL(row.manifest,root);
  if(!manifest.packed)return readPackage(manifest,file=>readText(new URL(file,directory),signal),reference);
  const descriptor=manifest.packed;
  if(!/^[-\w]+\.zip$/.test(descriptor.archive)||typeof descriptor.member_prefix!=='string'||!/^(?:[-\w]+\/)?$/.test(descriptor.member_prefix))throw Error('TSV 归档路径无效');
  return openPackedDataset(manifest,(file,requestSignal)=>fetchBytes(new URL(file,root),requestSignal),async key=>{
    const file=manifest.files?.[key];
    if(typeof file!=='string'||!/^[-\w.]+\.(?:tsv|txt)(?:\.gz)?$/.test(file))throw Error('清单文件名无效');
    const {archiveEntry}=await import('./portableArchive.js');
    const archive=await fetchBytes(new URL(descriptor.archive,root));
    return new TextDecoder().decode(await unpackGzip(await archiveEntry(archive,descriptor.member_prefix+file)));
  },reference,signal);
}

export async function loadRegistered(base,row,reference,signal){
  return readRegistered(base,row,await registeredManifest(base,row,signal),reference,signal);
}

let abstractRequest;
export function loadAbstracts(base) {
  abstractRequest??=readText(base+'datasets/paper_abstracts.tsv.gz').then(text=>new Map(
    readTable(text,['doi','summary','title','source_url','summary_basis'],'paper abstracts').objects().map(row=>[row.doi,row])
  )).catch(error=>{abstractRequest=undefined;throw error;});
  return abstractRequest;
}
