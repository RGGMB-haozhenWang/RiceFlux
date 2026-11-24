import {useText} from './locale.jsx';
import React from 'react';
import {geneEvidence,identityFor,phenotypeSupport} from './provenance.js';
import {datasetTint} from './datasetColors.js';

export function PhenotypeBadge({data,gene,dataset='all'}){
  const localize = useText();
  const traits=phenotypeSupport(data,gene,dataset);
  if(!traits.length)return null;
  const label='实测表型 / Measured phenotypes · '+traits.map(t=>t.name).join('、');
  return <span className="source-badge phenotype-support" title={localize(label)} role="img" aria-label={localize(label)}>P</span>;
}

export function IndelBadge({data,gene,dataset='all',onInspect}){
  const localize = useText();
  const records=geneEvidence(data,gene,dataset).support.filter(row=>Number(row.indel_sites)>0);
  if(!records.length)return null;
  const label='观察到 InDel 非参考等位 · '+records.map(row=>{
    const loaded=data.meta.datasets.some(d=>d.id===row.dataset_id);
    return row.badge+' '+row.indel_sites+' 位点'+(loaded?'':'（可载入）');
  }).join(' · ');
  const props={className:'source-badge indel-gene',title:localize(label)};
  return onInspect?<button {...props} type="button" aria-label={localize('查看 #0# InDel 位点',[gene.name])} aria-haspopup="dialog" onClick={e=>{
    e.stopPropagation();onInspect(gene,undefined,dataset==='all'?undefined:dataset,e.currentTarget);
  }}>InDel</button>:<span {...props} role="img" aria-label={localize(label)}>InDel</span>;
}

export function SourceBadges({data,gene,detail=false,phenotypeDataset='all',onInspect}){
  const localize = useText();
  const {support,functional,hap,papers}=geneEvidence(data,gene,phenotypeDataset),identity=identityFor(data,gene);
  return <div className="source-badges" aria-label={localize('#0# 数据与证据标识',[gene.name])}>
    {support.map(r=><span className="source-badge dataset-tint" style={datasetTint(r.dataset_id,data.datasetRegistry)} key={r.dataset_id}
      title={localize("#0# / #1# · #2# 位点 · #3#", [r.badge, r.dataset_id, r.marker_count, data.meta.datasets.some(d=>d.id===r.dataset_id)?'已载入 / Loaded':'可在数据接口载入 / Available'])}>
      {localize(r.badge)} · {localize(Number(r.marker_count)===1?'#0# 个位点':'#0# 位点',[r.marker_count])}</span>)}
    <IndelBadge data={data} gene={gene} dataset={phenotypeDataset} onInspect={onInspect}/>
    <PhenotypeBadge data={data} gene={gene} dataset={phenotypeDataset}/>
    {functional>0&&<span className="source-badge functional" title={localize("原文功能位点 / Literature functional site；功能证据和本群体调用质量独立")}>{localize("F · 文献功能")+" "}{localize(functional)}</span>}
    {hap>0&&<span className="source-badge haplotype" title={localize("文献单倍型组分 / Literature haplotype component；不代表每个位点均有因果证据")}>{localize("H · 文献组分")+" "}{localize(hap)}</span>}
    {!functional&&!hap&&papers>0&&<span className="source-badge literature" title={localize("基因层参考文献 / Gene-level literature")}>
      L · {gene.catalog?.collection==='cloned_catalog'?localize("目录文献"):localize("基因文献")}
    </span>}
    {detail&&<span className="source-badge pending" title={localize("HC 要求逐位点/逐调用质量证据及身份核验；完整调用不等于高置信。/ Complete calls alone do not certify high confidence.")}>{localize("HC · 未认证")}</span>}
    {identity?.identity_status==='msu_unresolved'&&<span className="source-badge pending">MSU · {gene.catalog?.rap?localize("待映射"):localize("待核")}</span>}
  </div>;
}
