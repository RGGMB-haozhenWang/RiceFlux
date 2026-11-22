import {alleleNames,callPair} from './alleles.js';
import {callOf,isAssayed} from './catalog.js';
import {readTable} from './datasets.js';
import {typeMaterial} from './jointHaplotypes.js';
import {checkPavFields,pavNames,pavStates} from './pav.js';
import {isVcf,readVcf} from './vcf.js';

export const checkGenotypeFields=['sample_id','marker_id','genotype'];
export const checkPhenotypeFields=['sample_id','trait','value','unit','site','year','method'];
export const checkDatasetId='riceflux_local_check';
const decimal=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

export function parseMaterialCheck(texts,markers,evidence='G_mixed',genes=[]){
  const byId=new Map(markers.map(v=>[v.id,v]));
  const submitted=[],readings=[],pav=[],calls=new Map(),markerSeen=new Set(),readingsSeen=new Set(),pavSeen=new Set(),kinds=new Set();
  let material='';
  const bindSample=id=>{
    if(!id||['.','NA'].includes(id))throw Error('材料编号不能为空。');
    if(material&&id!==material)throw Error('体检一次处理一份材料，所有文件须使用相同的 sample_id。');
    material=id;
  };
  const addKind=kind=>{
    if(kinds.has(kind))throw Error('每次可各提交一份分型、表型和 PAV。');
    kinds.add(kind);
  };
  for(const text of texts){
    if(isVcf(text)){
      addKind('genotype');
      const vcf=readVcf(text,genes,{registeredOnly:true,checkOnly:true});
      bindSample(vcf.samples[0]);
      for(const record of vcf.records){
        const names=alleleNames(record.marker),alleles=[record.ref,...record.alts];
        const pair=record.calls[0].map(a=>a===null?null:names.indexOf(alleles[a]));
        const genotype=record.rawCalls[0],problem=record.problems[0];
        let status=pair.every(a=>a!==null)?'called':pair.every(a=>a===null)?'missing':'partial',note='';
        if(pair.includes(-1)||problem==='invalid_gt'){status='invalid';note=problem==='invalid_gt'?'非法或非二倍体 GT':'等位序列未登记';}
        else if(problem==='sample_filter')note='样本过滤未通过';
        if(status!=='invalid')calls.set(record.id,pair);
        submitted.push({marker_id:record.id,genotype,status,note,marker_type:record.kind,source_record_id:record.originalId,
          chr:'Chr'+record.chr,position:record.position,ref:record.ref,alt:record.alts.join(',')});
      }
      for(const record of vcf.pavRecords||[]){
        const gene=genes.find(item=>item.id===record.gene);
        pav.push({pav_id:record.id,gene_id:record.gene,gene:gene?.name||record.gene,
          source_gene_id:record.gene,status:pavStates[record.states[0]],method:'VCF GT · 片段 PAV',
          source:`Chr${record.chr}:${record.position} · ${record.kind} ${Math.abs(record.lengthChange)} bp · ${record.originalId}`});
      }
      for(const issue of vcf.issues)submitted.push({...issue,marker_id:`${issue.chr}:${issue.position} · 行 ${issue.row}`,
        status:issue.reason==='unregistered'||issue.reason==='outside_catalog'?'unknown':'excluded',note:issue.reason});
      continue;
    }
    const table=readTable(text,['sample_id'],'体检 TXT');
    const kind=table.fields.includes('marker_id')?'genotype':table.fields.includes('source_gene_id')?'pav':'phenotype';
    const fields=kind==='genotype'?checkGenotypeFields:kind==='pav'?checkPavFields:checkPhenotypeFields;
    if(!fields.every(f=>table.fields.includes(f)))throw Error('缺少列：'+fields.filter(f=>!table.fields.includes(f)).join('、'));
    addKind(kind);
    for(const r of table.objects()){
      bindSample(r.sample_id);
      if(kind==='genotype'){
        if(!r.marker_id||markerSeen.has(r.marker_id))throw Error('位点编号缺失或重复：'+r.marker_id);
        markerSeen.add(r.marker_id);
        const marker=byId.get(r.marker_id);
        if(!marker){submitted.push({...r,status:'unknown'});continue;}
        try{
          if(/\d/.test(r.genotype))throw Error('请填写实际等位序列，例如 A/G 或 A/AA。');
          const pair=callPair(r.genotype,alleleNames(marker));
          calls.set(marker.id,pair);
          submitted.push({...r,status:pair.every(a=>a!==null)?'called':pair.every(a=>a===null)?'missing':'partial'});
        }catch(e){submitted.push({...r,status:'invalid',note:e.message});}
      }else if(kind==='pav'){
        if(!['present','absent','unknown'].includes(r.status)||![r.source_gene_id,r.method,r.source].every(x=>x.trim()))
          throw Error('PAV 须填写原始基因 ID、方法、来源和状态 '+[pavNames.present,pavNames.absent,pavNames.unknown].join(' / ')+'（present / absent / unknown）。');
        const matches=genes.filter(g=>[g.id,g.catalog?.msu,g.catalog?.rap].filter(Boolean).includes(r.gene_id));
        const key=JSON.stringify([r.source,r.source_gene_id]);
        if(pavSeen.has(key)||r.gene_id&&matches.length!==1)throw Error('PAV 原始编号重复或 gene_id 无法唯一匹配。');
        pavSeen.add(key);
        pav.push({...r,gene_id:matches[0]?.id||'',gene:matches[0]?.name||r.source_gene_id});
      }else{
        if(!checkPhenotypeFields.slice(3).concat('trait').every(k=>r[k]))throw Error('表型须登记性状、单位、地点、年份和测定方法。');
        const key=JSON.stringify([r.trait,r.unit,r.site,r.year,r.method]);
        if(readingsSeen.has(key))throw Error('测定记录重复：'+r.trait+' '+r.site+' '+r.year);
        readingsSeen.add(key);
        const value=!r.value||['NA','.'].includes(r.value)?null:Number(r.value);
        if(value!==null&&(!decimal.test(r.value)||!Number.isFinite(value)))throw Error('表型值须为数字或 NA：'+r.trait);
        readings.push({...r,value});
      }
    }
  }
  if(!material)throw Error('请至少填写一条材料记录。');
  return {sample:{id:material,name:material,dataset_id:checkDatasetId,source_sample_id:material,
    genotype_evidence:kinds.has('genotype')?evidence:'G_none',genotypes:Object.fromEntries(calls)},calls,submitted,readings,pav};
}

export function inspectMaterialGene(sample,scheme,localCalls){
  const markers=localCalls?scheme.markers.map(v=>v&&({...v,assayedDatasets:new Set(localCalls.has(v.id)?[sample.dataset_id]:[])})):scheme.markers;
  const present=markers.filter(v=>v&&isAssayed(sample,v));
  const complete=present.filter(v=>callOf(sample,v).every(a=>a!==null));
  return {call:typeMaterial(sample,{...scheme,markers}),expected:scheme.positions.length,covered:present.length,
    complete:complete.length,gaps:markers.flatMap((v,i)=>!v||!complete.includes(v)?[String(scheme.positions[i])]:[])};
}
