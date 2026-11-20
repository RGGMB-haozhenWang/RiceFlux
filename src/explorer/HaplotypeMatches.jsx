import {readableDefinition} from './provenance.js';
import React, {useMemo, useState} from 'react';
import {DoiLinks} from './AccessionCalls.jsx';
import {literatureDefinitions} from './jointHaplotypes.js';
import {literatureMatches} from './model.js';
import {countReportedAllele,effectDirections,evidenceBasis} from './traitEvidence.js';

export function HaplotypeMatches({gene,cohort,evidence,review}) {
  const [open,setOpen]=useState(false);
  const definitions=useMemo(()=>literatureDefinitions(gene,evidence),[gene,evidence]);
  const dois=[...new Set(definitions.flatMap(d=>d.doi))];
  const results=useMemo(()=>open?literatureMatches(gene,definitions,cohort):[],[open,gene,definitions,cohort]);
  const single=useMemo(()=>new Map((review?.claims||[]).filter(c=>c.marker_state).map(c=>[c.marker_state,countReportedAllele(gene,c,evidence,cohort)])),
    [review?.claims,gene,evidence,cohort]);
  if(!definitions.length&&!review)return null;
  const recordedIds=new Set(definitions.map(d=>d.id));
  const alleleIds=new Set(gene.records.filter(r=>r.mode==='单个位点').map(r=>r.id));
  const matches=new Map(results.map(r=>[r.row.id,r]));
  return <>
  {review&&<section className="reported-effects" aria-label="原文单倍型效应">
    <div className="reported-effects-head"><h3>原文单倍型与等位效应</h3><a href="./formats/haplotype-effects.tsv" download="riceflux_haplotype_effects.txt">下载证据 TXT</a></div>
    {review.error&&<p role="status">原文证据读取失败 · {review.error}</p>}
    {review.loading&&<p role="status">正在读取 V4 原文证据…</p>}
    {review.claims.length>0&&<ul>{review.claims.map(claim=>{
      const result=matches.get(claim.definition_id);
      const allele=single.get(claim.marker_state);
      return <li key={claim.definition_id+claim.label+claim.trait_id}>
        <div><strong>{claim.label}</strong>
          {claim.judgment==='favourable'&&<span className="trait-badge literature-positive">文献优势 · Favourable</span>}
          {claim.judgment==='unfavourable'&&<span className="trait-badge literature-negative">文献较弱 · Unfavourable</span>}
          <span className="trait-direction">{claim.trait} {effectDirections[claim.direction]}</span>
        </div>
        <p>{claim.effect}</p>
        <small>{evidenceBasis[claim.basis]} · {claim.context}{' '}
          {allele?` · 当前同位点纯合匹配 ${allele.matched} / ${allele.callable}`:claim.definition_id&&recordedIds.has(claim.definition_id)?
            (result&&` · 当前群体匹配 ${result.matched??'定义未完整覆盖'}`):
            alleleIds.has(claim.definition_id)?' · 原文单位置等位':' · 原文等位或组分待完整对应'}
        </small>
        <p className="claim-source"><a href={'https://doi.org/'+claim.doi} target="_blank" rel="noreferrer">{claim.locator} ↗</a><small>{claim.doi}</small></p>
      </li>;
    })}</ul>}
    {review.record&&<details open={!review.claims.length}>
      <summary>V4 基因层原文作用</summary>
      <p>{review.record['文献主要作用']}</p>
      <p className="claim-source">{review.record['原始研究'].split(' | ').filter(url=>/^https:\/\//.test(url)).map((url,i)=>
        <a key={url+i} href={url} target="_blank" rel="noreferrer">原始研究 {i+1} ↗</a>)}</p>
    </details>}
  </section>}
  {definitions.length>0&&<details className="site-evidence" onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary>文献等位与单倍型匹配</summary>
    {open&&<><p>按原文组分核对当前 {cohort.length.toLocaleString()} 份材料。各位点均纯合且符合文献状态时计入匹配；杂合或缺失保留为未判定。位点质控滑块仅用于上方探索性组合。</p>
    <div className="matrix-scroll"><table className="individual-table"><thead><tr><th>文献型</th><th>有序状态</th><th>纯合匹配</th><th>纯合可判定</th><th>来源</th></tr></thead>
    <tbody>{results.map(({row,states,matched,callable})=><tr key={row.id}><td>{readableDefinition(row.label)}</td><td>{states}</td><td>{matched??'未覆盖完整定义'}</td><td>{callable??'—'}</td><td>{row.doi.map(d=>'['+(dois.indexOf(d)+1)+']').join(' ')}</td></tr>)}</tbody></table></div><p>{dois.map((d,i)=><span key={d}>[{i+1}] <DoiLinks values={[d]} papers={evidence.papers}/> </span>)}</p></>}
  </details>}</>;
}
