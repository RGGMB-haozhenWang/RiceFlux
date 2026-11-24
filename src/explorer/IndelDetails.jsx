import {useText} from './locale.jsx';
import React,{useEffect,useMemo,useState} from 'react';
import {Button,Dialog} from '@radix-ui/themes';
import {geneSupport} from './provenance.js';
import {datasetBadge} from './datasetColors.js';
import {loadRegistered} from './observed.js';
import {combineDatasets} from './datasets.js';
import {alleleStats,percent} from './model.js';
import {markerAnnotation} from './alleles.js';
import {AlleleFrequency,missingPercent} from './AlleleFrequency.jsx';
import {markerNames} from './VariantMark.jsx';

function indelSources(data,gene,markerId) {
  const support=geneSupport(data,gene),marker=gene.variants.find(v=>v.id===markerId);
  return data.datasetRegistry.flatMap(row=>{
    const bundle=data.datasetBundles.find(b=>b.manifest.id===row.id&&b.manifest.version===row.version);
    if(row.local&&!bundle)return [];
    const record=support.find(s=>s.dataset_id===row.id&&(!s.dataset_version||s.dataset_version===row.version));
    const covered=markerId?marker?.assayedDatasets?.has(row.id)||record?.marker_ids?.split(';').includes(markerId):
      Number(record?.indel_sites)>0;
    return covered?[{row,bundle}]:[];
  });
}
function alleleLabel(variant){
  const {ref,alts}=markerAnnotation(variant);
  return ref+' → '+alts.join(' / ');
}

export function IndelDetails({data,cohort,inspection,onClose}){
  const localize = useText();
  const {gene,markerId,sourceId,trigger}=inspection;
  const sources=useMemo(()=>indelSources(data,gene,markerId),[data,gene,markerId]);
  const [choice,setChoice]=useState(sourceId||'');
  const [siteId,setSiteId]=useState(markerId||'');
  const [result,setResult]=useState(null),[attempt,setAttempt]=useState(0);
  const source=sources.find(s=>s.row.id===choice)||sources.find(s=>s.bundle)||sources[0];
  useEffect(()=>{
    if(!source)return;
    let current=true;
    setResult(null);
    async function read(){
      const bundle=source.bundle||await loadRegistered(import.meta.env.BASE_URL,source.row,data.reference);
      await bundle.loadGenes?.([gene.id]);
      const view=combineDatasets(data.reference,[bundle],data.meta.groupBy,data.datasetRegistry);
      const variants=view.genes.find(g=>g.id===gene.id)?.variants.filter(v=>v.markerType==='InDel')||[];
      return {view,variants,manifest:bundle.manifest};
    }
    read().then(value=>{if(current)setResult({source,...value});},
      error=>{if(current)setResult({source,error:error.message});});
    return()=>{current=false;};
  },[data,source,gene.id,attempt]);
  const ready=result?.source===source?result:null;
  const members=useMemo(()=>{
    if(!ready?.view)return [];
    if(!source.bundle)return ready.view.individuals;
    const ids=new Set(cohort.filter(a=>a.dataset_id===source.row.id).map(a=>a.source_sample_id));
    return ready.view.individuals.filter(a=>ids.has(a.source_sample_id));
  },[ready,source,cohort]);
  const variant=ready?.variants?.find(v=>v.id===siteId)||(!siteId?ready?.variants?.[0]:null);
  const stats=variant?alleleStats(members,variant):null;
  const assayed=gene.variants.find(v=>v.id===variant?.id)?.assayedDatasets;
  const uncovered=variant?cohort.filter(s=>!assayed?.has(s.dataset_id)).length:0;
  const provenance=ready?.manifest?.provenance?.sources?.find(s=>s.id===variant?.source_id);
  const sourceLabel=row=>datasetBadge(row.id,data.datasetRegistry)+' · '+row.name+' · '+row.version;
  return <Dialog.Root open onOpenChange={open=>{if(!open)onClose();}}>
    <Dialog.Content maxWidth="680px" className="indel-details" onCloseAutoFocus={event=>{
      if(trigger?.isConnected){event.preventDefault();trigger.focus({preventScroll:true});}
    }}>
      <Dialog.Title>{localize("InDel 位点详情")}</Dialog.Title>
      <Dialog.Description>{localize(gene.name)} · {localize(gene.catalog?.msu||gene.id)} · {localize(gene.assembly)}</Dialog.Description>
      {sources.length>1?<div className="compare-tools"><label>{localize("分型数据集")+" "}<select aria-label={localize("InDel 分型数据集")} value={source.row.id} onChange={e=>{setChoice(e.target.value);setSiteId(markerId||'');}}>
        {sources.map(({row})=><option key={row.id} value={row.id}>{localize(sourceLabel(row))}</option>)}
      </select></label></div>:<p>{source?sourceLabel(source.row):localize("该位点暂无可读取的 InDel 分型。")}</p>}
      {source&&!ready&&<p role="status">{localize("正在读取该基因的 InDel 分型…")}</p>}
      {ready?.error&&<p role="alert">{localize(ready.error)} <button type="button" onClick={()=>setAttempt(n=>n+1)}>{localize("重试")}</button></p>}
      {ready?.variants&&!variant&&<p>{localize("此数据集版本暂无请求位点的 InDel 分型。")}</p>}
      {variant&&<>
        {ready.variants.length>1&&<div className="compare-tools"><label>{localize("位点")+" "}<select aria-label={localize("InDel 位点")} value={variant.id} onChange={e=>setSiteId(e.target.value)}>
          {ready.variants.map(v=><option key={v.id} value={v.id}>{localize(v.chromosome)}:{localize(v.pos.toLocaleString())} · {localize(alleleLabel(v))}</option>)}
        </select></label></div>}
        <p className="indel-site"><b>{localize(variant.chromosome)}:{localize(variant.pos.toLocaleString())} · {localize(alleleLabel(variant))}</b><br/>
          {localize(markerNames[markerAnnotation(variant).kind])} · {localize(variant.feature)} · <code>{localize(variant.id)}</code></p>
        <p className="indel-provenance">{provenance?.url?<a href={provenance.url} target="_blank" rel="noreferrer">{localize(provenance.citation)}</a>:provenance?.citation||ready.manifest.source}
          {localize(provenance?.release&&' · '+provenance.release)}
          {provenance?.doi&&<> · <a href={'https://doi.org/'+provenance.doi} target="_blank" rel="noreferrer">DOI</a></>}
          {' · '}{localize(ready.manifest.genotype_evidence)}{localize(variant.source_record_id&&' · 原始记录 '+variant.source_record_id)}{localize(variant.source_filter&&' · FILTER '+variant.source_filter)}</p>
        <p className="indel-scope">{source.bundle?localize("当前所选材料"):localize("来源数据集全部材料")} · {localize(members.length.toLocaleString())}{localize("份覆盖 ·")}{' '}{localize((stats.n-stats.complete).toLocaleString())}{localize("份含缺失调用")}{uncovered>0&&localize(" · 当前分析 #0# 份未覆盖", [uncovered.toLocaleString()])}<br/>
          ALT {localize(stats.alt.toLocaleString())} / {localize(stats.called.toLocaleString())}{" "+localize("个有效等位 · 频率")+" "}{localize(percent(stats.af))} · MAF {localize(percent(stats.maf))} · Missing {localize(missingPercent(stats.missing))}
        </p>
        <AlleleFrequency showSummary={false} variant={variant} cohort={members} populations={ready.view.populations.filter(p=>members.some(s=>s.population_id===p.id))}/>
      </>}
      <div className="dialog-actions"><Dialog.Close><Button>{localize("关闭")}</Button></Dialog.Close></div>
    </Dialog.Content>
  </Dialog.Root>;
}
