import {measuredTraits} from './regions.js';
// Adapt the released cohort and its ontology to the existing explorer data model.
const groupColors = {'SC':'#438e7b','CC-I':'#7b9fc6','SW-I':'#ba9cc6'};
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
  if(cohort.schema!=='RiceFlux modern indica 1.0')throw new Error('群体数据版本不匹配');
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
      const components=e.orderedComponents['@list'].map(r=>{const c=resolve(r);return {pos:c.locatedAt?resolve(c.locatedAt).position:null,state:c.reportedState??null};});
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
    id:s.id,name:s.name,population_id:s.group,ploidy:2,
    genotypes:Object.fromEntries(variants.map((v,i)=>[v.id,decode(s.gt.slice(2*i,2*i+2),v)])),
    phenotypes:Object.fromEntries(cohort.environments.map((e,i)=>['env_'+e.column,s.ph[i]])),
  }));
  const populations=Object.keys(groupColors).map(id=>({id,name:id,color:groupColors[id]}));
  return {meta:{synthetic:false,schema:cohort.schema,assembly:cohort.assembly,source:'https://pubmed.ncbi.nlm.nih.gov/40083159/'},genes,traits,populations,individuals};
}

export async function readText(path,signal){
  const response=await fetch(path,{signal});
  if(!response.ok)throw new Error('数据读取失败 ('+response.status+')');
  const raw=await response.arrayBuffer(),bytes=new Uint8Array(raw);
  if(bytes[0]===31 && bytes[1]===139)return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  return new TextDecoder().decode(raw);
}

async function readJSON(path,signal){return JSON.parse(await readText(path,signal));}

export async function loadExplorer(base,demo,signal){
  if(demo)return readJSON(base+'data/explorer_demo.json',signal);
  const [cohort,graph,evidence]=await Promise.all([readJSON(base+'prior/cohort.json.gz',signal),readJSON(base+'prior/ontology.jsonld.gz',signal),readJSON(base+'prior/evidence.json.gz',signal)]);
  return {...observedDataset(cohort,graph),evidence};
}
