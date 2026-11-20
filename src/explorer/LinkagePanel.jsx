import React,{useMemo,useState} from 'react';
import {linkageRows} from './analysis.js';
import {alleleNames} from './alleles.js';
import {writeTSV,saveFile} from './formats.js';
export function LinkagePanel({cohort,genes,markers}){
  const [open,setOpen]=useState(false),[limit,setLimit]=useState(30),[pairA,setPairA]=useState(''),[pairB,setPairB]=useState(''),[alts,setAlts]=useState({});
  const bounded=genes.length>12,first=genes.find(g=>g.id===pairA)||genes[0],second=genes.find(g=>g.id===pairB&&g.id!==first?.id)||genes.find(g=>g.id!==first?.id);
  const indices=bounded?[genes.indexOf(first),genes.indexOf(second)]:genes.map((_,i)=>i);
  const selectedAllele=marker=>Math.max(1,alleleNames(marker).indexOf(alts[marker.id]));
  const rows=useMemo(()=>open?linkageRows(cohort,indices.map(i=>genes[i]),indices.map(i=>markers[i]),indices.map(i=>markers[i]?selectedAllele(markers[i]):1)):[],[open,cohort,genes,markers,pairA,pairB,alts]);
  return <details className="joint-secondary" onToggle={e=>setOpen(e.currentTarget.open)}><summary>所选标记的连锁与群体内相关</summary>
    <p className="footnote">r² 按数据集与群体内的完整剂量计算，不代表分相、因果或基因独立。</p>
    {bounded&&<div className="compare-tools"><span>超过 12 个基因时按所选基因对计算：</span><select aria-label="连锁基因 A" value={first?.id} onChange={e=>setPairA(e.target.value)}>{genes.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select><select aria-label="连锁基因 B" value={second?.id} onChange={e=>setPairB(e.target.value)}>{genes.filter(g=>g!==first).map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></div>}
    {open&&<><div className="compare-tools">{indices.filter(i=>markers[i]&&alleleNames(markers[i]).length>2).map(i=>{const m=markers[i];return <label key={genes[i].id}>{genes[i].name} · 剂量 ALT <select value={alleleNames(m)[selectedAllele(m)]} onChange={e=>setAlts({...alts,[m.id]:e.target.value})}>{alleleNames(m).slice(1).map(a=><option key={a}>{a}</option>)}</select></label>;})}<button onClick={()=>saveFile('riceflux_marker_linkage.tsv',writeTSV(['dataset_id','source_group','gene_a','gene_b','marker_a','marker_b','allele_a','allele_b','distance_bp','n','total','missing','maf_a','maf_b','r2','status'],rows),'text/tab-separated-values')}>下载连锁对照 TXT</button></div>
    <div className="matrix-scroll"><table className="individual-table"><thead><tr>{['基因对 / 标记与等位','数据集 / 来源组','距离','完整 n / 总 n','剂量二分类 MAF A / B','剂量 r²'].map(t=><th key={t}>{t}</th>)}</tr></thead><tbody>{rows.slice(0,limit).map((r,i)=><tr key={i}><td>{r.gene_a} × {r.gene_b}<small>{r.marker_a} {r.allele_a} / {r.marker_b} {r.allele_b}</small></td><td>{r.dataset_id} / {r.source_group}</td><td>{r.distance_bp===null?'不同染色体':r.distance_bp.toLocaleString()+' bp'}</td><td>{r.n} / {r.total}</td><td>{[r.maf_a,r.maf_b].map(x=>x===null?'—':x.toFixed(3)).join(' / ')}</td><td>{r.r2===null?({fixed:'固定标记',too_few:'完整样本不足'}[r.status]):r.r2.toFixed(3)}</td></tr>)}</tbody></table></div>{rows.length>limit&&<button onClick={()=>setLimit(n=>n+100)}>展开更多（{rows.length} 行）</button>}</>}
  </details>;
}
