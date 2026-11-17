import React from 'react';
import {geneSupport,identityFor} from './provenance.js';

export function SourceBadges({data,gene,detail=false}){
  const support=geneSupport(data,gene),functional=Math.max(0,...support.map(r=>Number(r.functional_sites))),hap=Math.max(0,...support.map(r=>Number(r.haplotype_components)));
  const identity=identityFor(data,gene),papers=gene.catalog?.geneDOI?.length||gene.sources?.length||0;
  return <div className="source-badges" aria-label={gene.name+' 数据与证据标识'}>
    {support.map(r=><span className={'source-badge '+(r.badge==='D1'?'dataset-one':'dataset-two')} key={r.dataset_id} title={`${r.badge} / ${r.dataset_id} · ${r.marker_count} SNP · ${data.meta.datasets.some(d=>d.id===r.dataset_id)?'已载入 / Loaded':'可在数据接口载入 / Available'} · 分型质量未认证 / Call QC not certified`}>{r.badge} · {r.marker_count} SNP</span>)}
    {functional>0&&<span className="source-badge functional" title="原文功能位点 / Literature functional site；功能证据和本群体调用质量独立">F · 文献功能 {functional}</span>}
    {hap>0&&<span className="source-badge haplotype" title="文献单倍型组分 / Literature haplotype component；不代表每个位点均有因果证据">H · 文献组分 {hap}</span>}
    {!functional&&!hap&&papers>0&&<span className="source-badge literature" title="基因层文献支持 / Gene-level literature; no typed functional-site claim">L · 基因文献</span>}
    {detail&&<span className="source-badge pending" title="HC 要求逐位点/逐调用质量证据及身份核验；完整调用不等于高置信。/ Complete calls alone do not certify high confidence.">HC · 未认证</span>}
    {identity?.identity_status==='msu_unresolved'&&<span className="source-badge pending">MSU · {gene.catalog?.rap?'待映射':'待核'}</span>}
  </div>;
}
