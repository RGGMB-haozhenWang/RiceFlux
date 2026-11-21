import {datasetFiles,optionalDatasetTables,parseDataset,readPackage,readTable} from './datasets.js';
import {writeTSV} from './formats.js';
import {readVcf} from './vcf.js';
import {sha256Text} from './sha256.js';
import {datasetIntake,manifestFields,validateTablePairs} from './inputSchema.js';
import {provenanceSources} from './provenance.js';

export async function fileText(file) {
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(bytes[0]===31&&bytes[1]===139)return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}

export const isVcfFile=name=>/\.vcf(?:\.gz|\.bgz)?$/i.test(name);

export async function vcfFileText(file) {
  const limit=32*1024*1024;
  if(file.size>limit)throw Error('浏览器可读取至 32 MiB 的区域 VCF。较大的文件请先提取目标区间。');
  if(!/\.(gz|bgz)$/i.test(file.name))return fileText(file);
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(bytes[0]!==31||bytes[1]!==139)throw Error('VCF 压缩文件缺少 gzip 文件头。');
  const view=new DataView(bytes.buffer),decoder=new TextDecoder('utf-8',{fatal:true});
  let offset=0,size=0,text='';
  while(offset<bytes.length){
    if(offset+12>bytes.length)throw Error('VCF 压缩文件截断。');
    let end=bytes.length;
    if(bytes[offset+3]&4){
      const extraEnd=offset+12+view.getUint16(offset+10,true);
      if(extraEnd>bytes.length)throw Error('VCF gzip 扩展头无效。');
      for(let i=offset+12;i+4<=extraEnd;){
        const length=view.getUint16(i+2,true);
        if(bytes[i]===66&&bytes[i+1]===67&&length===2&&i+6<=extraEnd){
          end=offset+view.getUint16(i+4,true)+1;
          if(end<extraEnd+8||end>bytes.length)throw Error('VCF BGZF 分块长度无效。');
          break;
        }
        i+=4+length;
      }
    }
    const reader=new Blob([bytes.subarray(offset,end)]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      size+=value.byteLength;
      if(size>limit){await reader.cancel();throw Error('VCF 解压后超过 32 MiB，请先提取目标区间。');}
      text+=decoder.decode(value,{stream:true});
    }
    offset=end;
  }
  return text+decoder.decode();
}

export function vcfToTables(vcf, samples, sourceId) {
  const {records}=vcf;
  const axis=new Map(vcf.samples.map((id,i)=>[id,i]));
  if(samples.length!==axis.size||new Set(samples).size!==axis.size||samples.some(id=>!axis.has(id)))
    throw Error('VCF 与材料表须登记同一组 sample_id。');
  if(!records.length)throw Error('VCF 没有可接入的基因区 SNP 或 InDel。'+(vcf.issues[0]?' 首条未接入原因 '+vcf.issues[0].reason:''));
  const fields=['marker_id','gene_id','chr','position','ref','alt','source_id','source_record_id','source_filter','reference_check'];
  const variants=writeTSV(fields,records.map(r=>({marker_id:r.id,gene_id:r.gene,chr:'Chr'+r.chr,position:r.position,ref:r.ref,alt:r.alts.join(','),
    source_id:sourceId||r.sourceId,source_record_id:r.originalId,source_filter:r.filter,reference_check:r.referenceCheck})));
  const genotypes=['sample_id\t'+records.map(r=>r.id).join('\t'),...samples.map(id=>{
    const index=axis.get(id);
    return id+'\t'+records.map(r=>r.calls[index]).join('\t');
  })].join('\n')+'\n';
  return {variants,genotypes};
}

export async function importVcfInput(text, patch, metadata, reference, name) {
  const vcf=readVcf(text,reference.genes);
  const samples=patch.samples||writeTSV(['sample_id','name','source_group','subspecies','region','material_type'],
    vcf.samples.map(id=>({sample_id:id,name:id,source_group:'NA',subspecies:'NA',region:'NA',material_type:'unclassified'})));
  const ids=readTable(samples,['sample_id'],'samples').objects().map(row=>row.sample_id);
  const inputs=vcfToTables(vcf,ids,'input_vcf');
  const digest=await sha256Text(text);
  const counts=Object.fromEntries([...new Set(vcf.issues.map(r=>r.reason))].map(reason=>[reason,vcf.issues.filter(r=>r.reason===reason).length]));
  const provenance={schema:'RiceFlux provenance 1.0',sources:[{
    id:'input_vcf',role:'genotype',release:metadata.version,citation:metadata.source,method:'VCF GT',assembly:vcf.assembly||'IRGSP-1.0/MSU7 (user input contract)',
    files:[{name,sha256:digest,hash_scope:'decoded UTF-8 VCF'}],
  }],transformation:'Registry REF where available; other REF declared by the submitter. Diploid GT allele states displayed unphased.',
  coverage:{vcf_records:vcf.records.length,vcf_skipped:vcf.issues.length,phased_calls:vcf.phased,filter_not_applied:vcf.unfiltered},exclusions:counts};
  return {patch:{...patch,samples,...inputs},provenance,issues:vcf.issues};
}

const files=Object.fromEntries(datasetFiles.map(key=>[key,key+'.tsv']));
const empty=Object.fromEntries(datasetFiles.filter(key=>key!=='samples').map(key=>[key,datasetIntake.tables[key].columns.join('\t')+'\n']));
const compactField=s=>s.trim().replace(/[\t\r\n]+/g,' ');

export function createLocalDataset(patch, metadata, reference) {
  if(!patch.samples)throw Error('新建数据集需要 samples.txt 或 samples.tsv');
  validateTablePairs(Object.keys(patch).filter(key=>patch[key]));
  if(!patch.genotypes&&!patch.phenotypes&&!optionalDatasetTables.some(key=>patch[key]))throw Error('请提供分型、表型或 PAV');
  const template=readTable(patch.samples,['sample_id'],'samples');
  const genotypes=writeTSV(['sample_id'],template.objects());
  const manifest={schema:'RiceFlux tables 1.2',id:metadata.id,name:compactField(metadata.name),version:metadata.version,
    assembly:datasetIntake.assembly,source:compactField(metadata.source),genotype_evidence:patch.genotypes?metadata.genotype_evidence:'G_none',
    files:{...files,...Object.fromEntries(optionalDatasetTables.filter(key=>patch[key]).map(key=>[key,key+'.tsv']))},
    ...metadata.provenance&&{provenance:metadata.provenance}};
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
  const manifest={...base.manifest,version:metadata.version,schema:'RiceFlux tables 1.2',files:{...base.manifest.files,...files},
    genotype_evidence:kind==='genotypes'?metadata.genotype_evidence:base.manifest.genotype_evidence,
    source:kind==='genotypes'?source:base.manifest.source,
    supplements:[...(base.manifest.supplements||[]),{kind,source}],
    ...metadata.provenance&&{provenance:{...metadata.provenance,sources:[...(base.manifest.provenance?.sources||[]),...metadata.provenance.sources]}}};
  delete manifest.sha256;
  delete manifest.counts;
  const next=parseDataset(manifest,{...base.texts,...patch},reference);
  if(kind==='genotypes'&&!next.variants.length)throw Error('新增位点表没有记录');
  return next;
}

const tableExtension=/\.(?:tsv|txt)(?:\.gz)?$/i;
export async function importDatasetFiles(selected,{mode,metadata,target,registry,reference}) {
  if(new Set(selected.map(f=>f.name)).size!==selected.length)throw Error('请一次导入一个数据集目录，文件名不可重复');
  const profile=datasetIntake.profiles[mode];
  if(!profile)throw Error('未知的数据导入方式');
  if(profile.manifestNames){
    const manifests=selected.filter(file=>profile.manifestNames.includes(file.name));
    if(manifests.length!==1)throw Error('请选择一份 manifest.json 或 manifest.jsonld，以及清单中的表格');
    const manifest=manifestFields(JSON.parse(await manifests[0].text()));
    if(registry.some(r=>r.id===manifest.id))throw Error('该数据集 ID 已存在，请使用新 ID');
    const bundle=await readPackage(manifest,name=>{
      const file=selected.find(f=>f.name===name);
      if(!file)throw Error('缺少 '+name);
      return fileText(file);
    },reference);
    return {bundle,override:false};
  }
  const vcf=selected.filter(f=>isVcfFile(f.name));
  const archive=selected.find(f=>f.name==='provenance.json');
  const tables=selected.filter(f=>!vcf.includes(f)&&f!==archive);
  const keys=tables.map(f=>f.name.replace(tableExtension,''));
  const permitted=profile.tableKeys||Object.keys(datasetIntake.tables);
  if(new Set(keys).size!==keys.length||keys.some((key,i)=>!tableExtension.test(tables[i].name)||!permitted.includes(key)))
    throw Error('请按所选导入方式提供命名正确的 TXT / TSV 表格');
  if(vcf.length>1||vcf.length&&(!profile.allowVcf||keys.includes('variants')||keys.includes('genotypes')))
    throw Error('请选择一份区域 VCF 或一组分型两表');
  validateTablePairs(keys);
  if(!vcf.length&&profile.requires?.some(key=>!keys.includes(key)))
    throw Error('缺少所选导入方式要求的表格：'+profile.requires.join('、'));
  const override=mode!=='new';
  if(override&&!target)throw Error('先预览一个目标数据集');
  if(mode==='genotypes'&&target.variants.length)throw Error('该数据集已有基因型。请将另一批分型作为独立数据集导入');
  let input=Object.fromEntries(await Promise.all(tables.map(async(f,i)=>[keys[i],await fileText(f)])));
  const fields={...metadata};
  if(archive){
    fields.provenance=JSON.parse(await fileText(archive));
    provenanceSources({provenance:fields.provenance});
  }
  const source=override?(target.sourceBundle?await target.sourceBundle():target):null;
  if(vcf.length){
    const {patch,provenance}=await importVcfInput(await vcfFileText(vcf[0]),
      {...input,...source&&{samples:source.texts.samples}},fields,reference,vcf[0].name);
    input=patch;
    fields.provenance={...fields.provenance,...provenance,sources:[...(fields.provenance?.sources||[]),...provenance.sources]};
  }
  const bundle=override?extendDataset(source,mode,input,fields,reference):createLocalDataset(input,fields,reference);
  if(override&&(!registry.find(r=>r.id===target.manifest.id)?.local||target.overlays)){
    bundle.baseVersion=target.baseVersion||target.manifest.version;
    bundle.overlays=[...(target.overlays||[]),{kind:mode,input,metadata:fields}];
  }
  return {bundle,override};
}

// Sample IDs remain exact strings so spreadsheet leading zeros are significant.
export function resolveSampleList(text, individuals, dataset='all') {
  const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(line=>line.trim());
  if(!lines.length)throw Error('名单为空');
  const fields=lines[0].split('\t').map(x=>x.trim());
  const idColumn=['source_sample_id','sample_id','编号'].find(key=>fields.includes(key));
  const index=fields.indexOf(idColumn);
  if(index<0&&fields.length>1)throw Error('多列表须包含「编号」、sample_id 或 source_sample_id 表头');
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
