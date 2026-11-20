import React,{useState} from 'react';
import {TrialProtocol} from './TrialProtocol.jsx';
import {saveFile} from './formats.js';

const roleNames={genotype:'SNP / InDel',pav:'PAV',phenotype:'表型',identity:'材料名录',reference:'参考组装'};

export function DatasetProvenance({data,bundle}){
  const {manifest,samples,variants,environments,pav,descriptors}=bundle,datasetId=manifest.id;
  const archive=manifest.provenance;
  const [envId,setEnv]=useState('');
  const groups=(data.annotations?.populations||[]).filter(r=>r.dataset_id===datasetId);
  const known=(data.annotations?.environments||[]).filter(r=>r.dataset_id===datasetId);
  const envs=known.length?known:environments,active=envs.find(e=>e.environment_id===envId)||envs[0];
  if(archive)return <div className="dataset-provenance">
    <p>{samples.length.toLocaleString()} 份材料 · {variants.filter(v=>v.markerType==='SNP').length.toLocaleString()} SNP · {variants.filter(v=>v.markerType==='InDel').length.toLocaleString()} InDel · {pav?.length||0} 个 PAV 条目{descriptors?.size>0&&` · ${descriptors.size.toLocaleString()} 份有分类表型`}{environments.length>0&&` · ${environments.length} 个定量表型记录列`}</p>
    <details><summary>溯源档案 / Provenance</summary><p>{archive.transformation}</p>
      <ul>{archive.sources.map(source=><li key={source.id}><b>{roleNames[source.role]} · {source.release}</b> · {source.citation} · {source.method}
        {source.assembly&&<> · {source.assembly}</>}{source.url&&<> · <a href={source.url} target="_blank" rel="noreferrer">原始资源</a></>}
        {source.doi&&<> · <a href={'https://doi.org/'+source.doi} target="_blank" rel="noreferrer">DOI</a></>}</li>)}</ul>
      {archive.gaps?.length>0&&<ul>{archive.gaps.map(gap=><li key={gap}>{gap}</li>)}</ul>}
      <button type="button" onClick={()=>saveFile(datasetId+'_provenance.json',JSON.stringify(archive,null,2)+'\n','application/json')}>下载溯源档案</button>
      {manifest.packed?.archive&&<a href={'./datasets/'+manifest.packed.archive} download> · 下载数据 ZIP</a>}
      {archive.artifacts?.filter(asset=>/^[-\w]+\/[\w.-]+$/.test(asset.path)).map(asset=>
        <a key={asset.path} href={'./datasets/'+asset.path} download> · {asset.label}</a>)}
    </details>
    {active&&<><label>试验与鉴定溯源 <select aria-label="鉴定溯源环境" value={active.environment_id} onChange={e=>setEnv(e.target.value)}>
      {envs.map(e=><option key={e.environment_id} value={e.environment_id}>{e.trait_name} · {e.site_label||e.site} {e.year}</option>)}
    </select></label><TrialProtocol record={active}/></>}
  </div>;
  if(datasetId==='ricenavi404')return <div className="source-note"><p>D2 · 404 份材料 / accessions · 23 SNP · 18 genes</p><p>已进入主面板频率、单基因及多基因组合。319 条原始位点中，23 个通过基因、坐标和 REF/ALT 对照；其余 296 个仅保留来源记录。/ The admitted subset is available for frequencies and genotype combinations.</p><p>来源调用未绑定深度/质量，相位未认证。表型缺少地点、年份和方法绑定，保留在原始材料表中。/ Call QC and phenotype environment metadata remain incomplete.</p><a href="./annotations/ricenavi_admission.tsv" download="ricenavi_admission.txt">319 位点接入明细 / Admission TXT</a> · <a href="https://doi.org/10.1038/s41588-020-00769-9" target="_blank" rel="noreferrer">原文 DOI</a></div>;
  if(!groups.length)return <p>自定义数据集：以输入清单和环境表为准。 / See the supplied manifest and environment table.</p>;
  return <div className="dataset-provenance"><p>论文选取 3,606 份进行表型鉴定。当前接入的 66 列中，3,605 份至少有一笔测值。 / The paper phenotyped 3,606 accessions. The imported endpoints contain measurements for 3,605.</p>
    <div className="source-group-key">{groups.map(r=><span key={r.code}><b>{r.code} · {r.label_zh}</b><small>{r.label_en} · n={r.n}</small></span>)}</div>
    <p className="footnote">来源稻区、亚种与试验地分别保留。 / Source region, subspecies and trial site remain distinct.</p>
    <label>试验与鉴定溯源 / Trial provenance <select aria-label="鉴定溯源环境" value={active?.environment_id||''} onChange={e=>setEnv(e.target.value)}>{envs.map(e=><option key={e.environment_id} value={e.environment_id}>{e.trait_name} · {e.assay} · {e.site_label} {e.year}</option>)}</select></label>
    <TrialProtocol record={active}/>
    <p><a href="./annotations/populations.tsv" download="populations.txt">群体注释 / Population TXT</a> · <a href="./annotations/phenotyping.tsv" download="phenotyping.txt">66 列测定规程 / Protocol TXT</a></p>
  </div>;
}
