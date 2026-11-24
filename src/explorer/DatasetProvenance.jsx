import {useText} from './locale.jsx';
import React,{useState} from 'react';
import {TrialProtocol} from './TrialProtocol.jsx';
import {saveFile,writeTSV} from './formats.js';
import {datasetIdentityRows,identityColumns} from './msuIdentity.js';

const roleNames={genotype:'SNP / InDel',pav:'PAV',phenotype:'表型',identity:'材料名录',reference:'参考组装'};

export function DatasetProvenance({data,bundle}){
  const localize = useText();
  const {manifest,samples,variants,environments,pav,descriptors}=bundle,datasetId=manifest.id;
  const archive=manifest.provenance;
  const [envId,setEnv]=useState('');
  const [zipBusy,setZipBusy]=useState(false),[zipError,setZipError]=useState('');
  async function downloadArchive(){
    if(zipBusy)return;
    setZipBusy(true);setZipError('');
    try{saveFile(datasetId+'_portable.zip',await bundle.portableArchive(),'application/zip');}
    catch(error){setZipError(error.message||'ZIP 导出失败');}
    finally{setZipBusy(false);}
  }
  const groups=(data.annotations?.populations||[]).filter(r=>r.dataset_id===datasetId);
  const known=(data.annotations?.environments||[]).filter(r=>r.dataset_id===datasetId);
  const envs=known.length?known:environments,active=envs.find(e=>e.environment_id===envId)||envs[0];
  const identity=<button type="button" onClick={()=>saveFile(datasetId+'_msu7_crosswalk.txt',
    writeTSV(identityColumns,datasetIdentityRows(bundle)),'text/tab-separated-values;charset=utf-8')}>{localize("MSU7 身份与位点 TXT")}</button>;
  if(archive)return <div className="dataset-provenance">
    <p>{localize(samples.length.toLocaleString())}{" "+localize("份材料 ·")+" "}{localize(variants.filter(v=>v.markerType==='SNP').length.toLocaleString())} SNP · {localize(variants.filter(v=>v.markerType==='InDel').length.toLocaleString())} InDel · {localize(pav?.length||0)}{" "+localize("个 PAV 条目")}{descriptors?.size>0&&localize(" · #0# 份有分类表型", [descriptors.size.toLocaleString()])}{environments.length>0&&localize(" · #0# 个实测表型记录列", [environments.length])}</p>
    <details><summary>{localize("溯源档案 / Provenance")}</summary><p>{localize(archive.transformation)}</p>
      <ul>{archive.sources.map(source=><li key={source.id}><b>{localize(roleNames[source.role])} · {localize(source.release)}</b> · {localize(source.citation)} · {localize(source.method)}
        {source.assembly&&<> · {localize(source.assembly)}</>}{source.url&&<> · <a href={source.url} target="_blank" rel="noreferrer">{localize("原始资源")}</a></>}
        {source.doi&&<> · <a href={'https://doi.org/'+source.doi} target="_blank" rel="noreferrer">DOI</a></>}</li>)}</ul>
      {archive.gaps?.length>0&&<ul>{archive.gaps.map(gap=><li key={gap}>{localize(gap)}</li>)}</ul>}
      <button type="button" onClick={()=>saveFile(datasetId+'_provenance.json',JSON.stringify(archive,null,2)+'\n','application/json')}>{localize("下载溯源档案")}</button>
      {localize(identity)}
      {bundle.portableArchive?<button type="button" disabled={zipBusy} aria-busy={zipBusy} onClick={downloadArchive}>{zipBusy?localize("正在准备数据 ZIP…"):zipError?localize("重试下载数据 ZIP"):localize("下载数据 ZIP")}</button>:manifest.packed?.archive&&<a href={'./datasets/'+manifest.packed.archive} download>{" "+localize("· 下载数据 ZIP")}</a>}
      {zipError&&<p role="alert">{localize("ZIP 导出失败：")}{localize(zipError)}{localize("。请点击重试。")}</p>}
      {archive.artifacts?.filter(asset=>/^[-\w]+\/[\w.-]+$/.test(asset.path)).map(asset=>
        <a key={asset.path} href={'./datasets/'+asset.path} download> · {localize(asset.label)}</a>)}
    </details>
    {active&&<><label>{localize("试验与鉴定溯源")+" "}<select aria-label={localize("鉴定溯源环境")} value={active.environment_id} onChange={e=>setEnv(e.target.value)}>
      {envs.map(e=><option key={e.environment_id} value={e.environment_id}>{localize(e.trait_name)} · {localize(e.site_label||e.site)} {localize(e.year)}</option>)}
    </select></label><TrialProtocol record={active}/></>}
  </div>;
  if(datasetId==='ricenavi404')return <div className="source-note"><p>{localize("D2 · 404 份材料 · 23 个 SNP · 18 个基因")}</p>{localize(identity)}
    <a href="./annotations/ricenavi_admission.tsv" download="ricenavi_admission.txt">{localize("319 位点接入明细")}</a> · <a href="https://doi.org/10.1038/s41588-020-00769-9" target="_blank" rel="noreferrer">{localize("原文 DOI")}</a></div>;
  if(!groups.length)return <p>{localize("自定义数据集：以输入清单和环境表为准。 / See the supplied manifest and environment table.")}</p>;
  return <div className="dataset-provenance"><p>{localize("论文选取 3,606 份进行表型鉴定。当前接入的 66 列中，3,605 份至少有一笔测值。 / The paper phenotyped 3,606 accessions. The imported endpoints contain measurements for 3,605.")}</p>
    <div className="source-group-key">{groups.map(r=><span key={r.code}><b>{localize(r.code)} · {localize(r.label_zh)}</b><small>{localize(r.label_en)} · n={localize(r.n)}</small></span>)}</div>
    <p className="footnote">{localize("来源稻区、亚种与试验地分别保留。 / Source region, subspecies and trial site remain distinct.")}</p>
    <label>{localize("试验与鉴定溯源 / Trial provenance")+" "}<select aria-label={localize("鉴定溯源环境")} value={active?.environment_id||''} onChange={e=>setEnv(e.target.value)}>{envs.map(e=><option key={e.environment_id} value={e.environment_id}>{localize(e.trait_name)} · {localize(e.assay)} · {localize(e.site_label)} {localize(e.year)}</option>)}</select></label>
    <TrialProtocol record={active}/>
    <p><a href="./annotations/populations.tsv" download="populations.txt">{localize("群体注释 / Population TXT")}</a> · <a href="./annotations/phenotyping.tsv" download="phenotyping.txt">{localize("66 列测定规程 / Protocol TXT")}</a></p>
  </div>;
}
