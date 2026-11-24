import {SourceText,useLocale} from './locale.jsx';
import React from 'react';

export function TrialProtocol({record}) {
  const {language,t:localize}=useLocale();
  if(!record)return null;
  return <dl className="provenance-grid">
    <dt>{localize("试验环境 / Trial")}</dt><dd>{localize(record.site_label||record.site)} · {localize(record.year)}{localize(record.site_code&&` · ${record.site_code}`)}{record.coordinate_literal&&<small className="trial-coordinates">{localize(record.coordinate_literal)}{localize(record.latitude&&` (${record.latitude}, ${record.longitude})`)}</small>}</dd>
    <dt>{localize("原始指标 / Endpoint")}</dt><dd>{localize(record.original_trait||record.assay)} · {localize(record.unit)}</dd>
    <dt>{localize("测定规程 / Protocol")}</dt><dd><SourceText>{(language==='en'&&record.method_en)||record.method_description||record.source_note||localize("随表登记试验指标")}</SourceText></dd>
    {record.field_design&&<><dt>{localize("取样与设计 / Design")}</dt><dd>{localize(record.field_design)}</dd></>}
    {record.quality_control&&<><dt>{localize("原研究质控 / Source QC")}</dt><dd>{localize(record.quality_control)}</dd></>}
    {record.standard&&<><dt>{localize("测定依据 / Standard")}</dt><dd>{localize(record.standard)}</dd></>}
    {record.protocol_gap&&<><dt>{localize("待核 / Pending")}</dt><dd>{localize(record.protocol_gap)}</dd></>}
    {(record.source_doi||record.source_url||record.source_note)&&<><dt>{localize("溯源 / Source")}</dt><dd>{record.source_table&&<>{localize(record.source_table)}{record.column&&localize(" · 列 #0#", [record.column])} · </>}{localize(record.protocol_locator&&`${record.protocol_locator} · `)}{record.source_doi?<a href={'https://doi.org/'+record.source_doi} target="_blank" rel="noreferrer">{localize("原文 DOI")}</a>:record.source_url?.startsWith('https://')?<a href={record.source_url} target="_blank" rel="noreferrer">{record.source_note||localize("来源数据")}</a>:record.source_note}</dd></>}
  </dl>;
}
