import {JointPanel} from './JointPanel.jsx';
import React,{useEffect,useMemo,useState} from 'react';
import {GenomeTrack} from './GenomeTrack.jsx';
import {callOf} from './catalog.js';
import {formats,downloadTable,saveFile,matchesMaterial,materialRow} from './formats.js';
import {alleleStats,percent,gtToken} from './model.js';
import {readPrior,bindPrior,priorResults,comparisonResults,priorGraph} from './exchange.js';

function CompareGene({gene,cohort,onRemove,markerId,setMarker}){
  const v=gene.variants.find(v=>v.id===markerId)||gene.variants[0];
  const stats=useMemo(()=>v?alleleStats(cohort,v):null,[v,cohort]);
  return <article className="comp-gene"><header><strong>{gene.name}</strong><button onClick={onRemove} aria-label={'移除 '+gene.name}>移除</button></header>
    <p>{[gene.catalog?.msu||gene.id,gene.model?gene.chromosome+' '+gene.gene_start.toLocaleString()+'–'+gene.gene_end.toLocaleString()+' bp':'基因模型待定位'].join(' · ')}</p>
    {gene.model&&<GenomeTrack gene={gene} variants={gene.variants} selected={v} onSelect={setMarker}/>}
    {v?<><label>查看位点 <select value={v.id} onChange={e=>setMarker(e.target.value)}>{gene.variants.map(m=><option key={m.id}>{m.id}</option>)}</select></label>
    <p>{v.ref} → {v.alt??'—'} · ALT {stats.alt} / {stats.called} 个已检出拷贝（{percent(stats.af)}） · {v.classified||'广义文献位点'}</p></>:<p>当前没有可比较的实测位点。</p>}
  </article>;
}

export function ComparePanel({data,activeGene,cohort}){
  const [open,setOpen]=useState(false),[ids,setIds]=useState([]),[choice,setChoice]=useState(''),[filter,setFilter]=useState('');
  const [markerIds,setMarkerIds]=useState({}),[material,setMaterial]=useState(''),[limit,setLimit]=useState(20);
  const [records,setRecords]=useState([]),[filename,setFilename]=useState(''),[error,setError]=useState('');
  const [showRows,setShowRows]=useState(24);
  const bundledLibrary=data.deploymentPriorFile==='formats/prior_477.tsv';
  function add(id){if(id)setIds(previous=>previous.includes(id)?previous:[...previous,id]);}
  const available=data.genes.filter(g=>!g.catalog?.historical && !ids.includes(g.id) && [g.id,g.name,g.catalog?.msu,...g.catalog?.aliases||[]].join(' ').toLowerCase().includes(filter.toLowerCase()));
  const selected=available.some(g=>g.id===choice)?choice:available[0]?.id||'';
  const genes=useMemo(()=>ids.map(id=>data.genes.find(g=>g.id===id)).filter(Boolean),[ids,data.genes]);
  const selectedSites=genes.map(g=>g.variants.find(v=>v.id===markerIds[g.id])||g.variants[0]);
  const siteLabels=genes.map((g,i)=>g.name+'|'+(selectedSites[i]?.id||'NA'));
  function sampleRow(s) {
    const row=materialRow(s);
    selectedSites.forEach((v,i)=>row[siteLabels[i]]=v?gtToken(callOf(s,v),v):'NA');
    return row;
  }
  const visibleSamples=open&&genes.length?cohort.filter(s=>matchesMaterial(s,material)):[];
  function install(parsed,name,selectGenes=true){
    const bound=bindPrior(parsed,data.genes);
    setRecords(bound);setFilename(name);setShowRows(24);setError('');
    if(selectGenes){
      setIds([...new Set(bound.map(r=>r.gene?.id).filter(Boolean))]);setOpen(true);
    }
  }
  useEffect(()=>{if(data.deploymentPrior)install(data.deploymentPrior,data.deploymentPriorFile.split('/').at(-1),data.compareOnLoad);},[data]);
  const results=useMemo(()=>open&&records.length?priorResults(records,cohort,data.evidence):[],[open,records,data,cohort]);
  function exportComparison(){
    downloadTable(formats.siteComparison,comparisonResults(genes,cohort,data.evidence));
  }
  function exportGraph(){
    const graph=priorGraph(records,results,filename,cohort);
    saveFile(formats.priorGraph.filename,JSON.stringify(graph,null,2),'application/ld+json');
  }
  async function upload(event){
    const file=event.target.files[0];event.target.value='';if(!file)return;
    try{install(readPrior(await file.text()),file.name);}catch(e){setError(e.message);}
  }
  return <section className="panel compare-panel"><div className="panel-title"><div><h2>多基因比较</h2><p>按材料合并各基因的单倍型，查看组合频率、来源群体和成员。</p></div>
  <button aria-expanded={open} onClick={()=>{if(!open&&!ids.length&&(!records.length||(!data.compareOnLoad&&filename===data.deploymentPriorFile?.split('/').at(-1)))){
    const example=data.genes.find(g=>g.name===(activeGene.name==='ALK'?'DTH7':'ALK'));
    setIds([activeGene.id,...(example&&activeGene.id!==example.id?[example.id]:[])]);
  }setOpen(!open);}}>{open?'收起比较':'打开比较'}</button></div>
  {open&&<><div className="compare-tools"><input aria-label="搜索比较基因" type="search" placeholder="基因名或基因编号" value={filter} onChange={e=>setFilter(e.target.value)}/>
  <select aria-label="选择比较基因" value={selected} onChange={e=>setChoice(e.target.value)}>{!available.length&&<option value="">无匹配基因</option>}{available.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select>
  <button disabled={!selected} onClick={()=>add(selected)}>加入比较</button><label className="file-button">导入八列 TSV<input aria-label="导入八列 TSV" type="file" accept=".tsv,.txt" onChange={upload}/></label>
  <a href="./formats/prior.tsv" download>样表</a><a href="./formats/README.txt" target="_blank" rel="noreferrer">格式与部署</a><a href="./formats/exchange.json" download>输入输出本体</a>
  {bundledLibrary&&<><a href="./formats/prior_477.tsv" download>477 基因全库 TSV</a><a href="./formats/gene_index.tsv" download>逐基因索引</a><a href="./formats/riceflux_prior_477.zip" download>完整输入包 ZIP</a></>}
  </div>
  {error&&<p role="alert">{error}</p>}<p>{genes.length} 个基因 · 当前 {cohort.length.toLocaleString()} 份材料</p>
  {genes.length>0&&<div className="compare-tools joint-chips">{genes.map(g=><button key={g.id} aria-label={'从组合移除 '+g.name} onClick={()=>setIds(previous=>previous.filter(id=>id!==g.id))}>{g.name} ×</button>)}</div>}
  {genes.length>=2?<JointPanel key={JSON.stringify(ids)} data={data} genes={genes} cohort={cohort} records={records}/>:<p>请选择至少两个基因查看跨基因组合。</p>}
  {genes.length>0&&<details className="joint-secondary"><summary>基因位置与单个位点对照</summary><button onClick={exportComparison}>导出位点比较 TSV</button>
  <div className="comparison-grid">{genes.map(g=><CompareGene key={g.id} gene={g} cohort={cohort} markerId={markerIds[g.id]} setMarker={id=>setMarkerIds(prev=>({...prev,[g.id]:id}))} onRemove={()=>setIds(ids.filter(id=>id!==g.id))}/>)}</div>
  {genes.length>0&&<details className="prior-import"><summary>逐材料对照所选位点</summary><div className="compare-tools">
  <input aria-label="检索多基因材料" type="search" placeholder="名录品种名或编号" value={material} onChange={e=>{setMaterial(e.target.value);setLimit(20);}}/>
  <button onClick={()=>downloadTable(formats.materialMarkers,visibleSamples.map(sampleRow),[...formats.materialMarkers.columns,...siteLabels])}>导出材料对照 TSV</button></div>
  <p>{visibleSamples.length.toLocaleString()} 份材料 · 每个基因显示上方所选位点</p><div className="matrix-scroll"><table className="individual-table"><thead><tr><th>材料</th>{siteLabels.map(k=><th key={k}>{k}</th>)}</tr></thead>
  <tbody>{visibleSamples.slice(0,limit).map(s=><tr key={s.id}><td>{s.id}<small>{s.name}</small></td>{selectedSites.map((v,i)=><td key={genes[i].id}>{v?gtToken(callOf(s,v),v):'NA'}</td>)}</tr>)}</tbody></table></div>
  {visibleSamples.length>limit&&<button onClick={()=>setLimit(limit+40)}>查看更多材料</button>}</details>}</details>}
  {records.length>0&&<div className="prior-import"><h3>{filename}</h3><p>{records.length} 条先验记录 · {results.filter(r=>r.Status==='matched').length} / {results.length} 个组分匹配到群体分型</p>
  <button onClick={()=>downloadTable(formats.priorResults,results)}>导出输入记录及匹配结果</button> <button onClick={exportGraph}>导出先验关系图 JSON-LD</button>
  <div className="matrix-scroll"><table className="individual-table"><thead><tr>{['基因','性状与功能','Chr / Position','文献 Hap','匹配 / ALT 频率'].map(s=><th key={s}>{s}</th>)}</tr></thead><tbody>{results.slice(0,showRows).map((r,i)=><tr key={i}><td>{r.QTG}</td><td>{r.Trait} · {r.Function}</td><td>{r.Chr} / {r.Position.split(',')[r.Component-1]}</td><td>{r.Hap}</td><td>{r.Marker?r.Marker+' · '+percent(r.ALT_frequency):({gene_unresolved:'基因身份待核',position_missing:'无坐标',site_unmatched:'位点或 REF 未匹配'}[r.Status])}</td></tr>)}</tbody></table></div>
  {results.length>showRows&&<button onClick={()=>setShowRows(showRows+48)}>查看更多记录</button>}</div>}</>}
  </section>;
}
