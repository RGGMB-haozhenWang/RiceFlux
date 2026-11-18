import React,{useState} from 'react';
import {TrialProtocol} from './TrialProtocol.jsx';

export function DatasetProvenance({data,datasetId}){
  const [envId,setEnv]=useState('');
  const groups=(data.annotations?.populations||[]).filter(r=>r.dataset_id===datasetId);
  const envs=(data.annotations?.environments||[]).filter(r=>r.dataset_id===datasetId),active=envs.find(e=>e.environment_id===envId)||envs[0];
  if(datasetId==='ricenavi404')return <div className="source-note"><p>D2 · 404 份材料 / accessions · 23 SNP · 18 genes</p><p>已进入主面板频率、单基因及多基因组合。319 条原始位点中，23 个通过基因、坐标和 REF/ALT 对照；其余 296 个仅保留来源记录。/ The admitted subset is available for frequencies and genotype combinations.</p><p>来源调用未绑定深度/质量，相位未认证。表型缺少地点、年份和方法绑定，保留在原始材料表中。/ Call QC and phenotype environment metadata remain incomplete.</p><a href="./annotations/ricenavi_admission.tsv" download>319 位点接入明细 / Admission TSV</a> · <a href="https://doi.org/10.1038/s41588-020-00769-9" target="_blank" rel="noreferrer">原文 DOI</a></div>;
  if(!groups.length)return <p>自定义数据集：以输入清单和环境表为准。 / See the supplied manifest and environment table.</p>;
  return <div className="dataset-provenance"><p>论文选取 3,606 份进行表型鉴定。当前接入的 66 列中，3,605 份至少有一笔测值。 / The paper phenotyped 3,606 accessions. The imported endpoints contain measurements for 3,605.</p>
    <div className="source-group-key">{groups.map(r=><span key={r.code}><b>{r.code} · {r.label_zh}</b><small>{r.label_en} · n={r.n}</small></span>)}</div>
    <p className="footnote">来源稻区、亚种与试验地分别保留。 / Source region, subspecies and trial site remain distinct.</p>
    <label>试验与鉴定溯源 / Trial provenance <select aria-label="鉴定溯源环境" value={active?.environment_id||''} onChange={e=>setEnv(e.target.value)}>{envs.map(e=><option key={e.environment_id} value={e.environment_id}>{e.trait_name} · {e.assay} · {e.site_label} {e.year}</option>)}</select></label>
    <TrialProtocol record={active}/>
    <p><a href="./annotations/populations.tsv" download>群体注释 / Population TSV</a> · <a href="./annotations/phenotyping.tsv" download>66 列测定规程 / Protocol TSV</a></p>
  </div>;
}
