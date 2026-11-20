import {alleleNames, callPair, markerKind, variantKey} from './alleles.js';
import {chromNum, lengths} from './exchange.js';

export const riceAssembly='IRGSP-1.0/MSU7';
const fixed=['#CHROM','POS','ID','REF','ALT','QUAL','FILTER','INFO','FORMAT'];
const missing=x=>x===''||x==='.'||x==='NA';
const validReference=/(?:IRGSP[-_ .]*1[._]0|MSU[-_ .]*7|osa1[-_ .]*r7)/i;

export function isVcf(text) {
  return text.trimStart().startsWith('##fileformat=VCF');
}

export function readVcf(text, genes, {registeredOnly=false, checkOnly=false}={}) {
  const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/);
  if(!/^##fileformat=VCFv4\.[0-5]$/.test(lines[0]))throw Error('请输入 VCF 4.x，第一行需声明 fileformat。');
  const head=lines.findIndex(line=>line.startsWith('#CHROM'));
  if(head<0)throw Error('VCF 缺少 #CHROM 表头。');
  const metadata=lines.slice(1,head);
  const assembly=metadata.filter(line=>line.startsWith('##reference=')).map(line=>line.slice(12));
  if(assembly.some(label=>!validReference.test(label)))throw Error('VCF 声明的参考组装与 IRGSP-1.0/MSU7 不符。');
  const header=lines[head].split('\t'),samples=header.slice(fixed.length);
  if(fixed.some((key,i)=>key!==header[i])||!samples.length||samples.some(missing)||new Set(samples).size!==samples.length)
    throw Error('VCF 需含 FORMAT 和唯一的材料编号。');
  if(checkOnly&&samples.length!==1)throw Error('材料体检只接收一个样本列。');
  const known=new Map(),positions=new Map(),regions=new Map();
  for(const gene of genes){
    const chr=chromNum(gene.chromosome);
    if(gene.model){
      if(!regions.has(chr))regions.set(chr,[]);
      regions.get(chr).push(gene);
    }
    for(const marker of gene.variants){
      const kind=marker.markerType||markerKind(alleleNames(marker),true);
      known.set(variantKey(chr,marker.pos,marker.ref,kind),{marker,gene});
      const position=chr+':'+marker.pos+':'+kind;
      if(!positions.has(position))positions.set(position,[]);
      positions.get(position).push(marker);
    }
  }
  const records=[],issues=[],seen=new Set();
  let phased=0,unfiltered=0;
  for(let index=head+1;index<lines.length;index++){
    const line=lines[index];
    if(!line)continue;
    const cells=line.split('\t'),[chrom,rawPosition,originalId,ref,rawAlt,,filter,info,format]=cells;
    const chr=chromNum(chrom),position=Number(rawPosition),row=index+1;
    if(cells.length!==header.length||!/^[1-9]\d*$/.test(rawPosition))throw Error('VCF 第 '+row+' 行列数或坐标有误。');
    const alts=rawAlt.split(','),alleles=[ref,...alts],kind=markerKind(alleles,true);
    const key=variantKey(chr,position,ref,kind);
    const issue=reason=>issues.push({row,source_record_id:originalId,chr:chrom,position,ref,alt:rawAlt,reason});
    if(!lengths[chr]||position+ref.length-1>lengths[chr]){issue('coordinate');continue;}
    if(!kind){issue('unsupported_alleles');continue;}
    if(!['PASS','.'].includes(filter)){issue('filtered');continue;}
    const match=known.get(key),locus=positions.get(chr+':'+position+':'+kind);
    if(!match&&locus?.length&&locus.every(v=>v.ref.length===ref.length)){issue('reference_conflict');continue;}
    if(!match&&registeredOnly){issue('unregistered');continue;}
    const candidates=match?[match.gene]:(regions.get(chr)||[]).filter(g=>g.start<=position&&position<=g.end);
    if(candidates.length!==1){issue(candidates.length?'ambiguous_gene':'outside_catalog');continue;}
    const [gene]=candidates;
    const id=match?.marker.id||['rf',chr,position,ref,kind].join('_');
    const keys=format.split(':'),gt=keys.indexOf('GT'),ft=keys.indexOf('FT');
    if(gt<0){issue('no_gt');continue;}
    if(seen.has(key))throw Error('VCF 包含拆分后同身份的记录 '+key+'。请先合并并保留原始等位索引。');
    seen.add(key);
    if(filter==='.')unfiltered++;
    const calls=[],rawCalls=[],problems=[],cache=new Map();
    for(const value of cells.slice(9)){
      const fields=value.split(':'),raw=fields[gt]??'.';
      let pair;
      if(ft>=0&&fields[ft]&&!['.','PASS'].includes(fields[ft])){pair=[null,null];problems.push('sample_filter');}
      else{
        if(raw.includes('|'))phased++;
        try{
          if(!/^(?:\.|[0-3.][/|][0-3.])$/.test(raw))throw Error('GT');
          if(!cache.has(raw)){
            const parsed=callPair(raw.replace('|','/'),alleles);
            cache.set(raw,checkOnly?parsed:parsed.map(a=>a??'.').join('/'));
          }
          pair=cache.get(raw);
          problems.push(null);
        }catch{
          if(!checkOnly)throw Error('VCF 第 '+row+' 行存在非法或非二倍体 GT。');
          pair=[null,null];problems.push('invalid_gt');
        }
      }
      calls.push(checkOnly||typeof pair==='string'?pair:'./.');
      if(checkOnly)rawCalls.push(raw);
    }
    const sourceId=info.split(';').find(field=>field.startsWith('RF_SOURCE='))?.slice(10);
    records.push({id,gene:gene.id,chr,position,ref,alts,kind,originalId,filter,calls,sourceId,
      ...(checkOnly?{rawCalls,problems,marker:match?.marker}:{}),referenceCheck:match?'registry_ref_match':'declared_assembly'});
  }
  return {samples,records,issues,assembly:assembly[0]||null,phased,unfiltered};
}
