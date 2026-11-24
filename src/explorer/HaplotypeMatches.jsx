import {SourceText,useText} from './locale.jsx';
import {readableDefinition} from './provenance.js';
import React, {useMemo, useState} from 'react';
import {DoiLinks} from './AccessionCalls.jsx';
import {literatureDefinitions} from './jointHaplotypes.js';
import {literatureMatches} from './model.js';
import {countReportedAllele,effectDirections,evidenceBasis,claimEvidenceKey,quantitativeEffectText} from './traitEvidence.js';

export function HaplotypeMatches({gene,cohort,evidence,review}) {
  const localize = useText();
  const [open,setOpen]=useState(false);
  const definitions=useMemo(()=>literatureDefinitions(gene,evidence),[gene,evidence]);
  const dois=[...new Set(definitions.flatMap(d=>d.doi))];
  const results=useMemo(()=>open?literatureMatches(gene,definitions,cohort):[],[open,gene,definitions,cohort]);
  const single=useMemo(()=>new Map((review?.claims||[]).filter(c=>c.marker_state).map(c=>[c.marker_state,countReportedAllele(gene,c,evidence,cohort)])),
    [review?.claims,gene,evidence,cohort]);
  const hasReview=Boolean(review?.claims.length||review?.record||review?.loading||review?.error);
  if(!definitions.length&&!hasReview)return null;
  const recordedIds=new Set(definitions.map(d=>d.id));
  const alleleIds=new Set(gene.records.filter(r=>r.mode==='单个位点').map(r=>r.id));
  const matches=new Map(results.map(r=>[r.row.id,r]));
  return <>
  {hasReview&&<section className="reported-effects" aria-label={localize("原文单倍型效应")}>
    <div className="reported-effects-head"><h3>{localize("原文单倍型与等位效应")}</h3><a href="./formats/haplotype-effects.tsv" download="riceflux_haplotype_effects.txt">{localize("下载证据 TXT")}</a><a href="./formats/literature-effect-sizes.tsv" download="riceflux_literature_effect_sizes.txt">{localize("下载文献效应量 TXT")}</a></div>
    {review.error&&<p role="status">{localize("原文证据读取失败 ·")+" "}{localize(review.error)}</p>}
    {review.loading&&<p role="status">{localize("正在读取 V4 原文证据…")}</p>}
    {review.claims.length>0&&<ul>{review.claims.map(claim=>{
      const result=matches.get(claim.definition_id);
      const allele=single.get(claim.marker_state);
      const quantities=claim.quantitativeEffects||[];
      return <li key={claimEvidenceKey(claim)}>
        <div><strong>{localize(claim.label)}</strong>
          {claim.judgment==='favourable'&&<span className="trait-badge literature-positive">{localize("文献优势 · Favourable")}</span>}
          {claim.judgment==='unfavourable'&&<span className="trait-badge literature-negative">{localize("文献较弱 · Unfavourable")}</span>}
          <span className="trait-direction">{localize(claim.trait)} {localize(effectDirections[claim.direction])}</span>
        </div>
        <p><SourceText>{claim.effect}</SourceText></p>
        <small>{localize(evidenceBasis[claim.basis])} · <SourceText>{claim.context}</SourceText>{localize(claim.marker_state&&' · '+claim.marker_state)}{' '}
          {allele?localize(" · 当前同位点纯合匹配 #0# / #1#", [allele.matched, allele.callable]):claim.definition_id&&recordedIds.has(claim.definition_id)?
            (result&&` · 当前群体匹配 ${result.matched??'定义未完整覆盖'}`):
            alleleIds.has(claim.definition_id)?localize(" · 原文单位置等位"):localize(" · 原文等位或组分待完整对应")}
        </small>
        {quantities.length?quantities.map(q=><section className="quantitative-effects" key={JSON.stringify(q)} aria-label={localize("文献效应量")}>
          <p className="effect-size-comparison">{localize(q.comparison)}</p>
          {(q.target||q.control)&&<p>{localize("目标组")+" "}{q.target?`${q.target} ${q.unit}`:localize("未核得")}{" "+localize("· 对照组")+" "}{q.control?`${q.control} ${q.unit}`:localize("未核得")}</p>}
          <dl className="effect-size-grid">
            <div><dt>{localize("绝对差值")}</dt><dd>{localize(quantitativeEffectText(q,'difference'))}</dd></div>
            <div><dt>{localize("相对变化")}</dt><dd>{localize(quantitativeEffectText(q,'relative'))}</dd></div>
          </dl>
          {q.note&&<p>{localize(q.note)}</p>}
          {q.locator&&<p className="claim-source"><a href={'https://doi.org/'+claim.doi} target="_blank" rel="noreferrer">{localize(q.locator)} ↗</a></p>}
        </section>):<p className="footnote">{localize("效应量待核")}</p>}
        {claim.rice6044_context&&<p className="claim-cohort">{localize("6044 实测 ·")+" "}{localize(claim.rice6044_context)}</p>}
        <p className="claim-source"><a href={'https://doi.org/'+claim.doi} target="_blank" rel="noreferrer">{quantities.some(q=>q.locator===claim.locator)?localize("原文 DOI"):localize(claim.locator)} ↗</a><small>{localize(claim.doi)}</small></p>
      </li>;
    })}</ul>}
    {review.record&&<details open={!review.claims.length}>
      <summary>{localize("V4 基因层原文作用")}</summary>
      <p>{localize(review.record['文献主要作用'])}</p>
      <p className="claim-source">{review.record['原始研究'].split(' | ').filter(url=>/^https:\/\//.test(url)).map((url,i)=>
        <a key={url+i} href={url} target="_blank" rel="noreferrer">{localize("原始研究")+" "}{localize(i+1)} ↗</a>)}</p>
    </details>}
  </section>}
  {definitions.length>0&&<details className="site-evidence" onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary>{localize("文献等位与单倍型匹配")}</summary>
    {open&&<><p>{localize("按原文组分核对当前")+" "}{localize(cohort.length.toLocaleString())}{" "+localize("份材料。各位点均纯合且符合文献状态时计入匹配；杂合或缺失保留为未判定。位点质控滑块仅用于上方探索性组合。")}</p>
    <div className="matrix-scroll"><table className="individual-table"><thead><tr><th>{localize("文献型")}</th><th>{localize("有序位点与等位")}</th><th>{localize("纯合匹配")}</th><th>{localize("纯合可判定")}</th><th>{localize("来源")}</th></tr></thead>
    <tbody>{results.map(({row,states,matched,callable})=><tr key={row.id}><td>{localize(readableDefinition(row.label))}</td><td>{localize(states)}<small>{localize(row.components.map(c=>c.pos?.toLocaleString()??'—').join(' · '))}</small></td><td>{matched??localize("未覆盖完整定义")}</td><td>{localize(callable??'—')}</td><td>{localize(row.doi.map(d=>'['+(dois.indexOf(d)+1)+']').join(' '))}</td></tr>)}</tbody></table></div><p>{dois.map((d,i)=><span key={d}>[{localize(i+1)}] <DoiLinks values={[d]} papers={evidence.papers}/> </span>)}</p></>}
  </details>}</>;
}
