import {SourceBadges} from './SourceBadges.jsx';
import {datasetCalls,identityFor,readableDefinition} from './provenance.js';
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
  const sources=useMemo(()=>datasetCalls(data,gene,cohort),[data,gene,cohort]),identity=identityFor(data,gene);
  return <section className="panel evidence-panel" id="gene-evidence"><div className="panel-title"><h2>基因与证据 / Provenance</h2><span className="panel-tag">{papers.length} 篇去重文献</span></div>
    <SourceBadges data={data} gene={gene} detail/>
    <p><b>{gene.catalog?.msu||gene.id}</b> · {gene.name} · {gene.catalog?.rap}</p>
    <details><summary>名称与身份复核 / Gene identity</summary><dl className="provenance-grid"><dt>MSU / RAP</dt><dd>{identity?.msu_id||'MSU 待核'} / {identity?.rap_id||'RAP 待核'}</dd><dt>别名 / Aliases</dt><dd>{gene.catalog?.aliases?.join(' · ')}</dd><dt>复核范围 / Scope</dt><dd>{identity?.identity_status} · 已验收先验索引对照，不代表本次重新完成全部原文审核。 / Consistency with the accepted prior.</dd><dt>共享别名 / Shared aliases</dt><dd>{identity?.shared_aliases||'无 / None'}；有共享别名时使用 MSU/RAP ID。</dd></dl>{gene.catalog?.identity&&<a href={gene.catalog.identity} target="_blank" rel="noreferrer">身份来源 / Identity source ↗</a>} · <a href="./annotations/gene_identity.tsv" download>全库名称复核 TSV</a></details>
    <div className="evidence-axes"><span><b>当前位点 / Selected site</b>{selected?.id||'未选择'} · {site?.level||'无位点级文献注释'}</span><span><b>调用质量 / Call quality</b>尚未认证高置信 / HC not certified</span><span><b>育种方向 / Direction</b>未指定 / Unspecified</span></div>
    <h3>数据集 → 位点覆盖 → 调用 / Dataset → Coverage → Calls</h3>
    <div className="matrix-scroll"><table className="individual-table"><thead><tr><th>来源 / Source</th><th>当前材料 / n</th><th>本基因 SNP</th><th>完整材料 / Complete</th><th>含杂合 / Het</th><th>有效等位 / Called alleles</th></tr></thead><tbody>{sources.map(r=><tr key={r.dataset_id}><th><a href={r.source} target="_blank" rel="noreferrer">{r.name}</a><small>{r.version} · {r.genotype_evidence}</small></th><td>{r.samples}</td><td>{r.markers}</td><td>{r.complete}</td><td>{r.heterozygous}</td><td>{r.called} / {r.total}</td></tr>)}</tbody></table></div>
    <p className="footnote">完整材料按该数据集已接入的本基因 SNP 计算，不等于完整功能事件或文献型匹配。G_chip 是旧接口中的观测调用编码；6044 与 RiceNavi 为来源序列分型。未接入 DP/GQ 等逐调用证据，不能据完整率判为 HC。 / Coverage, complete calls, functional matches and call confidence are separate.</p>
    <details><summary>基因功能概述 / Gene context</summary><p>{gene.description||gene.catalog?.function?.[0]}</p><p>Favourable / Un-Favourable 需指定等位状态、目标、背景、环境和对照。 / No universal favourable label is assigned.</p></details>
    <details onToggle={e=>setExpanded(e.currentTarget.open)}><summary>功能事件、位点与文献（{events.length} 条事件）</summary>{expanded&&<>
      <div className="matrix-scroll"><table className="individual-table"><thead><tr>{['事件 / 类型','参考位置与状态','性状 / 来源效应','分型覆盖','引用'].map(s=><th key={s}>{s}</th>)}</tr></thead><tbody>{events.map(e=>{const positions=(e.pos||'').split(',').map(Number),covered=positions.filter(p=>gene.variants.some(v=>v.pos===p)).length;return <tr key={e.key}><td>{readableDefinition(e.label)||e.key}<small>{e.type} · {e.level}</small></td><td>{e.chr} · {e.pos||'NA'}<small>REF {e.ref} → {e.state}</small></td><td>{e.trait||'未单列'}<small>{e.effect||'未单列方向或对照'}</small></td><td>{positions.every(p=>p>0)?`${covered}/${positions.length} 个坐标覆盖；REF/状态匹配见单倍型判型`:'坐标未完整定位'}</td><td>{e.doi.map(d=><a href={'https://doi.org/'+d} target="_blank" rel="noreferrer" key={d}>[{papers.findIndex(p=>p.doi===d)+1}] </a>)}</td></tr>;})}</tbody></table></div>
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
