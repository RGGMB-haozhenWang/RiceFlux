import React,{useMemo,useState} from 'react';
import {evidenceRows,eventRows} from './evidence.js';
import {phenotypeAxes,stateSummary} from './analysis.js';
import {saveFile,writeTSV} from './formats.js';
export function EvidencePanel({data,gene,cohort,selected}){
  const [expanded,setExpanded]=useState(false),[env,setEnv]=useState(''),[modern,setModern]=useState(true);
  const papers=useMemo(()=>evidenceRows(gene,data.evidence,data.literature),[gene,data]);
  const events=useMemo(()=>eventRows(gene),[gene]);
  const axes=phenotypeAxes(data).filter(e=>gene.trait_ids.includes(e.trait_id)),active=axes.find(e=>e.id===env)||axes[0];
  const reviewCohort=cohort.filter(s=>!modern||s.kind==='modern cultivar');
  const strata=[...new Set(reviewCohort.map(s=>JSON.stringify([s.dataset_id,s.subspecies,s.source_group||s.population_id])))];
  const review=active&&selected?strata.flatMap(key=>{const [dataset,subspecies,source_group]=JSON.parse(key);return stateSummary(reviewCohort.filter(s=>JSON.stringify([s.dataset_id,s.subspecies,s.source_group||s.population_id])===key),selected,active.id).map(r=>({dataset,subspecies,source_group,...r}));}):[];
  const site=selected&&data.evidence.sites[selected.id];
  return <section className="panel evidence-panel" id="gene-evidence"><div className="panel-title"><h2>基因与证据</h2><span className="panel-tag">{papers.length} 篇去重文献</span></div>
    <p><b>{gene.catalog?.msu||gene.id}</b> · {gene.name} · {gene.catalog?.rap} {gene.catalog?.identity&&<a href={gene.catalog.identity} target="_blank" rel="noreferrer">身份来源 ↗</a>}</p>
    <p>{gene.description||gene.catalog?.function?.[0]}</p>
    <div className="evidence-axes"><span><b>文献证据</b>{site?.level||'当前位点未建立功能证据'}</span><span><b>分型来源</b>{data.meta.genotype_evidence} · 覆盖见定义表</span><span><b>有利 / 不利</b>未指定育种目标 · 不作全局判定</span></div>
    <p className="footnote">Favourable / Un-Favourable 限定为“等位状态 × 目标性状 × 背景 × 环境 × 对照”。文献方向、群体统计和直接验证分别记录；完整调用不自动成为高置信功能判型。</p>
    <details onToggle={e=>setExpanded(e.currentTarget.open)}><summary>功能事件、位点与文献（{events.length} 条事件）</summary>{expanded&&<>
      <div className="matrix-scroll"><table className="individual-table"><thead><tr>{['事件 / 类型','参考位置与状态','性状 / 来源效应','分型覆盖','引用'].map(s=><th key={s}>{s}</th>)}</tr></thead><tbody>{events.map(e=>{const positions=(e.pos||'').split(',').map(Number),covered=positions.filter(p=>gene.variants.some(v=>v.pos===p)).length;return <tr key={e.key}><td>{e.label||e.key}<small>{e.type} · {e.level}</small></td><td>{e.chr} · {e.pos||'NA'}<small>REF {e.ref} → {e.state}</small></td><td>{e.trait||'未单列'}<small>{e.effect||'未单列方向或对照'}</small></td><td>{positions.every(p=>p>0)?`${covered}/${positions.length} 个坐标覆盖；REF/状态匹配见单倍型判型`:'坐标未完整定位'}</td><td>{e.doi.map(d=><a href={'https://doi.org/'+d} target="_blank" rel="noreferrer" key={d}>[{papers.findIndex(p=>p.doi===d)+1}] </a>)}</td></tr>;})}</tbody></table></div>
      <ol className="paper-list">{papers.map(p=><li key={p.doi}><a href={'https://doi.org/'+p.doi} target="_blank" rel="noreferrer">{p.doi}</a><p>{p.summary||p.title||'原文摘要尚未整理'}</p><small>{p.roles}</small></li>)}</ol>
      <button onClick={()=>saveFile('riceflux_'+gene.id+'_literature.tsv',writeTSV(['doi','title','summary','roles','event_ids','markers'],papers),'text/tab-separated-values')}>下载去重文献 TSV</button>
    </>}</details>
    <details><summary>群体内复核 · 当前位点的原始表型</summary><div className="compare-tools"><label><input type="checkbox" checked={modern} onChange={e=>setModern(e.target.checked)}/>仅现代品种</label><select aria-label="证据复核环境" value={active?.id||''} onChange={e=>setEnv(e.target.value)}><option value="" disabled>选择实测环境</option>{axes.map(e=><option key={e.id} value={e.id}>{e.label}</option>)}</select></div>
      <p className="footnote">{selected?.id||'无可用位点'} · 按数据集、亚群与来源组分层。均值差为描述性关联，未校正亲缘或群体内结构；未把来源文献的方向扩展为该位点的因果效应。</p>
      {review.length?<><div className="matrix-scroll"><table className="individual-table"><thead><tr><th>数据集 / 亚群 / 来源组</th><th>分型</th><th>有效 n</th><th>原始均值 · {active.unit}</th></tr></thead><tbody>{review.map((r,i)=><tr key={i}><td>{r.dataset} / {r.subspecies} / {r.source_group}</td><td>{r.dosage===0?selected.ref+'/'+selected.ref:r.dosage===2?selected.alt+'/'+selected.alt:selected.ref+'/'+selected.alt}</td><td>{r.n}</td><td>{r.mean===null?'不可估计':r.mean.toFixed(3)}</td></tr>)}</tbody></table></div><button onClick={()=>saveFile('riceflux_population_review.tsv',writeTSV(['dataset','subspecies','source_group','marker','environment','unit','modern_only','dosage','n','mean','interpretation'],review.map(r=>({...r,marker:selected.id,environment:active.id,unit:active.unit,modern_only:modern,interpretation:'descriptive_association_only'}))),'text/tab-separated-values')}>下载分层复核 TSV</button></>:<p>当前位点或对应性状缺少可用的配对数据。</p>}
      <p><a href="./prior/primary_contrasts.tsv" download>已完成的原 2,347 份现代籼稻模型结果（23 个预定对照）</a></p>
    </details>
    <details><summary>性状标准与外部本体</summary><p>性状采用 Crop Ontology 的 Trait–Method–Scale 模型；试验地点、年份和时期独立记录。TO 提供跨作物性状概念，GO 注释基因产物的功能、过程和细胞组分。外部术语未核验时保留本地稳定 ID，不自动映射。</p><a href="./formats/traits.tsv" download>性状注册表 TSV</a> · <a href="./formats/ontology.txt" target="_blank" rel="noreferrer">接入规范</a></details>
  </section>;
}
