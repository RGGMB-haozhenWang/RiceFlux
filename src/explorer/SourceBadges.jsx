import React from 'react';
import {geneEvidence,identityFor,phenotypeSupport} from './provenance.js';
import {datasetTint} from './datasetColors.js';

export function PhenotypeBadge({data,gene,dataset='all'}){
  const traits=phenotypeSupport(data,gene,dataset);
  if(!traits.length)return null;
  const label='实测表型 / Measured phenotypes · '+traits.map(t=>t.name).join('、');
  return <span className="source-badge phenotype-support" title={label} role="img" aria-label={label}>P</span>;
}

export function IndelBadge({data,gene,dataset='all'}){
  const records=geneEvidence(data,gene,dataset).support.filter(row=>Number(row.indel_sites)>0);
  if(!records.length)return null;
  const label='观察到 InDel 非参考等位 · '+records.map(row=>{
    const loaded=data.meta.datasets.some(d=>d.id===row.dataset_id);
    return row.badge+' '+row.indel_sites+' 位点'+(loaded?'':'（可载入）');
  }).join(' · ');
  return <span className="source-badge indel-gene" role="img" aria-label={label} title={label}>InDel</span>;
}

export function SourceBadges({data,gene,detail=false,phenotypeDataset='all'}){
  const {support,functional,hap,papers}=geneEvidence(data,gene,phenotypeDataset),identity=identityFor(data,gene);
  return <div className="source-badges" aria-label={gene.name+' 数据与证据标识'}>
    {support.map(r=><span className="source-badge dataset-tint" style={datasetTint(r.dataset_id,data.datasetRegistry)} key={r.dataset_id}
      title={`${r.badge} / ${r.dataset_id} · ${r.marker_count} 位点 · ${data.meta.datasets.some(d=>d.id===r.dataset_id)?'已载入 / Loaded':'可在数据接口载入 / Available'}`}>
      {r.badge} · {r.marker_count} 位点
    </span>)}
    <IndelBadge data={data} gene={gene} dataset={phenotypeDataset}/>
    <PhenotypeBadge data={data} gene={gene} dataset={phenotypeDataset}/>
    {functional>0&&<span className="source-badge functional" title="原文功能位点 / Literature functional site；功能证据和本群体调用质量独立">F · 文献功能 {functional}</span>}
    {hap>0&&<span className="source-badge haplotype" title="文献单倍型组分 / Literature haplotype component；不代表每个位点均有因果证据">H · 文献组分 {hap}</span>}
    {!functional&&!hap&&papers>0&&<span className="source-badge literature" title="基因层参考文献 / Gene-level literature">
      L · {gene.catalog?.collection==='cloned_catalog'?'目录文献':'基因文献'}
    </span>}
    {detail&&<span className="source-badge pending" title="HC 要求逐位点/逐调用质量证据及身份核验；完整调用不等于高置信。/ Complete calls alone do not certify high confidence.">HC · 未认证</span>}
    {identity?.identity_status==='msu_unresolved'&&<span className="source-badge pending">MSU · {gene.catalog?.rap?'待映射':'待核'}</span>}
  </div>;
}
