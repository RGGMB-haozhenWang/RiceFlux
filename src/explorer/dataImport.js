import {parseDataset,readTable} from './datasets.js';
import {writeTSV} from './formats.js';

export async function fileText(file) {
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(bytes[0]===31&&bytes[1]===139)return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}

const files={samples:'samples.tsv',variants:'variants.tsv',genotypes:'genotypes.tsv',environments:'environments.tsv',phenotypes:'phenotypes.tsv'};
const empty={variants:'marker_id\tgene_id\tchr\tposition\tref\talt\n',environments:'environment_id\ttrait_id\ttrait_name\tunit\tcategory\tfamily\tassay\tsite\tyear\n',phenotypes:'sample_id\n'};
const compactField=s=>s.trim().replace(/[\t\r\n]+/g,' ');

export function createLocalDataset(patch, metadata, reference) {
  if(!patch.samples)throw Error('新建数据集需要 samples.txt 或 samples.tsv');
  if(Boolean(patch.variants)!==Boolean(patch.genotypes)||Boolean(patch.environments)!==Boolean(patch.phenotypes))throw Error('variants 与 genotypes、environments 与 phenotypes 须分别成对提供');
  if(!patch.genotypes&&!patch.phenotypes)throw Error('请提供分型表、表型表或两者');
  const template=readTable(patch.samples,['sample_id'],'samples');
  const genotypes=writeTSV(['sample_id'],template.objects());
  const manifest={schema:'RiceFlux tables 1.2',id:metadata.id,name:compactField(metadata.name),version:metadata.version,
    assembly:'IRGSP-1.0/MSU7',source:compactField(metadata.source),genotype_evidence:patch.genotypes?metadata.genotype_evidence:'G_none',files};
  return parseDataset(manifest,{...empty,genotypes,...patch},reference);
}

function appendPhenotypes(base,patch,source) {
  const old=readTable(base.texts.environments,['environment_id'],'environments');
  const incoming=readTable(patch.environments,['environment_id'],'new environments');
  const envIds=incoming.objects().map(e=>e.environment_id);
  if(!envIds.length)throw Error('新增环境表没有记录');
  const fields=[...new Set([...old.fields,...incoming.fields,'source_note'])];
  const appended=incoming.objects().map(e=>({...e,source_note:e.source_note||source}));
  const environments=writeTSV(fields,[...old.objects(),...appended]);
  const phen=readTable(patch.phenotypes,['sample_id',...envIds],'new phenotypes');
  if(phen.fields[0]!=='sample_id'||phen.fields.length!==envIds.length+1)throw Error('表型列与新增环境表不一致');
  const roster=new Set(base.samples.map(s=>s.sample_id)),added=new Map();
  for(const row of phen.objects()){
    if(!roster.has(row.sample_id)||added.has(row.sample_id))throw Error('新增表型存在未知或重复材料：'+row.sample_id);
    added.set(row.sample_id,row);
  }
  const prev=readTable(base.texts.phenotypes,['sample_id'],'phenotypes');
  const oldById=new Map(prev.objects().map(r=>[r.sample_id,r]));
  const phenotypes=writeTSV([...prev.fields,...envIds],base.samples.map(({sample_id})=>({sample_id,...oldById.get(sample_id),...added.get(sample_id)})));
  return {environments,phenotypes};
}

export function extendDataset(base, kind, input, metadata, reference) {
  const source=compactField(metadata.source);
  if(!source)throw Error('请填写新增数据来源');
  let patch;
  if(kind==='phenotypes'){
    if(!input.environments||!input.phenotypes)throw Error('请选择 environments.tsv 和 phenotypes.tsv');
    patch=appendPhenotypes(base,input,source);
  }else{
    if(base.variants.length)throw Error('该数据集已有基因型。请将另一批分型作为独立数据集导入');
    if(!input.variants||!input.genotypes)throw Error('请选择 variants.tsv 和 genotypes.tsv');
    patch={variants:input.variants,genotypes:input.genotypes};
  }
  const manifest={...base.manifest,version:metadata.version,schema:'RiceFlux tables 1.2',files,
    genotype_evidence:kind==='genotypes'?metadata.genotype_evidence:base.manifest.genotype_evidence,
    source:kind==='genotypes'?source:base.manifest.source,
    supplements:[...(base.manifest.supplements||[]),{kind,source}]};
  delete manifest.sha256;
  delete manifest.counts;
  const next=parseDataset(manifest,{...base.texts,...patch},reference);
  if(kind==='genotypes'&&!next.variants.length)throw Error('新增位点表没有记录');
  return next;
}

// Sample IDs remain exact strings so spreadsheet leading zeros are significant.
export function resolveSampleList(text, individuals, dataset='all') {
  const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(line=>line.trim());
  if(!lines.length)throw Error('名单为空');
  const fields=lines[0].split('\t').map(x=>x.trim()),index=fields.includes('source_sample_id')?fields.indexOf('source_sample_id'):fields.indexOf('sample_id');
  if(index<0&&fields.length>1)throw Error('多列表须包含 sample_id 或 source_sample_id 表头');
  const provider=fields.indexOf('dataset_id');
  const requested=new Map();
  (index<0?lines:lines.slice(1)).forEach(line=>{
    const pieces=line.split('\t'),sampleId=(pieces[Math.max(0,index)]||'').trim(),datasetId=provider>=0?pieces[provider]?.trim():'';
    if(sampleId)requested.set(JSON.stringify([datasetId||'',sampleId]),{sample_id:sampleId,dataset_id:datasetId||''});
  });
  if(!requested.size)throw Error('名单没有有效样本编号');
  const bySource=new Map();
  for(const s of individuals){
    if(dataset!=='all'&&dataset!==s.dataset_id)continue;
    const key=s.source_sample_id||s.id;
    if(!bySource.has(key))bySource.set(key,[]);
    bySource.get(key).push(s);
  }
  return [...requested.values()].map(row=>{
    const matches=(bySource.get(row.sample_id)||[]).filter(s=>!row.dataset_id||s.dataset_id===row.dataset_id);
    return {...row,status:matches.length===1?'matched':matches.length?'ambiguous':'unknown',sample:matches.length===1?matches[0]:null};
  });
}
