import {SourceBadges} from './SourceBadges.jsx';
import {datasetCalls,identityFor,readableDefinition} from './provenance.js';
import React,{useEffect,useMemo,useState} from 'react';
import {evidenceRows,evidenceColumns,eventRows} from './evidence.js';
import {phenotypeAxes,stateSummary} from './analysis.js';
import {loadAbstracts} from './observed.js';
import {datasetBadge,datasetTint} from './datasetColors.js';
import {saveFile,writeTSV} from './formats.js';
export function EvidencePanel({data,gene,trait,cohort,selected,onInspect}){
  const [expanded,setExpanded]=useState(false),[env,setEnv]=useState(''),[modern,setModern]=useState(true);
  const [abstracts,setAbstracts]=useState(),[abstractError,setAbstractError]=useState('');
  useEffect(()=>{if(!expanded)return;let active=true;loadAbstracts(import.meta.env.BASE_URL).then(a=>{if(active)setAbstracts(a);}).catch(e=>{if(active)setAbstractError(e.message);});return()=>{active=false;};},[expanded]);
  const papers=useMemo(()=>evidenceRows(gene,data.evidence,data.literature,abstracts),[gene,data,abstracts]);
  const events=useMemo(()=>eventRows(gene),[gene]);
  const axes=phenotypeAxes(data).filter(e=>trait.id===e.trait_id),active=axes.find(e=>e.id===env)||axes[0];
  const reviewCohort=cohort.filter(s=>!modern||s.kind==='modern cultivar');
  const strata=[...new Set(reviewCohort.map(s=>JSON.stringify([s.dataset_id,s.subspecies,s.source_group||s.population_id])))];
  const review=active&&selected?strata.flatMap(key=>{const [dataset,subspecies,source_group]=JSON.parse(key);return stateSummary(reviewCohort.filter(s=>JSON.stringify([s.dataset_id,s.subspecies,s.source_group||s.population_id])===key),selected,active.id).map(r=>({dataset,subspecies,source_group,...r}));}):[];
  const site=selected&&data.evidence.sites[selected.id];
  const sources=useMemo(()=>datasetCalls(data,gene,cohort),[data,gene,cohort]),identity=identityFor(data,gene);
  const context=gene.description||gene.catalog?.function?.[0],catalogEntry=gene.catalog?.collection==='cloned_catalog';
  return <section className="panel evidence-panel" id="gene-evidence"><div className="panel-title"><h2>基因与证据 / Provenance</h2><span className="panel-tag">{papers.length} 篇去重文献</span></div>
    <SourceBadges data={data} gene={gene} detail onInspect={onInspect}/>
    <p><b>{gene.catalog?.msu||gene.id}</b> · {gene.name} · {gene.catalog?.rap}</p>
    <details><summary>名称与身份复核 / Gene identity</summary><dl className="provenance-grid"><dt>MSU / RAP</dt><dd>{identity?.msu_id||'MSU 待核'} / {identity?.rap_id||'RAP 待核'}</dd><dt>别名 / Aliases</dt><dd>{gene.catalog?.aliases?.join(' · ')}</dd><dt>复核范围 / Scope</dt><dd>{identity?.identity_status} · {catalogEntry?identity?.review_scope:'已验收先验索引对照。 / Consistency with the accepted prior.'}</dd>{!catalogEntry&&<><dt>共享别名 / Shared aliases</dt><dd>{identity?.shared_aliases||'无 / None'}。有共享别名时使用 MSU/RAP ID。</dd></>}</dl>{gene.catalog?.identity&&<><a href={gene.catalog.identity} target="_blank" rel="noreferrer">身份来源 / Identity source ↗</a> · </>}{catalogEntry?<a href="./datasets/cloned_catalog/manifest.json" target="_blank" rel="noreferrer">扩展目录版本 / Catalog version ↗</a>:<a href="./annotations/gene_identity.tsv" download="gene_identity.txt">原先验身份复核 TXT</a>}</details>
    <div className="evidence-axes"><span><b>当前位点 / Selected site</b>{selected?.id||'未选择'} · {site?.level||'无位点级文献注释'}</span><span><b>调用质量 / Call quality</b>尚未认证高置信 / HC not certified</span></div>
    <h3>数据集 → 位点覆盖 → 调用 / Dataset → Coverage → Calls</h3>
    <div className="matrix-scroll"><table className="individual-table"><thead><tr><th>来源 / Source</th><th>当前材料 / n</th><th>本基因标记</th><th>完整材料 / Complete</th><th>含杂合 / Het</th><th>有效等位 / Called alleles</th></tr></thead><tbody>{sources.map(r=><tr key={r.dataset_id}><th><span className="source-badge dataset-tint" style={datasetTint(r.dataset_id,data.datasetRegistry)}>{datasetBadge(r.dataset_id,data.datasetRegistry)}</span> {/^(?:https?):\/\//i.test(r.source)?<a href={r.source} target="_blank" rel="noreferrer">{r.name}</a>:r.name}<small>{r.version} · {r.genotype_evidence}</small></th><td>{r.samples}</td><td>{r.markers}</td><td>{r.complete}</td><td>{r.heterozygous}</td><td>{r.called} / {r.total}</td></tr>)}</tbody></table></div>
    <p className="footnote">6044 / RiceNavi 为来源序列分型（接口记作 G_chip）；SNP 完整率不代表功能匹配或 HC，逐调用 QC 尚未接入。 / SNP completeness does not establish functional matches or high-confidence calls.</p>
    {context&&<details><summary>基因功能概述 / Gene context</summary><p>{context}</p></details>}
    <details onToggle={e=>setExpanded(e.currentTarget.open)}><summary>功能事件、位点与文献（{events.length} 条事件）</summary>{expanded&&<>
      <div className="matrix-scroll"><table className="individual-table"><thead><tr>{['事件 / 类型','参考位置与状态','性状 / 来源效应','分型覆盖','引用'].map(s=><th key={s}>{s}</th>)}</tr></thead><tbody>{events.map(e=>{const positions=(e.pos||'').split(',').map(Number),covered=positions.filter(p=>gene.variants.some(v=>v.pos===p)).length;return <tr key={e.key}><td>{readableDefinition(e.label)||e.key}<small>{e.type} · {e.level}</small></td><td>{e.chr} · {e.pos||'NA'}<small>REF {e.ref} → {e.state}</small></td><td>{e.trait||'未单列'}<small>{e.effect||'未单列方向或对照'}</small></td><td>{positions.every(p=>p>0)?`${covered}/${positions.length} 个坐标覆盖；REF/状态匹配见单倍型判型`:'坐标未完整定位'}</td><td>{e.doi.map(d=><a href={'https://doi.org/'+d} target="_blank" rel="noreferrer" key={d}>[{papers.findIndex(p=>p.doi===d)+1}] </a>)}</td></tr>;})}</tbody></table></div>
      {abstractError&&<p role="status">摘要目录读取失败：{abstractError}</p>}<ol className="paper-list">{papers.map(p=><li key={p.doi}><a href={'https://doi.org/'+p.doi} target="_blank" rel="noreferrer">{p.doi}</a>{p.title&&<p>{p.title}</p>}{p.summary&&<p className="abstract-excerpt">摘要摘句 / Abstract excerpt · {p.summary} <a href={p.abstract_source} target="_blank" rel="noreferrer">出处</a></p>}<small>{p.roles}</small></li>)}</ol>
      <button disabled={!abstracts&&!abstractError} onClick={()=>saveFile('riceflux_'+gene.id+'_literature.tsv',writeTSV(evidenceColumns,papers),'text/tab-separated-values')}>下载去重文献 TXT</button>
    </>}</details>
    <details><summary>群体内复核 · 当前位点的原始表型</summary><div className="compare-tools"><label><input type="checkbox" checked={modern} onChange={e=>setModern(e.target.checked)}/>仅现代品种</label><select aria-label="证据复核环境" value={active?.id||''} onChange={e=>setEnv(e.target.value)}><option value="" disabled>选择实测环境</option>{axes.map(e=><option key={e.id} value={e.id}>{e.label}</option>)}</select></div>
      <p className="footnote">{selected?.id||'无可用位点'} · 按数据集与群体分层，仅作描述性比较，未校正亲缘或推断因果。</p>
      {review.length?<><div className="matrix-scroll"><table className="individual-table"><thead><tr><th>数据集 / 亚群 / 来源组</th><th>分型</th><th>有效 n</th><th>原始均值 · {active.unit}</th></tr></thead><tbody>{review.map((r,i)=><tr key={i}><td>{r.dataset} / {r.subspecies} / {r.source_group}</td><td>{r.genotype}</td><td>{r.n}</td><td>{r.mean===null?'不可估计':r.mean.toFixed(3)}</td></tr>)}</tbody></table></div><button onClick={()=>saveFile('riceflux_population_review.tsv',writeTSV(['dataset','subspecies','source_group','marker','environment','unit','modern_only','genotype','dosage','n','mean','interpretation'],review.map(r=>({...r,marker:selected.id,environment:active.id,unit:active.unit,modern_only:modern,interpretation:'descriptive_association_only'}))),'text/tab-separated-values')}>下载分层复核 TXT</button></>:<p>当前位点或对应性状缺少可用的配对数据。</p>}
      <p><a href="./prior/primary_contrasts.tsv" download="primary_contrasts.txt">已完成的原 2,347 份现代籼稻模型结果（23 个预定对照）</a></p>
    </details>
    <details><summary>性状标准与外部本体</summary><p>性状采用 Crop Ontology 的 Trait–Method–Scale 模型；试验地点、年份和时期独立记录。TO 提供跨作物性状概念，GO 注释基因产物的功能、过程和细胞组分。外部术语未核验时保留本地稳定 ID，不自动映射。</p><a href="./formats/traits.tsv" download="traits.txt">性状注册表 TXT</a> · <a href="./formats/ontology.txt" target="_blank" rel="noreferrer">接入规范</a> · <a href="./formats/ontology/v1/README.txt" target="_blank" rel="noreferrer">育种证据本体 V1</a> · <a href="./formats/ontology/v1/manifest.json" download>版本清单</a></details>
  </section>;
}
