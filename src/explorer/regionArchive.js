import {readTable} from './datasets.js';
import {sha256Bytes} from './sha256.js';
import {packCall} from './alleles.js';

async function verifiedBytes(files,entry){
  const file=files.get(entry?.file);
  if(!file)throw Error('档案缺少 '+entry?.file);
  const bytes=new Uint8Array(await file.arrayBuffer());
  const hash=globalThis.crypto?.subtle
    ? [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('')
    : sha256Bytes(bytes);
  if(hash!==entry.sha256)throw Error('档案 SHA256 不匹配：'+file.name);
  return bytes;
}

function gunzip(bytes){
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')));
}

export async function openRegionArchive(fileList,info){
  const files=new Map(Array.from(fileList,file=>[file.name,file]));
  if(!files.has('regions.json'))throw Error('请选择包含 regions.json 的 RiceData 区段目录');
  const manifest=await verifiedBytes(files,{file:'regions.json',sha256:info.archive_sha256});
  const index=JSON.parse(new TextDecoder().decode(manifest));
  if(index.schema!=='RiceFlux regions 1.0'||index.source_run!==info.version)throw Error('区段目录与当前 RiceData 目录版本不一致');
  const samples=readTable(new TextDecoder().decode(await verifiedBytes(files,index.samples)),['sample_id','source_group'],'6044 roster').objects();
  if(samples.length!==index.shape[1]||samples.length!==6044||new Set(samples.map(s=>s.sample_id)).size!==samples.length)throw Error('档案材料轴不完整');
  return {files,index,samples};
}

export async function readRegionGene(archive,gene){
  if(!Number(gene.unique_sites))return [];
  const {files,index,samples}=archive;
  const dict=await gunzip(await verifiedBytes(files,index.chromosomes[gene.chromosome])).text();
  const records=readTable(dict,['site_index','marker_id','position','ref','alt','gene_ids','features'],'region markers').objects();
  const selected=records.flatMap(row=>{
    const i=row.gene_ids.split(',').indexOf(gene.msu);
    return i<0?[]:[{...row,feature:row.features.split(',')[i],ordinal:Number(row.site_index)}];
  });
  if(selected.length!==Number(gene.unique_sites))throw Error('区段位点数与目录不一致');
  const variants=[];
  for(const shard of index.shards){
    const items=selected.filter(row=>row.ordinal>=shard.site_start&&row.ordinal<shard.site_end_exclusive);
    if(!items.length)continue;
    const bytes=new Uint8Array(await gunzip(await verifiedBytes(files,shard)).arrayBuffer());
    if(bytes.length!==shard.raw_bytes||bytes.length!==samples.length*(shard.site_end_exclusive-shard.site_start))throw Error('分型分片的材料或位点轴不符');
    for(const row of items){
      const alleles=[row.ref,...row.alt.split(',').filter(Boolean)];
      const lookup=index.states.map(state=>state.split('').map(base=>base==='M'?null:alleles.indexOf(base)));
      const start=(row.ordinal-shard.site_start)*samples.length,column=new Uint8Array(samples.length);
      for(let i=0;i<column.length;i++){
        const pair=lookup[bytes[start+i]];
        if(!pair||pair.includes(-1))throw Error('分型分片出现未登记等位：'+row.marker_id);
        column[i]=packCall(pair);
      }
      variants.push({id:row.marker_id,pos:Number(row.position),ref:row.ref,alt:row.alt||null,alleles,column,encoding:5,feature:row.feature,chromosome:gene.chromosome});
    }
  }
  if(variants.length!==selected.length)throw Error('所选基因分片不齐');
  return variants;
}
