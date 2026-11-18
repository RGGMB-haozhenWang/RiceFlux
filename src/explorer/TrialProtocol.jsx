import React from 'react';

export function TrialProtocol({record}) {
  if(!record)return null;
  return <dl className="provenance-grid">
    <dt>试验环境 / Trial</dt><dd>{record.site_label||record.site} · {record.year}{record.site_code&&` · ${record.site_code}`}{record.coordinate_literal&&<small className="trial-coordinates">{record.coordinate_literal}{record.latitude&&` (${record.latitude}, ${record.longitude})`}</small>}</dd>
    <dt>原始指标 / Endpoint</dt><dd>{record.original_trait||record.assay} · {record.unit}</dd>
    <dt>测定规程 / Protocol</dt><dd>{record.method_description||record.source_note||'随表登记试验指标'}{record.method_en&&<small className="trial-coordinates" lang="en">{record.method_en}</small>}</dd>
    {record.field_design&&<><dt>取样与设计 / Design</dt><dd>{record.field_design}</dd></>}
    {record.quality_control&&<><dt>原研究质控 / Source QC</dt><dd>{record.quality_control}</dd></>}
    {record.standard&&<><dt>测定依据 / Standard</dt><dd>{record.standard}</dd></>}
    {record.protocol_gap&&<><dt>待核 / Pending</dt><dd>{record.protocol_gap}</dd></>}
    {(record.source_doi||record.source_note)&&<><dt>溯源 / Source</dt><dd>{record.source_table&&`${record.source_table} · 列 ${record.column} · `}{record.protocol_locator&&`${record.protocol_locator} · `}{record.source_doi?<a href={'https://doi.org/'+record.source_doi} target="_blank" rel="noreferrer">原文 DOI</a>:record.source_note}</dd></>}
  </dl>;
}
