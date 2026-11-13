import {JointPanel} from './JointPanel.jsx';
import React,{useEffect,useMemo,useState} from 'react';
import {GenomeTrack} from './GenomeTrack.jsx';
import {callOf} from './catalog.js';
import {nameLabel} from './names.js';
import {alleleStats,percent,gtToken} from './model.js';
import {columns,readPrior,writeTSV,resolvePrior,matchMarker,saveFile} from './exchange.js';

const resultColumns=[...columns,'Component','Matched_gene','Marker','Status','N_samples','REF_copies','ALT_copies','Called_copies','ALT_frequency'];
function compareRecords(records,data,cohort){
  return records.flatMap(record=>{
    const gene=resolvePrior(record,data.genes);
    return record.sites.map((site,i)=>{
      const marker=matchMarker(gene,record,site);
      const stats=marker?alleleStats(cohort,marker):null;
      return {...record.row,Component:i+1,Matched_gene:gene?.id,Marker:marker?.id,Status:marker?'matched':!gene?'gene_unresolved':!site.pos?'position_missing':'site_unmatched',N_samples:cohort.length,REF_copies:stats?.ref,ALT_copies:stats?.alt,Called_copies:stats?.called,ALT_frequency:stats?.af};
    });
  });
}
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
  function add(id){if(id)setIds(previous=>previous.includes(id)?previous:[...previous,id]);}
  const available=data.genes.filter(g=>!g.catalog?.historical && !ids.includes(g.id) && [g.id,g.name,g.catalog?.msu,...g.catalog?.aliases||[]].join(' ').toLowerCase().includes(filter.toLowerCase()));
  const selected=available.some(g=>g.id===choice)?choice:available[0]?.id||'';
  const genes=useMemo(()=>ids.map(id=>data.genes.find(g=>g.id===id)).filter(Boolean),[ids,data.genes]);
  const selectedSites=genes.map(g=>g.variants.find(v=>v.id===markerIds[g.id])||g.variants[0]);
  const sampleFields=['accession_id','original_name','name_zh','name_status','material_type','source_group'];
  const siteLabels=genes.map((g,i)=>g.name+'|'+(selectedSites[i]?.id||'NA'));
  function sampleRow(s) {
    const row={accession_id:s.id,original_name:s.name,name_zh:s.name_zh,name_status:s.name_status,material_type:s.kind,source_group:s.population_id};
    selectedSites.forEach((v,i)=>row[siteLabels[i]]=v?gtToken(callOf(s,v),v):'NA');
    return row;
  }
  const visibleSamples=open&&genes.length?cohort.filter(s=>[s.id,s.name,s.name_zh||''].some(v=>v.toLowerCase().includes(material.trim().toLowerCase()))):[];
  function install(parsed,name){
    setRecords(parsed);setFilename(name);setShowRows(24);setError('');
    setIds([...new Set(parsed.map(r=>resolvePrior(r,data.genes)?.id).filter(Boolean))]);setOpen(true);
  }
  useEffect(()=>{if(data.deploymentPrior)install(data.deploymentPrior,'服务器先验表');},[data]);
  const results=useMemo(()=>records.length?compareRecords(records,data,cohort):[],[records,data,cohort]);
  function exportComparison(){
    const rows=genes.flatMap(g=>{
      const base={QTG:g.name,Trait:g.prior,Function:g.description,MSU_ID:g.catalog?.msu,Chr:g.chromosome};
      if(!g.variants.length)return [{...base,Matched_gene:g.id,Status:'no_typed_site',N_samples:cohort.length}];
      return g.variants.map(v=>{const s=alleleStats(cohort,v);return {...base,Position:v.pos,Ref:v.ref,Component:1,Matched_gene:g.id,Marker:v.id,Status:'typed',N_samples:cohort.length,REF_copies:s.ref,ALT_copies:s.alt,Called_copies:s.called,ALT_frequency:s.af};});
    });
    saveFile('riceflux_comparison.tsv',writeTSV(resultColumns,rows));
  }
  async function upload(event){
    const file=event.target.files[0];event.target.value='';if(!file)return;
    try{install(readPrior(await file.text()),file.name);}catch(e){setError(e.message);}
  }
  return <section className="panel compare-panel"><div className="panel-title"><div><h2>多基因比较</h2><p>按材料合并各基因的单倍型，查看组合频率、来源群体和成员。</p></div>
  <button aria-expanded={open} onClick={()=>{if(!open&&!ids.length&&!records.length){
    const example=data.genes.find(g=>g.name===(activeGene.name==='ALK'?'DTH7':'ALK'));
    setIds([activeGene.id,...(example&&activeGene.id!==example.id?[example.id]:[])]);
  }setOpen(!open);}}>{open?'收起比较':'打开比较'}</button></div>
  {open&&<><div className="compare-tools"><input aria-label="搜索比较基因" type="search" placeholder="基因名或基因编号" value={filter} onChange={e=>setFilter(e.target.value)}/>
  <select aria-label="选择比较基因" value={selected} onChange={e=>setChoice(e.target.value)}>{!available.length&&<option value="">无匹配基因</option>}{available.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select>
  <button disabled={!selected} onClick={()=>add(selected)}>加入比较</button><label className="file-button">导入八列 TSV<input aria-label="导入八列 TSV" type="file" accept=".tsv,.txt" onChange={upload}/></label>
  <a href="./formats/prior.tsv" download>样表</a><a href="./formats/README.txt" target="_blank" rel="noreferrer">格式与部署</a>
  </div>
  {error&&<p role="alert">{error}</p>}<p>{genes.length} 个基因 · 当前 {cohort.length.toLocaleString()} 份材料</p>
  {genes.length>0&&<div className="compare-tools joint-chips">{genes.map(g=><button key={g.id} aria-label={'从组合移除 '+g.name} onClick={()=>setIds(previous=>previous.filter(id=>id!==g.id))}>{g.name} ×</button>)}</div>}
  {genes.length>=2?<JointPanel key={JSON.stringify(ids)} data={data} genes={genes} cohort={cohort} records={records}/>:<p>请选择至少两个基因查看跨基因组合。</p>}
  {genes.length>0&&<details className="joint-secondary"><summary>基因位置与单个位点对照</summary><button onClick={exportComparison}>导出位点比较 TSV</button>
  <div className="comparison-grid">{genes.map(g=><CompareGene key={g.id} gene={g} cohort={cohort} markerId={markerIds[g.id]} setMarker={id=>setMarkerIds(prev=>({...prev,[g.id]:id}))} onRemove={()=>setIds(ids.filter(id=>id!==g.id))}/>)}</div>
  {genes.length>0&&<details className="prior-import"><summary>逐材料对照所选位点</summary><div className="compare-tools">
  <input aria-label="检索多基因材料" type="search" placeholder="中文名、原名或编号" value={material} onChange={e=>{setMaterial(e.target.value);setLimit(20);}}/>
  <button onClick={()=>saveFile('riceflux_material_genotypes.tsv',writeTSV([...sampleFields,...siteLabels],visibleSamples.map(sampleRow)))}>导出材料对照 TSV</button></div>
  <p>{visibleSamples.length.toLocaleString()} 份材料 · 每个基因显示上方所选位点</p><div className="matrix-scroll"><table className="individual-table"><thead><tr><th>材料</th>{siteLabels.map(k=><th key={k}>{k}</th>)}</tr></thead>
  <tbody>{visibleSamples.slice(0,limit).map(s=><tr key={s.id}><td>{s.id}<small>{nameLabel(s)}</small></td>{selectedSites.map((v,i)=><td key={genes[i].id}>{v?gtToken(callOf(s,v),v):'NA'}</td>)}</tr>)}</tbody></table></div>
  {visibleSamples.length>limit&&<button onClick={()=>setLimit(limit+40)}>查看更多材料</button>}</details>}</details>}
  {records.length>0&&<div className="prior-import"><h3>{filename}</h3><p>{records.length} 条先验记录 · {results.filter(r=>r.Status==='matched').length} / {results.length} 个组分匹配到群体分型</p>
  <button onClick={()=>saveFile('riceflux_prior_results.tsv',writeTSV(resultColumns,results))}>导出输入记录及匹配结果</button>
  <div className="matrix-scroll"><table className="individual-table"><thead><tr>{['基因','性状与功能','Chr / Position','文献 Hap','匹配 / ALT 频率'].map(s=><th key={s}>{s}</th>)}</tr></thead><tbody>{results.slice(0,showRows).map((r,i)=><tr key={i}><td>{r.QTG}</td><td>{r.Trait} · {r.Function}</td><td>{r.Chr} / {r.Position.split(',')[r.Component-1]}</td><td>{r.Hap}</td><td>{r.Marker?r.Marker+' · '+percent(r.ALT_frequency):({gene_unresolved:'基因身份待核',position_missing:'无坐标',site_unmatched:'位点或 REF 未匹配'}[r.Status])}</td></tr>)}</tbody></table></div>
  {results.length>showRows&&<button onClick={()=>setShowRows(showRows+48)}>查看更多记录</button>}</div>}</>}
  </section>;
}
