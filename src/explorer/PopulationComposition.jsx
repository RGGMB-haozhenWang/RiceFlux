import React,{useState} from 'react';
import {createPortal} from 'react-dom';
export function PopulationComposition({populations,members,counts,total,selectedIds=[]}){
  const [hover,setHover]=useState(null);
  const n=total??members.length;
  const bins=populations.map(p=>({...p,n:counts?counts.get(p.id)||0:members.filter(s=>s.population_id===p.id).length})).filter(p=>p.n>0);
  function show(e,p){const r=e.currentTarget.getBoundingClientRect();setHover({...p,x:Math.min(Math.max(8,r.left),innerWidth-290),y:r.top>100?r.top-82:r.bottom+8});}
  return <div className="group-composition">{bins.map(p=><button type="button" key={p.id} style={{width:100*p.n/n+'%',background:p.color}} aria-label={`${p.name}：${p.n} / ${n} 份，占此组合 ${(100*p.n/n).toFixed(1)}%`} onMouseEnter={e=>show(e,p)} onMouseLeave={()=>setHover(null)} onFocus={e=>show(e,p)} onBlur={()=>setHover(null)} onClick={e=>show(e,p)}/>)}
  {hover&&createPortal(<div role="tooltip" className="population-tooltip" style={{left:hover.x,top:hover.y}}><strong>{hover.name}</strong><span>{hover.n} / {n} 份 · 占此组合 {(100*hover.n/n).toFixed(1)}%</span>{members&&selectedIds.length>0&&<small>其中关注 {members.filter(s=>s.population_id===hover.id&&selectedIds.includes(s.id)).length} 份</small>}</div>,document.body)}</div>;
}
