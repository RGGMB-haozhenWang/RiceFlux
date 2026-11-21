import {materialKey,mostMeasured} from './breeder.js';
import {statusText} from './jointHaplotypes.js';
import {siteName} from './regions.js';

export const categories={'modern cultivar':'现代品种',landrace:'地方品种'};
export const decisionLabels={candidate:'候选',verify:'待核查',hold:'暂缓'};
export const schemeLabels={literature:'文献定义单倍型',observed:'标记型',custom:'自选位点型',input:'导入定义'};
export const accessionId=sample=>sample.source_sample_id??sample.id;
export const accessionName=sample=>sample.name||accessionId(sample);
export const trialSite=axis=>axis.source.original_site||axis.source.site||'';
export const trialYear=axis=>String(axis.source.year||'');
export const trialLocation=axis=>siteName(trialSite(axis))||'未登记地点';
export const trialAssay=axis=>axis.assay||axis.trait_name;
export const trialCaption=axis=>[trialLocation(axis),trialYear(axis)||'未登记年份',
  trialAssay(axis)!==axis.trait_name&&trialAssay(axis)].filter(Boolean).join(' · ');

// Match evidence_ontology.py's entity IRIs, including Python quote(..., safe='').
const entityIri=(...parts)=>parts.every(p=>p!==undefined&&p!==null&&p!=='')?
  'https://rggmb-haozhenwang.github.io/RiceFlux/formats/ontology/entity/'+parts.map(p=>
    encodeURIComponent(p).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase())).join('/'):null;

export function observationEvidence(axis,dataset){
  if(!axis)return null;
  const traitId=axis.trait_id,methodLabel=axis.assay||axis.trait_name;
  const methodId=axis.method_id||(traitId&&methodLabel?'RF:method:'+traitId+':'+methodLabel:null);
  const scaleId=axis.scale_id||(axis.unit?'RF:scale:'+axis.unit:null);
  const datasetId=axis.dataset??axis.source?.dataset_id??dataset?.id;
  const version=axis.version??(dataset?.id===datasetId?dataset.version:null);
  const environmentId=axis.environment??axis.source?.environment_id;
  const ontologyId=axis.ontology_id||null,mappingStatus=axis.mapping_status||'unmapped';
  const mappingCaption=ontologyId&&mappingStatus!=='unmapped'?
    ({exact:'精确映射',broad:'宽泛映射',related:'相关映射'}[mappingStatus]||'映射关系待核')+' · '+ontologyId:
    '外部性状本体未映射';
  const environmentCaption=trialCaption({...axis,source:axis.source||{}});
  const growthStage=axis.growth_stage&&axis.growth_stage!=='not_recorded'?axis.growth_stage:null;
  return {traitId,traitLabel:axis.trait_name,traitIri:entityIri('trait',traitId),ontologyId,mappingStatus,mappingCaption,
    methodId,methodLabel,scaleId,unit:axis.unit,variableIri:entityIri('variable',traitId,methodId,scaleId),
    environmentId,environmentIri:entityIri('environment',datasetId,version,environmentId),
    growthStage,environmentCaption,source:dataset?.id===datasetId?dataset.source||null:null,
    caption:[axis.trait_name,methodLabel,axis.unit,environmentCaption].filter(Boolean).join(' · ')};
}

export function selectTrial(records,axis,field,value){
  const alternatives=records.filter(r=>r.trait_id===axis.trait_id);
  const atSite=alternatives.filter(r=>trialSite(r)===(field==='site'?value:trialSite(axis)));
  const atYear=atSite.filter(r=>trialYear(r)===(field==='year'?value:trialYear(axis)));
  const choices=atYear.length?atYear:atSite;
  const sameAssay=choices.filter(r=>trialAssay(r)===trialAssay(axis)&&r.unit===axis.unit&&r.method_id===axis.method_id);
  return mostMeasured(sameAssay.length?sameAssay:choices);
}

export function measurements(sample,records){
  return records.filter(record=>Number.isFinite(sample.phenotypes[record.id]));
}

export function schemeDefinition(model){
  return {gene_name:model.gene.name,msu_id:model.gene.catalog?.msu??'',scheme:model.scheme.id,
    markers:model.scheme.markers.map(v=>v?.id??null),doi:model.scheme.doi};
}

export const catalogColumns=['编号','性状','基因','染色体','基因型','表现型','单位','品种名','材料类别','遗传亚群','原始来源组',
  '数据集','数据版本','试验地点','年份','测定指标','测定记录ID','表型状态','同场次百分位','参考样本数',
  '区间下限','区间上限','区间状态','基因ID','MSU ID','分型依据','分型状态','分型证据类型','位点','位点调用','文献DOI','取舍','待核查项',
  '材料IRI','数据版本IRI','性状ID','性状IRI','外部性状本体ID','本体映射状态','方法ID','量表ID','观测变量IRI','试验环境IRI','生育时期','数据来源'];

export function catalogRows(samples,dataset,axis,target,observations,models,callById,recorded){
  const evidence=observationEvidence(axis,dataset);
  return samples.flatMap(sample=>{
    const r=observations.get(sample.id),calls=callById.get(sample.id)?.calls??[];
    const value=axis?sample.phenotypes[axis.id]:null;
    return (models.length?models:[null]).map(model=>{
      const call=model?calls[model.index]:null;
      const checks=[axis&&!Number.isFinite(value)&&'补查本场表型',
        model&&(call?.status!=='called'||!['G_chip','G_direct'].includes(sample.genotype_evidence))&&'核查 '+model.gene.name+' 分型'];
      return {
        编号:accessionId(sample),性状:axis?.trait_name,基因:model?.gene.name,染色体:model?.gene.chromosome,基因型:call?.label,
        表现型:value,单位:axis?.unit,品种名:accessionName(sample),材料类别:categories[sample.kind]??sample.kind,
        遗传亚群:sample.subspecies,原始来源组:sample.source_group,数据集:dataset.id,数据版本:dataset.version,
        试验地点:axis?trialSite(axis):null,年份:axis?.source.year,测定指标:axis?trialAssay(axis):null,测定记录ID:axis?.environment,
        表型状态:axis?(Number.isFinite(value)?'已实测':'缺测'):'',同场次百分位:r?.percentile,参考样本数:r?.reference_n,
        区间下限:target.min,区间上限:target.max,区间状态:r?.target_status,基因ID:model?.gene.id,'MSU ID':model?.gene.catalog?.msu,
        分型依据:model?schemeLabels[model.scheme.kind]:null,分型状态:call?statusText[call.status]:null,分型证据类型:model?sample.genotype_evidence:null,
        位点:model?.scheme.positions.join(','),位点调用:call?.bases,文献DOI:model?.scheme.doi.join(','),取舍:decisionLabels[recorded[materialKey(sample)]],
        待核查项:checks.filter(Boolean).join(' · '),
        材料IRI:entityIri('accession',sample.dataset_id??dataset.id,accessionId(sample)),
        数据版本IRI:entityIri('dataset',dataset.id,dataset.version),性状ID:evidence?.traitId,性状IRI:evidence?.traitIri,
        外部性状本体ID:evidence?.ontologyId,本体映射状态:evidence?.mappingStatus,方法ID:evidence?.methodId,
        量表ID:evidence?.scaleId,观测变量IRI:evidence?.variableIri,试验环境IRI:evidence?.environmentIri,
        生育时期:evidence?.growthStage,数据来源:dataset.source,
      };
    });
  });
}
