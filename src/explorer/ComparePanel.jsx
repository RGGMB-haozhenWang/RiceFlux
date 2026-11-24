import {useText} from './locale.jsx';
import {LinkagePanel} from './LinkagePanel.jsx';
import {findGenes} from './geneSearch.js';
import {JointPanel} from './JointPanel.jsx';
import React,{useEffect,useMemo,useState} from 'react';
import {GenomeTrack} from './GenomeTrack.jsx';
import {PavPanel} from './PavPanel.jsx';
import {callOf} from './catalog.js';
import {formats,downloadTable,saveFile,matchesMaterial,materialRow} from './formats.js';
import {AlleleFrequency} from './AlleleFrequency.jsx';
import {percent,gtToken} from './model.js';
import {resolveSites} from './siteSelection.js';
import {readPrior,bindPrior,priorResults,comparisonResults,priorGraph} from './exchange.js';
import {useGeneCalls} from './useGeneCalls.js';
import {IndelBadge,PhenotypeBadge} from './SourceBadges.jsx';
import {markerAnnotation} from './alleles.js';
import {markerNames} from './VariantMark.jsx';

function CompareGene({data,gene,variants,cohort,populations,onRemove,markerId,setMarker,onInspect}){
  const localize = useText();
  const v=variants.find(v=>v.id===markerId)||variants[0];
  return <article className="comp-gene"><header><strong>{localize(gene.name)}{' '}<IndelBadge data={data} gene={gene} onInspect={onInspect}/>{' '}<PhenotypeBadge data={data} gene={gene}/></strong><button onClick={onRemove} aria-label={localize('移除 '+gene.name)}>{localize("移除")}</button></header>
    <p>{localize([gene.catalog?.msu||gene.id,gene.model?gene.chromosome+' '+gene.gene_start.toLocaleString()+'–'+gene.gene_end.toLocaleString()+' bp':'基因模型待定位'].join(' · '))}</p>
    {gene.model&&<GenomeTrack gene={gene} variants={variants} selected={v} onSelect={setMarker} onInspect={(id,trigger)=>onInspect(gene,id,undefined,trigger)}/>}
    <PavPanel gene={gene} cohort={cohort} populations={populations}/>
    {v?<><label>{localize("查看位点")+" "}<select value={v.id} onChange={e=>setMarker(e.target.value)}>{variants.map(m=><option key={m.id} value={m.id}>
      {localize(markerNames[markerAnnotation(m).kind])} · {localize(m.pos.toLocaleString())} · {localize(m.id)}
    </option>)}</select></label>
    <AlleleFrequency variant={v} cohort={cohort} populations={populations.filter(p=>cohort.some(s=>s.population_id===p.id))}/></>:<p>{localize("当前没有可比较的实测位点。")}</p>}

  </article>;
}

export function ComparePanel({data,activeGene,cohort,config={},onConfig,onInspect}){
  const localize = useText();
  const example=data.genes.find(g=>g.name===(activeGene.name==='ALK'?'DTH7':'ALK'));
  const initialIds=useMemo(()=>[activeGene.id,...(example&&activeGene.id!==example.id?[example.id]:[])],[activeGene.id,example]);
  const ids=config.ids??initialIds,markerIds=config.markers||{};
  const setIds=value=>onConfig(prev=>({...prev,ids:typeof value==='function'?value(prev.ids??initialIds):value}));
  const setMarkerIds=value=>onConfig(prev=>({...prev,markers:typeof value==='function'?value(prev.markers||{}):value}));
  const [choice,setChoice]=useState(''),[filter,setFilter]=useState('');
  const [material,setMaterial]=useState(''),[limit,setLimit]=useState(20);
  const [records,setRecords]=useState([]),[filename,setFilename]=useState(''),[error,setError]=useState(''),[custom,setCustom]=useState(false);
  const [showRows,setShowRows]=useState(24),[showPrior,setShowPrior]=useState(false);
  const bundledLibrary=data.deploymentPriorFile==='formats/prior_477.tsv';
  function add(id){if(id)setIds(previous=>previous.includes(id)?previous:[...previous,id]);}
  const available=findGenes(data.genes,filter).filter(g=>!g.catalog?.historical&&!ids.includes(g.id));
  const selected=available.some(g=>g.id===choice)?choice:available[0]?.id||'';
  const genes=useMemo(()=>ids.map(id=>data.genes.find(g=>g.id===id)).filter(Boolean),[ids,data.genes]);
  const calls=useGeneCalls(data,ids,true);
  const priorCalls=useGeneCalls(data,[...new Set(records.map(r=>r.gene?.id).filter(Boolean))],showPrior);
  const regionSites=genes.map(g=>config.joint?.chosen?.[g.id]==='custom'?resolveSites(g,config.joint.customSites?.[g.id]).variants:g.variants);
  const selectedSites=genes.map((g,i)=>regionSites[i].find(v=>v.id===markerIds[g.id])||regionSites[i][0]);
  const siteLabels=genes.map((g,i)=>g.name+'|'+(selectedSites[i]?.id||'NA'));
  function sampleRow(s) {
    const row=materialRow(s);
    selectedSites.forEach((v,i)=>row[siteLabels[i]]=v?gtToken(callOf(s,v),v):'NA');
    return row;
  }
  const visibleSamples=genes.length?cohort.filter(s=>matchesMaterial(s,material)):[];
  function install(parsed,name,selectGenes=true){
    const bound=bindPrior(parsed,data.genes);
    setRecords(bound);setFilename(name);setShowRows(24);setError('');
    if(selectGenes){
      setIds([...new Set(bound.map(r=>r.gene?.id).filter(Boolean))]);
    }
  }
  useEffect(()=>{
    if(config.input){install(readPrior(config.input),config.inputName||'personal.tsv',false);setCustom(true);return;}
    if(custom){setRecords(bindPrior(records,data.genes));return;}
    if(!data.loadDeploymentPrior)return;
    let active=true;
    data.loadDeploymentPrior().then(prior=>{
      if(active)install(prior,data.deploymentPriorFile.split('/').at(-1),data.compareOnLoad);
    },e=>{if(active)setError(e.message);});
    return()=>{active=false;};
  },[data,config.input]);
  const results=useMemo(()=>showPrior&&priorCalls.ready&&records.length?priorResults(records,cohort,data.evidence):[],[showPrior,priorCalls.ready,records,data,cohort]);
  function contextual(rows){return rows.map(row=>({...row,Dataset_versions:JSON.stringify(data.meta.datasets||[]),Grouping_dimension:data.meta.groupBy||'source_group'}));}
  function exportComparison(){
    downloadTable(formats.siteComparison,contextual(comparisonResults(genes,cohort,data.evidence)));
  }
  function exportGraph(){
    const graph=priorGraph(records,results,filename,cohort);
    saveFile(formats.priorGraph.filename,JSON.stringify(graph,null,2),'application/ld+json');
  }
  async function upload(event){
    const file=event.target.files[0];event.target.value='';if(!file)return;
    try{const input=await file.text();install(readPrior(input),file.name);setCustom(true);onConfig(prev=>({...prev,input,inputName:file.name}));}catch(e){setError(e.message);}
  }
  return <section className="panel compare-panel"><div className="compare-tools"><input aria-label={localize("搜索比较基因")} type="search" placeholder={localize("基因名或基因编号")} value={filter} onChange={e=>setFilter(e.target.value)}/>
  <select aria-label={localize("选择比较基因")} value={selected} onChange={e=>setChoice(e.target.value)}>{!available.length&&<option value="">{localize("无匹配基因")}</option>}{available.map(g=><option key={g.id} value={g.id}>{localize(g.name)} · {localize(g.catalog?.msu||g.id)}</option>)}</select>
  <button disabled={!selected} onClick={()=>add(selected)}>{localize("加入比较")}</button><label className="file-button">{localize("导入八列 TXT / TSV")}<input aria-label={localize("导入八列 TSV")} type="file" accept=".tsv,.txt" onChange={upload}/></label>
  <a href="./formats/prior.tsv" download="prior.txt">{localize("样表")}</a><a href="./formats/README.txt" target="_blank" rel="noreferrer">{localize("格式与部署")}</a><a href="./formats/exchange.json" download>{localize("输入输出本体")}</a>
  {bundledLibrary&&<><a href="./formats/prior_477.tsv" download="prior_477.txt">{localize("477 基因全库 TXT")}</a><a href="./formats/gene_index.tsv" download="gene_index.txt">{localize("逐基因索引")}</a><a href="./formats/riceflux_prior_477.zip" download>{localize("完整输入包 ZIP")}</a></>}
  </div>
  {error&&<p role="alert">{localize(error)}</p>}<p>{localize(genes.length)}{" "+localize("个基因 · 当前")+" "}{localize(cohort.length.toLocaleString())}{" "+localize("份材料")}</p>
  {genes.length>0&&<div className="compare-tools joint-chips">{genes.map(g=><button key={g.id} aria-label={localize('从组合移除 '+g.name)} onClick={()=>setIds(previous=>previous.filter(id=>id!==g.id))}>{localize(g.name)} ×</button>)}</div>}
  {!calls.ready?<Readiness calls={calls}/>:genes.length>=2?<JointPanel key={JSON.stringify(ids)} data={data} genes={genes} cohort={cohort} records={records} config={config.joint||{}} onConfig={joint=>onConfig(prev=>({...prev,joint}))}/>:<p>{localize("请选择至少两个基因查看跨基因组合。")}</p>}
  {calls.ready&&genes.length>0&&<section className="joint-secondary"><h3>{localize("基因区域与分群等位频率")}</h3><button onClick={exportComparison}>{localize("导出位点比较 TXT")}</button>
  <div className="comparison-grid">{genes.map((g,i)=><CompareGene key={g.id} data={data} gene={g} variants={regionSites[i]} cohort={cohort} populations={data.populations} markerId={markerIds[g.id]} setMarker={id=>setMarkerIds(prev=>({...prev,[g.id]:id}))} onRemove={()=>setIds(ids.filter(id=>id!==g.id))} onInspect={onInspect}/>)}</div>
  {genes.length>=2&&<LinkagePanel cohort={cohort} genes={genes} markers={selectedSites}/>}
  {genes.length>0&&<details className="prior-import"><summary>{localize("逐材料对照所选位点")}</summary><div className="compare-tools">
  <input aria-label={localize("检索多基因材料")} type="search" placeholder={localize("名录品种名或编号")} value={material} onChange={e=>{setMaterial(e.target.value);setLimit(20);}}/>
  <button onClick={()=>downloadTable(formats.materialMarkers,visibleSamples.map(sampleRow),[...formats.materialMarkers.columns,...siteLabels])}>{localize("导出材料对照 TXT")}</button></div>
  <p>{localize(visibleSamples.length.toLocaleString())}{" "+localize("份材料 · 每个基因显示上方所选位点")}</p><div className="matrix-scroll"><table className="individual-table"><thead><tr><th>{localize("材料")}</th>{siteLabels.map(k=><th key={k}>{localize(k)}</th>)}</tr></thead>
  <tbody>{visibleSamples.slice(0,limit).map(s=><tr key={s.id}><td>{localize(s.id)}<small>{localize(s.name)}</small></td>{selectedSites.map((v,i)=><td key={genes[i].id}>{localize(v?gtToken(callOf(s,v),v):'NA')}</td>)}</tr>)}</tbody></table></div>
  {visibleSamples.length>limit&&<button onClick={()=>setLimit(limit+40)}>{localize("查看更多材料")}</button>}</details>}</section>}
  {records.length>0&&<div className="prior-import"><button aria-expanded={showPrior} onClick={()=>setShowPrior(v=>!v)}>{localize(filename)} · {localize(records.length)}{" "+localize("条先验")+" "}{showPrior?localize("收起"):localize("展开")}</button>{showPrior&&(!priorCalls.ready?<Readiness calls={priorCalls}/>:<><h3>{localize(filename)}</h3><p>{localize(records.length)}{" "+localize("条先验记录 ·")+" "}{localize(results.filter(r=>r.Status==='matched').length)} / {localize(results.length)}{" "+localize("个组分匹配到群体分型")}</p>
  <button onClick={()=>downloadTable(formats.priorResults,contextual(results))}>{localize("导出输入记录及匹配结果")}</button> <button onClick={exportGraph}>{localize("导出先验关系图 JSON-LD")}</button>
  <div className="matrix-scroll"><table className="individual-table"><thead><tr>{['基因','性状与功能','Chr / Position','文献 Hap','匹配 / ALT 频率'].map(s=><th key={s}>{localize(s)}</th>)}</tr></thead><tbody>{results.slice(0,showRows).map((r,i)=><tr key={i}><td>{localize(r.QTG)}</td><td>{localize(r.Trait)} · {localize(r.Function)}</td><td>{localize(r.Chr)} / {localize(r.Position.split(',')[r.Component-1])}</td><td>{localize(r.Hap)}</td><td>{localize(r.Marker?r.Marker+' · '+percent(r.ALT_frequency):({gene_unresolved:'基因身份待核',position_missing:'无坐标',site_unmatched:'位点或 REF 未匹配'}[r.Status]))}{r.Suggestions&&<small>{localize("候选 ·")+" "}{localize(r.Suggestions)}</small>}</td></tr>)}</tbody></table></div>
  {results.length>showRows&&<button onClick={()=>setShowRows(showRows+48)}>{localize("查看更多记录")}</button>}</>)}</div>}
  </section>;
}

function Readiness({calls}){
  const localize = useText();
  return calls.error?<p role="alert">{localize(calls.error)} <button onClick={calls.retry}>{localize("重试")}</button></p>:<p role="status">{localize("正在读取比较基因分型…")}</p>;
}
