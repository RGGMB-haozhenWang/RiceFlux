import {chromNum,lengths} from './exchange.js';
import {writeTSV} from './formats.js';

export const datasetFiles=['samples','variants','genotypes','environments','phenotypes'];
export const groupOptions=[['source_group','来源组'],['dataset','数据集'],['subspecies','遗传亚群'],['region','来源地区'],['subspecies_region','亚群 × 地区'],['dataset_group','数据集 × 来源组']];
const colors=['#438e7b','#7b9fc6','#ba9cc6','#b78351','#50869b','#858649','#957a91'];
const legacyColors={'SC':'#438e7b','CC-I':'#7b9fc6','SW-I':'#ba9cc6','NE':'#b78351','CC-J':'#50869b','NC':'#858649','SW-J':'#957a91'};
const missing=x=>x===''||x==='NA'||x==='.';
const requireValue=(value,message)=>{if(!value)throw Error(message);};

export function readTable(text,required=[],name='TSV'){
  const lines=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n');
  while(lines.length&&lines.at(-1)==='')lines.pop();
  const fields=lines.shift().split('\t');
  requireValue(fields.every(Boolean)&&new Set(fields).size===fields.length&&required.every(k=>fields.includes(k)),name+' 表头缺列或重复');
  const rows=lines.filter(Boolean).map((line,i)=>{
    const cells=line.split('\t');requireValue(cells.length===fields.length,`${name} 第 ${i+2} 行列数不匹配`);
    return cells;
  });
  return {fields,rows,objects:()=>rows.map(cells=>Object.fromEntries(fields.map((k,i)=>[k,cells[i]])))};
}
function unique(rows,key,label){
  const ids=rows.map(r=>r[key]);
  requireValue(ids.every(x=>x&&!missing(x))&&new Set(ids).size===ids.length,label+' ID 为空或重复');
}
function sameMarker(a,b){return a.gene===b.gene&&chromNum(a.chromosome)===chromNum(b.chromosome)&&a.pos===b.pos&&a.ref===b.ref&&a.alt===b.alt;}

export function parseDataset(manifest,texts,reference){
  requireValue(manifest.schema==='RiceFlux tables 1.0'&&typeof manifest.id==='string'&&/^[A-Za-z0-9_-]+$/.test(manifest.id)&&typeof manifest.name==='string'&&manifest.name.trim()&&typeof manifest.version==='string'&&manifest.version.trim(),'数据集清单缺少有效的 schema、id、name 或 version');
  requireValue(['G_chip','G_projected','G_direct','G_mixed'].includes(manifest.genotype_evidence),'请登记分型证据 genotype_evidence：G_chip / G_projected / G_direct / G_mixed');
  requireValue(manifest.assembly==='IRGSP-1.0/MSU7','参考组装不兼容；需要 IRGSP-1.0/MSU7 正链坐标');
  requireValue(typeof manifest.source==='string'&&manifest.source.trim(),'请登记数据来源 source');
  const samples=readTable(texts.samples,['sample_id','name','source_group','subspecies','region','material_type'],'samples').objects();
  unique(samples,'sample_id','材料');requireValue(samples.length,'数据集没有材料');
  samples.forEach(s=>requireValue(s.name&&s.material_type,'材料缺少 name 或 material_type'));
  const known=new Map(reference.genes.flatMap(g=>g.variants.map(v=>[v.id,{...v,gene:g.id}])));
  const variants=readTable(texts.variants,['marker_id','gene_id','chr','position','ref','alt'],'variants').objects().map(row=>{
    const genes=reference.genes.filter(g=>[g.id,g.catalog?.msu,g.catalog?.rap].filter(Boolean).includes(row.gene_id));
    requireValue(genes.length===1,'gene_id 不能唯一匹配：'+row.gene_id+'；请使用 MSU/RAP ID');
    const g=genes[0],chr=chromNum(row.chr),pos=Number(row.position),ref=row.ref,alt=missing(row.alt)?null:row.alt;
    requireValue(g.model&&chr===chromNum(g.chromosome)&&Number.isSafeInteger(pos)&&pos>=g.start&&pos<=g.end&&pos<=lengths[chr],'位点坐标与参考模型不符：'+row.marker_id);
    requireValue(/^[ACGT]$/.test(ref)&&(alt===null||/^[ACGT]$/.test(alt)&&alt!==ref),'仅支持二倍体双等位 SNP：'+row.marker_id);
    const feature=g.features.some(f=>f.start<=pos&&pos<=f.end)?'CDS':g.promoter.start<=pos&&pos<=g.promoter.end?'上游 2 kb':'其他区域';
    const v={id:row.marker_id,gene:g.id,chromosome:'Chr'+chr,pos,ref,alt,feature,classified:'导入区域标记'};
    const old=known.get(v.id);requireValue(!old||sameMarker(old,v),'已登记位点的身份或 REF/ALT 不一致：'+v.id);
    return old?{...old}:v;
  });
  unique(variants,'id','位点');requireValue(variants.length,'数据集没有位点');
  const coords=variants.map(v=>v.chromosome+':'+v.pos);requireValue(new Set(coords).size===coords.length,'同一坐标重复；请合并位点列');
  const gt=readTable(texts.genotypes,['sample_id'],'genotypes');
  requireValue(gt.fields.length===variants.length+1&&gt.fields[0]==='sample_id'&&variants.every(v=>gt.fields.includes(v.id)),'分型表的位点列与 variants 不一致');
  requireValue(gt.rows.length===samples.length,'分型表材料数与 samples 不一致');
  const sampleIndex=new Map(samples.map((s,i)=>[s.sample_id,i])),seen=new Set(),columns=new Map(variants.map(v=>[v.id,new Uint8Array(samples.length).fill(8)]));
  const ordered=gt.fields.slice(1).map(id=>variants.find(v=>v.id===id));
  for(const row of gt.rows){
    const index=sampleIndex.get(row[0]);requireValue(index!==undefined&&!seen.has(row[0]),'分型表材料缺失或重复：'+row[0]);seen.add(row[0]);
    for(let j=0;j<ordered.length;j++){
      const v=ordered[j],raw=row[j+1],pair=missing(raw)?['.','.']:raw.split('/');
      requireValue(pair.length===2,'分型应写为 A/A、A/. 或 ./.：'+row[0]+' '+v.id);
      const codes=pair.map(a=>a==='.'?2:a===v.ref?0:a===v.alt?1:-1);
      requireValue(codes.every(c=>c>=0),'分型碱基不在 REF/ALT 中：'+row[0]+' '+v.id);
      columns.get(v.id)[index]=codes[0]+3*codes[1];
    }
  }
  const environments=readTable(texts.environments,['environment_id','trait_id','trait_name','unit','category','family','assay','site','year'],'environments').objects();
  unique(environments,'environment_id','环境');
  environments.forEach(e=>requireValue(['trait_id','trait_name','unit','category','family','assay','site','year'].every(k=>e[k]&&!missing(e[k])),'环境元数据不完整：'+e.environment_id));
  for(const e of environments){
    const known=reference.traits.find(t=>t.id===e.trait_id);
    if(known){requireValue(known.environments&&known.name===e.trait_name&&known.family===e.family&&known.category===e.category,'与已登记性状定义冲突：'+e.trait_id);
      const assay=known.environments.find(x=>x.assay===e.assay);requireValue(!assay||assay.unit===e.unit,'与已登记鉴定指标单位冲突：'+e.trait_id+' / '+e.assay);}
  }
  const envKeys=environments.map(e=>[e.trait_id,e.assay,e.site,e.year].join('|'));
  requireValue(new Set(envKeys).size===envKeys.length,'同一性状、鉴定指标、地点和年份对应多个环境；请先明确重复测量处理');
  const ph=readTable(texts.phenotypes,['sample_id'],'phenotypes');
  requireValue(ph.fields[0]==='sample_id'&&ph.fields.length===environments.length+1&&environments.every(e=>ph.fields.includes(e.environment_id)),'表型列与 environments 不一致');
  const phenotypes=new Map();
  for(const row of ph.rows){
    requireValue(sampleIndex.has(row[0])&&!phenotypes.has(row[0]),'表型表存在未知或重复材料：'+row[0]);
    const values=Object.fromEntries(ph.fields.slice(1).map((key,i)=>{
      const value=row[i+1].trim(),n=missing(value)?null:Number(value);requireValue(n===null||Number.isFinite(n)&&/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value),'表型必须为数值或 NA');return [key,n];
    }));phenotypes.set(row[0],values);
  }
  if(manifest.counts)for(const [key,n] of Object.entries({samples:samples.length,variants:variants.length,environments:environments.length}))requireValue(manifest.counts[key]===n,'清单 counts 与实际不一致：'+key);
  return {manifest,samples,variants,columns,environments,phenotypes,texts};
}

export function combineDatasets(reference,bundles,groupBy='source_group'){
  requireValue(bundles.length,'至少选择一个数据集');
  unique(bundles.map(b=>b.manifest),'id','数据集');
  const multiple=bundles.length>1,variants=new Map(),coords=new Map(),individuals=[],envs=new Map();
  const n=bundles.reduce((n,b)=>n+b.samples.length,0);
  for(const bundle of bundles)for(const v of bundle.variants){
    const old=variants.get(v.id),coord=chromNum(v.chromosome)+':'+v.pos;
    requireValue(!old||sameMarker(old,v),'数据集间位点身份冲突：'+v.id);
    requireValue(!coords.has(coord)||coords.get(coord)===v.id,'同一坐标使用不同 marker_id：'+coord+'；请统一位点字典');coords.set(coord,v.id);
    if(!old){const copy={...v};Object.defineProperty(copy,'column',{value:new Uint8Array(n).fill(8)});variants.set(v.id,copy);}
  }
  const traitMeta=new Map(),units=new Map();let offset=0;
  for(const b of bundles){
    const meta=b.manifest;
    const envMap=new Map();
    for(const e of b.environments){
      const definition=JSON.stringify([e.trait_name,e.category,e.family]);
      requireValue(!traitMeta.has(e.trait_id)||traitMeta.get(e.trait_id)===definition,'数据集间性状定义或单位冲突：'+e.trait_id);traitMeta.set(e.trait_id,definition);
      const unitKey=JSON.stringify([e.trait_id,e.assay]);requireValue(!units.has(unitKey)||units.get(unitKey)===e.unit,'数据集间鉴定指标单位冲突：'+e.trait_id+' / '+e.assay);units.set(unitKey,e.unit);
      const key=multiple?JSON.stringify([meta.id,e.environment_id]):e.environment_id;envMap.set(e.environment_id,key);
      envs.set(key,{...e,id:key,dataset_id:meta.id,display_site:multiple?meta.name+' · '+e.site:e.site,n:0});
    }
    for(const [id,col] of b.columns)variants.get(id).column.set(col,offset);
    for(const [i,s] of b.samples.entries()){
      const ph=Object.fromEntries([...envMap].map(([raw,key])=>[key,b.phenotypes.get(s.sample_id)?.[raw]??null]));
      for(const [key,value] of Object.entries(ph))if(value!==null)envs.get(key).n++;
      const id=multiple?JSON.stringify([meta.id,s.sample_id]):s.sample_id;
      individuals.push({id,source_sample_id:s.sample_id,dataset_id:meta.id,dataset_name:meta.name,genotype_evidence:meta.genotype_evidence,ordinal:offset+i,name:s.name,kind:s.material_type,subspecies:s.subspecies,region:s.region,source_group:s.source_group,ped:s.ped_id||s.sample_id,legacy:s.legacy==='true',ploidy:2,phenotypes:ph});
    }offset+=b.samples.length;
  }
  const unknown=x=>missing(x)?'未登记':x;
  const populations=new Map();
  for(const s of individuals){
    const keys=groupBy==='dataset'?[s.dataset_id]:groupBy==='subspecies'?[unknown(s.subspecies)]:groupBy==='region'?[unknown(s.region)]:groupBy==='subspecies_region'?[unknown(s.subspecies),unknown(s.region)]:groupBy==='dataset_group'?[s.dataset_id,unknown(s.source_group)]:[unknown(s.source_group)];
    s.population_id=keys.length===1?keys[0]:JSON.stringify(keys);
    const label=groupBy==='dataset'?s.dataset_name:groupBy==='dataset_group'?s.dataset_name+' · '+keys[1]:keys.join(' · ');
    if(!populations.has(s.population_id))populations.set(s.population_id,{id:s.population_id,name:label,color:groupBy==='source_group'&&legacyColors[label]||colors[populations.size%colors.length]});
  }
  const traits=reference.traits.map(({environments,...t})=>({...t,unit:t.unit??'无配对表型'}));
  for(const e of envs.values()){
    let t=traits.find(t=>t.id===e.trait_id);
    if(!t){t={id:e.trait_id,name:e.trait_name,category:e.category,family:e.family};traits.push(t);}
    t.environments??=[];t.environments.push({id:e.id,assay:e.assay,unit:e.unit,source:{column:e.environment_id.replace(/^env_/,''),site:e.display_site,original_site:e.site,year:e.year,n:e.n,dataset_id:e.dataset_id}});
  }
  const extra=traits.filter(t=>!reference.traits.some(r=>r.id===t.id)).map(t=>t.id);
  const genes=reference.genes.map(g=>{
    const vs=[...variants.values()].filter(v=>v.gene===g.id).sort((a,b)=>a.pos-b.pos);
    return {...g,variants:vs,trait_ids:[...g.trait_ids,...extra],start:g.model?Math.min(g.start,...vs.map(v=>v.pos)):null,end:g.model?Math.max(g.end,...vs.map(v=>v.pos)):null};
  });
  return {...reference,genes,traits,individuals,populations:[...populations.values()].sort((a,b)=>groupBy==='source_group'?(Object.keys(legacyColors).includes(a.id)?Object.keys(legacyColors).indexOf(a.id):99)-(Object.keys(legacyColors).includes(b.id)?Object.keys(legacyColors).indexOf(b.id):99):0),meta:{...reference.meta,datasets:bundles.map(b=>({id:b.manifest.id,name:b.manifest.name,version:b.manifest.version,source:b.manifest.source,genotype_evidence:b.manifest.genotype_evidence})),groupBy,genotype_evidence:new Set(bundles.map(b=>b.manifest.genotype_evidence)).size===1?bundles[0].manifest.genotype_evidence:'G_mixed',synthetic:false,schema:'RiceFlux registry 2.0'}};
}

export async function readPackage(manifest,reader,reference){
  const texts={};
  await Promise.all(datasetFiles.map(async key=>{
    const filename=manifest.files?.[key];requireValue(typeof filename==='string'&&/^[\w.-]+\.(?:tsv|txt)(?:\.gz)?$/.test(filename),'清单文件名无效：'+key);
    texts[key]=await reader(filename);
    const expected=manifest.sha256?.[key];
    if(expected){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(texts[key]));const hex=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');requireValue(hex===expected,'数据哈希不匹配：'+filename);}
  }));
  return parseDataset(manifest,texts,reference);
}

export function sampleTable(data){
  return writeTSV(['accession_id','dataset_id','source_sample_id','name','source_group','subspecies','region','material_type','display_group','genotype_evidence'],data.individuals.map(s=>({...s,accession_id:s.id,material_type:s.kind,display_group:s.population_id})));
}
