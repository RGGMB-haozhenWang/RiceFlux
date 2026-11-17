import React,{useState} from 'react';

export function DatasetProvenance({data,datasetId}){
  const [envId,setEnv]=useState('');
  const groups=(data.annotations?.populations||[]).filter(r=>r.dataset_id===datasetId);
  const envs=(data.annotations?.environments||[]).filter(r=>r.dataset_id===datasetId),active=envs.find(e=>e.environment_id===envId)||envs[0];
  if(datasetId==='ricenavi404')return <div className="source-note"><p>D2 · 404 份材料 / accessions · 23 SNP · 18 genes</p><p>已进入主面板频率、单基因及多基因组合。319 条原始位点中，23 个通过基因、坐标和 REF/ALT 对照；其余 296 个仅保留来源记录。/ The admitted subset is available for frequencies and genotype combinations.</p><p>来源调用未绑定深度/质量，相位未认证。表型缺少地点、年份和方法绑定，保留在原始材料表中。/ Call QC and phenotype environment metadata remain incomplete.</p><a href="./annotations/ricenavi_admission.tsv" download>319 位点接入明细 / Admission TSV</a> · <a href="https://doi.org/10.1038/s41588-020-00769-9" target="_blank" rel="noreferrer">原文 DOI</a></div>;
  if(!groups.length)return <p>自定义数据集：以输入清单和环境表为准。/ See the supplied manifest and environment table.</p>;
  return <div className="dataset-provenance"><p>6,044 份：5,222 现代品种 + 822 地方品种；3,605 份有当前接入性状的测值。/ Modern cultivars + landraces; phenotyped subset, not all traits in the paper.</p>
    <div className="source-group-key">{groups.map(r=><span key={r.code}><b>{r.code} · {r.label_zh}</b><small>{r.label_en} · n={r.n}</small></span>)}</div>
    <p className="footnote">来源稻区、登记亚种与试验种植地是不同字段；保留原名录分类。/ Source ecological group, subspecies and trial site are separate.</p>
    <label>试验与鉴定溯源 / Trial provenance <select aria-label="鉴定溯源环境" value={active?.environment_id||''} onChange={e=>setEnv(e.target.value)}>{envs.map(e=><option key={e.environment_id} value={e.environment_id}>{e.trait_name} · {e.assay} · {e.site_label} {e.year}</option>)}</select></label>
    {active&&<dl className="provenance-grid"><dt>种植/鉴定地点 · Site</dt><dd>{active.site_label} / {active.site} · {active.year}；原表仅到地点名，未核实田间坐标。</dd><dt>指标 · Endpoint</dt><dd>{active.original_trait} · {active.unit}</dd><dt>测定规程 · Protocol</dt><dd>尚未逐项核实 / Not yet bound to a full protocol. {active.protocol_gap}</dd><dt>来源 · Source</dt><dd>{active.source_table} · 列 {active.column} · <a href={'https://doi.org/'+active.source_doi} target="_blank" rel="noreferrer">{active.source_doi}</a></dd></dl>}
    <p><a href="./annotations/populations.tsv" download>群体注释 / Population TSV</a> · <a href="./annotations/environments.tsv" download>66 列溯源 / Environment TSV</a></p>
  </div>;
}
