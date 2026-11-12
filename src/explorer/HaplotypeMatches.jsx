import React, {useMemo, useState} from 'react';
import {DoiLinks} from './AccessionCalls.jsx';
import {literatureMatches} from './model.js';

export function HaplotypeMatches({gene,cohort,evidence}) {
  const [open,setOpen]=useState(false);
  const definitions=useMemo(()=>{
    const rows=gene.records.filter(r=>r.mode==='完整多位点型').map(r=>({...r,doi:evidence.events[r.id].doi}));
    if(gene.name==='ALK') {
      const positions=[6752756,6752887,6752888];
      for(const [label,bases] of [['ALKᵃ','AGC'],['ALKᵇ','GTT'],['ALKᶜ','GGC']]) {
        rows.push({id:label,label,doi:['10.1186/s12284-020-00393-5'],
          components:positions.map((pos,i)=>({pos,state:bases[i],ref:['A','G','C'][i]}))});
      }
    }
    return rows;
  },[gene,evidence]);
  const results=useMemo(()=>open?literatureMatches(gene,definitions,cohort):[],[open,gene,definitions,cohort]);
  if(!definitions.length)return null;
  return <details className="site-evidence" onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary>文献单倍型与当前材料的匹配</summary>
    {open&&<><p>按原文组分核对当前 {cohort.length.toLocaleString()} 份材料。各位点均纯合且符合文献状态时计入匹配；杂合或缺失保留为未判定。位点质控滑块仅用于上方探索性组合。</p>
    <div className="matrix-scroll"><table className="individual-table"><thead><tr><th>文献型</th><th>有序状态</th><th>纯合匹配</th><th>纯合可判定</th><th>来源</th></tr></thead>
    <tbody>{results.map(({row,states,matched,callable})=><tr key={row.id}><td>{row.label}</td><td>{states}</td><td>{matched??'未覆盖完整定义'}</td><td>{callable??'—'}</td><td><DoiLinks values={row.doi} papers={evidence.papers}/></td></tr>)}</tbody></table></div></>}
  </details>;
}
