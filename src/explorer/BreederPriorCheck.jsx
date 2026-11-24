import {useText} from './locale.jsx';
import React,{useEffect,useMemo,useState} from 'react';
import {claimEvidenceKey,loadTraitEvidence} from './traitEvidence.js';
import {priorCandidate,priorMaterialMatch,pairedPriorPhenotypes} from './breederPrior.js';
import {useGeneCalls} from './useGeneCalls.js';
import {downloadTable} from './formats.js';

const names={matched:'精确状态匹配',different:'实测状态不同',undefined:'无可匹配的事件定义',uncovered:'未检测定义位点',missing:'调用缺失',heterozygous:'杂合，未判纯合优势型',no_sites:'无分型位点'};
export function BreederPriorCheck({data,axes,samples,models,localCalls,localReadings}){
  const localize = useText();
  const [source,setSource]=useState(null),[error,setError]=useState(''),[selected,setSelected]=useState([]),[locked,setLocked]=useState(null),[limit,setLimit]=useState(60);
  useEffect(()=>{let active=true;loadTraitEvidence(import.meta.env.BASE_URL).then(s=>{if(active)setSource(s);},e=>{if(active)setError(e.message);});return()=>{active=false;};},[]);
  const claims=useMemo(()=>(source?.claims||[]).filter(c=>c.judgment==='favourable'&&(!models.length||models.some(m=>m.gene.id===c.gene_id))),[source,models]);
  const ids=useMemo(()=>[...new Set(claims.map(c=>c.gene_id))],[claims]);
  const status=useGeneCalls(data,ids,Boolean(samples.length&&!localCalls&&ids.length));
  const rows=source&&(localCalls||status.ready)?claims.flatMap(claim=>{
    const gene=data.genes.find(g=>g.id===claim.gene_id);if(!gene)return [];
    return samples.map(sample=>{const match=priorMaterialMatch(sample,gene,claim,data.evidence,typeof localCalls==='function'?localCalls(sample):localCalls),readings=pairedPriorPhenotypes(sample,claim,axes,localReadings?.(sample));
      return {key:sample.id+':'+claimEvidenceKey(claim),sample,gene,claim,match,readings,eligible:priorCandidate(match,sample,readings)};});
  }):[];
  const eligible=rows.filter(r=>r.eligible),chosen=eligible.filter(r=>selected.includes(r.key));
  function snapshot(){setLocked(chosen.map(r=>({sample_id:r.sample.source_sample_id??r.sample.id,dataset:r.sample.dataset_id,gene:r.gene.id,event:r.claim.definition_id||r.claim.marker_state,trait:r.claim.trait_id,doi:r.claim.doi,context:r.claim.context,evidence:r.sample.genotype_evidence,bases:r.match.bases,phenotypes:r.readings.map(p=>({axis:p.axis.key,value:p.value,unit:p.axis.unit,site:p.axis.source.original_site??p.axis.source.site,year:p.axis.source.year,assay:p.axis.assay}))})));}
  return <section className="breeder-card" aria-label={localize("文献优势状态多材料比较")}>
    <h2>{localize("文献优势状态 · 多材料比较")}</h2>
    <p className="breeder-note">{localize("按原文事件、等位状态与 DOI 精确核验；“优势”仅在列出的性状和原文条件成立。区域标记、频率和群体 PAV 汇总不证明个体功能等位。投影或混合分型只供核验。")}</p>
    {error&&<p role="alert">{localize(error)}</p>}
    {!source&& !error&&<p role="status">{localize("正在读取文献优势证据…")}</p>}
    {!localCalls&&!status.ready&&<p role={status.error?'alert':'status'}>{status.error||localize("正在读取定义位点…")}{status.error&&<button onClick={status.retry}>{localize("重试")}</button>}</p>}
    {rows.length>0&&<><p>{localize(new Set(claims.map(c=>c.gene_id)).size)}{" "+localize("个文献优势候选基因 ·")+" "}{localize(new Set(eligible.map(r=>r.gene.id)).size)}{" "+localize("个基因有精确观测匹配且同名性状有实测；实测原值只表示同材料有该性状记录，尚未验证原文效应方向或测定方法一致性。")}</p>
      <div className="matrix-scroll"><table className="individual-table"><thead><tr><th>{localize("暂存候选")}</th><th>{localize("材料 / 来源")}</th><th>{localize("基因 / 原文优势状态")}</th><th>{localize("核验 / 分型来源")}</th><th>{localize("性状、条件与原文")}</th><th>{localize("同名性状有实测 / 测定条件")}</th></tr></thead>
        <tbody>{rows.slice(0,limit).map(r=><tr key={r.key}><td><input type="checkbox" aria-label={localize('候选 '+r.sample.name+' '+r.claim.label)} disabled={!r.eligible||!!locked} checked={selected.includes(r.key)} onChange={e=>setSelected(s=>e.target.checked?[...s,r.key]:s.filter(k=>k!==r.key))}/></td>
          <th scope="row">{localize(r.sample.name)}<small>{localize(r.sample.source_sample_id??r.sample.id)} · {localize(r.sample.dataset_id)}</small></th>
          <td>{localize(r.gene.name)}<small>{localize(r.claim.label)} · {r.claim.definition_id||r.claim.marker_state||localize("未定位事件")}</small></td>
          <td>{localize(names[r.match.status]||r.match.status)}<small>{localize(r.match.bases||'—')} · {localize(r.sample.genotype_evidence)}</small></td>
          <td>{localize(r.claim.trait)} · {localize(r.claim.effect)}<small>{localize(r.claim.context)}</small><a href={'https://doi.org/'+r.claim.doi} target="_blank" rel="noreferrer">{localize("原文 ·")+" "}{localize(r.claim.locator)}</a></td>
          <td>{r.readings.length?r.readings.map(p=><small key={p.axis.key}>{localize(p.value)} {localize(p.axis.unit)} · {localize([p.axis.source.original_site??p.axis.source.site,p.axis.source.year,p.axis.assay].filter(Boolean).join(' · '))}</small>):'无同数据集、同性状的配对定量实测；待补测'}</td>
        </tr>)}</tbody></table></div>
      {rows.length>limit&&<button type="button" className="review-link" onClick={()=>setLimit(n=>n+60)}>{localize("更多核验记录（已显示")+" "}{localize(Math.min(limit,rows.length))} / {localize(rows.length)}）</button>}
      <button type="button" className="review-link" onClick={()=>downloadTable({filename:'riceflux_material_prior_comparison.txt',columns:['sample_id','dataset','gene','event','status','bases','evidence','trait','preference','context','doi','phenotypes','eligible']},rows.map(r=>({sample_id:r.sample.source_sample_id??r.sample.id,dataset:r.sample.dataset_id,gene:r.gene.id,event:r.claim.definition_id||r.claim.marker_state,status:r.match.status,bases:r.match.bases,evidence:r.sample.genotype_evidence,trait:r.claim.trait_id,preference:r.claim.effect,context:r.claim.context,doi:r.claim.doi,phenotypes:JSON.stringify(r.readings.map(p=>({value:p.value,unit:p.axis.unit,axis:p.axis.key,site:p.axis.source.original_site??p.axis.source.site,year:p.axis.source.year,assay:p.axis.assay}))),eligible:r.eligible}))) }>{localize("下载全部比较记录")}</button>
      </>}
    {source&&(localCalls||status.ready)&&!eligible.length&&<p role="status">{localize("暂无可锁定候选。需精确观测到原文优势状态，且存在同材料、同性状实测；缺测、代理和 PAV 汇总均保留为待核验。")}</p>}
    {!locked?<button type="button" disabled={!chosen.length} onClick={snapshot}>{localize("锁定所选证据清单（")}{localize(chosen.length)}）</button>:<div><p>{localize("已锁定")+" "}{localize(locked.length)}{" "+localize("条证据快照。请结合当前目标阈值和试验条件复核；不自动推荐亲本或推断产量增益。")}</p><button type="button" onClick={()=>downloadTable({filename:'riceflux_locked_candidates.txt',columns:['sample_id','dataset','gene','event','trait','doi','context','evidence','bases','phenotypes']},locked.map(r=>({...r,phenotypes:JSON.stringify(r.phenotypes)})))}>{localize("下载锁定清单")}</button> <button type="button" onClick={()=>{setLocked(null);setSelected([]);}}>{localize("重新选择")}</button></div>}
  </section>;
}
