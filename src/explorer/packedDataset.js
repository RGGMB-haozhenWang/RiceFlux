import {alleleNames,packedCall} from './alleles.js';
import {parseDatasetAxes,datasetTableKeys,parseDataset} from './datasets.js';
import {unpackGzip} from './assets.js';
import {sha256Data,sha256Text} from './sha256.js';

export const packedSchema='RiceFlux packed 1.0';
export const packedAxes=manifest=>datasetTableKeys(manifest).filter(key=>key!=='genotypes');
export const assetName=hash=>'blobs/'+hash+'.gz';
const validRef=ref=>ref&&/^[a-f0-9]{64}$/.test(ref.sha256)&&Number.isSafeInteger(ref.bytes)&&ref.bytes>=0;

export async function verifiedAsset(ref,read,signal){
  if(!validRef(ref))throw Error('分片清单无效');
  const bytes=await unpackGzip(await read(assetName(ref.sha256),signal));
  if(bytes.length!==ref.bytes||await sha256Data(bytes)!==ref.sha256)throw Error('数据分片哈希或长度不匹配');
  return bytes;
}

export async function readPackedAxes(manifest,read,signal){
  const index=manifest.packed;
  if(index?.schema!==packedSchema||!Array.isArray(index.blocks))throw Error('数据分片版本无效');
  const decode=async ref=>JSON.parse(new TextDecoder().decode(await verifiedAsset(ref,read,signal)));
  const [texts,phenotype]=await Promise.all([decode(index.axes),index.phenotype_axes?decode(index.phenotype_axes):null]);
  if(index.phenotype_axes){
    const keys=['environments','phenotypes'];
    if(!phenotype||Object.keys(phenotype).length!==keys.length)throw Error('表型分片仅接受试验与测值两表');
    for(const key of keys){
      if(typeof phenotype[key]!=='string'||await sha256Text(phenotype[key])!==manifest.sha256?.[key])
        throw Error('表型分片输入表哈希不匹配：'+key);
      texts[key]=phenotype[key];
    }
  }
  if(!packedAxes(manifest).every(key=>typeof texts[key]==='string'))throw Error('数据轴分片缺少输入表');
  return texts;
}

export async function openPackedDataset(manifest,read,readSource,reference,signal,axesRequest){
  const index=manifest.packed;
  const texts=await (axesRequest??readPackedAxes(manifest,read,signal));
  const axes=parseDatasetAxes(manifest,texts,reference);
  const {samples,variants}=axes,byId=new Map(variants.map(v=>[v.id,v])),seen=new Set();
  const columns=new Map(),byGene=new Map(),inflight=new Map(),ready=new Set();
  for(const ref of index.blocks){
    if(!Array.isArray(ref.markers)||!ref.markers.length||!validRef(ref)||ref.bytes!==ref.markers.length*samples.length)throw Error('分型分片轴不匹配');
    for(const id of ref.markers){
      const marker=byId.get(id);
      if(!marker||seen.has(id))throw Error('分型分片位点未知或重复：'+id);
      seen.add(id);
      if(!byGene.has(marker.gene))byGene.set(marker.gene,new Set());
      byGene.get(marker.gene).add(ref);
    }
  }
  if(seen.size!==variants.length)throw Error('分型分片覆盖不完整');
  const blocksFor=ids=>[...new Set(ids.flatMap(id=>[...(byGene.get(id)||[])]))];
  async function fill(ref,signal){
    if(ready.has(ref))return;
    if(!inflight.has(ref)){
      const request=verifiedAsset(ref,read,signal).then(bytes=>{
        const loaded=ref.markers.map((id,i)=>{
          const col=bytes.subarray(i*samples.length,(i+1)*samples.length);
          const count=alleleNames(byId.get(id)).length;
          const valid=Array.from({length:25},(_,code)=>packedCall(code).every(a=>a===null||a<count));
          if(col.some(code=>!valid[code]))throw Error('分型分片等位编码无效：'+id);
          return [id,col];
        });
        for(const [id,col] of loaded)columns.set(id,col);
        ready.add(ref);
      }).finally(()=>inflight.delete(ref));
      inflight.set(ref,request);
    }
    return inflight.get(ref);
  }
  async function loadGenes(ids,signal){
    const refs=blocksFor(ids).filter(ref=>!ready.has(ref));
    for(let i=0;i<refs.length;i+=4)await Promise.all(refs.slice(i,i+4).map(ref=>fill(ref,signal)));
  }
  async function sourceText(key){
    if(!datasetTableKeys(manifest).includes(key))throw Error('未知的输入表');
    const value=texts[key]??await readSource(key);
    if(await sha256Text(value)!==manifest.sha256?.[key])throw Error('原始输入表哈希不匹配：'+key);
    return value;
  }
  async function sourceBundle(){
    const source={...manifest};delete source.packed;
    const tables=await Promise.all(datasetTableKeys(manifest).map(async key=>[key,await sourceText(key)]));
    return parseDataset(source,Object.fromEntries(tables),reference);
  }
  return {...axes,columns,loadGenes,genesReady:ids=>blocksFor(ids).every(ref=>ready.has(ref)),sourceText,sourceBundle};
}
