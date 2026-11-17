import {readableDefinition} from './provenance.js';
import React, {useMemo, useState} from 'react';
import {DoiLinks} from './AccessionCalls.jsx';
import {literatureDefinitions} from './jointHaplotypes.js';
import {literatureMatches} from './model.js';

export function HaplotypeMatches({gene,cohort,evidence}) {
  const [open,setOpen]=useState(false);
  const definitions=useMemo(()=>literatureDefinitions(gene,evidence),[gene,evidence]);
  const dois=[...new Set(definitions.flatMap(d=>d.doi))];
  const results=useMemo(()=>open?literatureMatches(gene,definitions,cohort):[],[open,gene,definitions,cohort]);
  if(!definitions.length)return null;
  return <details className="site-evidence" onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary>文献等位与单倍型匹配</summary>
    {open&&<><p>按原文组分核对当前 {cohort.length.toLocaleString()} 份材料。各位点均纯合且符合文献状态时计入匹配；杂合或缺失保留为未判定。位点质控滑块仅用于上方探索性组合。</p>
    <div className="matrix-scroll"><table className="individual-table"><thead><tr><th>文献型</th><th>有序状态</th><th>纯合匹配</th><th>纯合可判定</th><th>来源</th></tr></thead>
    <tbody>{results.map(({row,states,matched,callable})=><tr key={row.id}><td>{readableDefinition(row.label)}</td><td>{states}</td><td>{matched??'未覆盖完整定义'}</td><td>{callable??'—'}</td><td>{row.doi.map(d=>'['+(dois.indexOf(d)+1)+']').join(' ')}</td></tr>)}</tbody></table></div><p>{dois.map((d,i)=><span key={d}>[{i+1}] <DoiLinks values={[d]} papers={evidence.papers}/> </span>)}</p></>}
  </details>;
}
