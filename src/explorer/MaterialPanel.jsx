import React,{useMemo,useState} from 'react';
import {phenotypeAxes,radarRows} from './analysis.js';
import {matchesMaterial,saveFile,writeTSV} from './formats.js';
import {geneSchemes,typeMaterial,statusText} from './jointHaplotypes.js';
const colors=['#327e72','#4c78a8','#b17aa2','#b28a36','#7262a8','#bc6868'];
const number=x=>Number.isFinite(x)?Number(x.toFixed(2)):'—';
export function MaterialPanel({data,reference,genes,settings={},onSettings}){
  const [query,setQuery]=useState(''),[withPhenotypes,setWithPhenotypes]=useState(true);
  const axes=useMemo(()=>phenotypeAxes(data),[data]);
  const defaults=[...new Set(axes.map(e=>e.trait_id))].slice(0,5).map(id=>axes.find(e=>e.trait_id===id&&e.source.site==='Hefei'&&e.source.year==='2023')?.id||axes.find(e=>e.trait_id===id).id);
  const axisIds=settings.axes||defaults,active=axisIds.map(id=>axes.find(e=>e.id===id)).filter(Boolean);
  const ids=settings.samples||[],samples=ids.map(id=>data.individuals.find(s=>s.id===id)).filter(Boolean);
  const refs=[...new Set(reference.map(s=>JSON.stringify([s.dataset_id,s.source_group||s.population_id])))];
  const refKey=refs.includes(settings.reference)?settings.reference:'current';
  const comparison=refKey==='current'?reference:reference.filter(s=>JSON.stringify([s.dataset_id,s.source_group||s.population_id])===refKey);
  const rows=useMemo(()=>radarRows(samples,comparison,active),[samples,comparison,active]);
  const hits=data.individuals.filter(s=>!ids.includes(s.id)&&(!withPhenotypes||Object.values(s.phenotypes).some(Number.isFinite))&&matchesMaterial(s,query)).slice(0,30);
  const update=patch=>onSettings({...settings,...patch});
  const point=(i,p)=>{const a=2*Math.PI*i/active.length-Math.PI/2;return [200+Math.cos(a)*125*p/100,180+Math.sin(a)*125*p/100];};
  return <section className="panel material-comparison"><div className="panel-title"><h2>材料比较 · 表型与分型</h2><span className="panel-tag">方向未设定</span></div>
    <div className="compare-tools"><input type="search" aria-label="搜索比较材料" placeholder="材料编号或原名" value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label="加入材料比较" value="" onChange={e=>{if(e.target.value&&ids.length<6)update({samples:[...ids,e.target.value]});}} disabled={ids.length>=6}><option value="">选择材料（最多 6 份）</option>{hits.map(s=><option key={s.id} value={s.id}>{s.id} · {s.name} · {s.dataset_name}</option>)}</select><label><input type="checkbox" checked={withPhenotypes} onChange={e=>setWithPhenotypes(e.target.checked)}/>仅列有表型材料</label><button onClick={()=>update({samples:[]})}>清空材料</button></div>
    <div className="joint-chips compare-tools">{samples.map((s,i)=><button style={{borderColor:colors[i]}} key={s.id} onClick={()=>update({samples:ids.filter(id=>id!==s.id)})}>{s.name} · {s.id} ×</button>)}</div>
    <label>百分位参考群体 <select aria-label="百分位参考群体" value={refKey} onChange={e=>update({reference:e.target.value})}><option value="current">左侧已选群体与材料类别（不随关注个体缩小）</option>{refs.map(k=><option key={k} value={k}>{JSON.parse(k).join(' / ')}</option>)}</select></label>
    <details><summary>编辑比较维度与试验环境（{active.length} 个轴）</summary><div className="axis-config">{axisIds.map((id,i)=><label key={i}>轴 {i+1}<select aria-label={'雷达轴 '+(i+1)} value={axes.some(e=>e.id===id)?id:''} onChange={e=>update({axes:axisIds.map((v,j)=>j===i?e.target.value:v)})}><option value="">未接入的环境</option>{axes.filter(e=>!axisIds.includes(e.id)||e.id===id).map(e=><option key={e.id} value={e.id}>{e.label}</option>)}</select><button onClick={()=>update({axes:axisIds.filter((_,j)=>j!==i)})}>移除轴</button></label>)}</div><button disabled={axisIds.length>=8||axisIds.length>=axes.length} onClick={()=>update({axes:[...axisIds,axes.find(e=>!axisIds.includes(e.id)).id]})}>加入比较维度</button></details>
    <p className="footnote">参考范围 {comparison.length.toLocaleString()} 份；每轴按相同地点、年份、鉴定指标的有效值计算百分位（并列取中秩）。高低不代表优劣，缺失不补 0；不计算综合总分。</p>
    {!samples.length?<div className="empty">选择材料以查看原始表型、百分位和多基因分型。</div>:<><div className="radar-layout">{active.length>=3?<svg viewBox="0 0 400 360" className="radar" role="img" aria-label="材料表型百分位雷达图，百分位不表示优劣">
      {[25,50,75,100].map(p=><g key={p}><polygon points={active.map((_,i)=>point(i,p).join(',')).join(' ')} fill="none" stroke="#dce4e5"/><text x="204" y={180-p*1.25} className="axis">{p}</text></g>)}
      {active.map((e,i)=><g key={e.id}><line x1="200" y1="180" x2={point(i,100)[0]} y2={point(i,100)[1]} stroke="#dce4e5"/><text x={point(i,117)[0]} y={point(i,117)[1]} textAnchor="middle" className="axis">轴 {i+1}</text></g>)}
      {samples.map((s,k)=>{const rs=active.map(e=>rows.find(r=>r.sample_id===s.id&&r.environment_id===e.id));return <g key={s.id}>{rs.map((r,i)=>{const next=(i+1)%rs.length;if(r.percentile===null)return null;const [x,y]=point(i,r.percentile);return <g key={i}>{rs[next].percentile!==null&&<line x1={x} y1={y} x2={point(next,rs[next].percentile)[0]} y2={point(next,rs[next].percentile)[1]} stroke={colors[k]} strokeWidth="2"/>}<circle cx={x} cy={y} r="4" fill={colors[k]}><title>{s.name} · {active[i].label} · 原值 {r.value} · 百分位 {number(r.percentile)} · 参考 n={r.reference_n}</title></circle></g>;})}</g>;})}
    </svg>:<p>雷达图至少需要 3 个维度；原始值见右表。</p>}
    <div className="matrix-scroll"><table className="individual-table"><thead><tr><th>轴 / 环境</th>{samples.map((s,i)=><th key={s.id} style={{color:colors[i]}}>{s.name}<small>{s.id}</small></th>)}</tr></thead><tbody>{active.map((e,i)=><tr key={e.id}><th>{i+1}. {e.trait_name}<small>{e.assay} · {e.source.site} {e.source.year} · {e.unit}</small></th>{samples.map(s=>{const r=rows.find(r=>r.sample_id===s.id&&r.environment_id===e.id);return <td key={s.id}>{number(r.value)}<small>P {number(r.percentile)} · n={r.reference_n}</small></td>;})}</tr>)}</tbody></table></div></div>
    <button onClick={()=>saveFile('riceflux_material_phenotypes.tsv',writeTSV(['sample_id','name','dataset_id','trait_id','environment_id','assay','site','year','unit','value','percentile','reference_n','direction','reference_sample_ids'],rows.map(r=>({...r,reference_sample_ids:comparison.filter(s=>Number.isFinite(s.phenotypes[r.environment_id])).map(s=>s.id).join(';')}))),'text/tab-separated-values')}>下载原值与百分位 TSV</button>
    <h3>关注基因的材料分型</h3><p className="footnote">当前基因及多基因比较中的基因。优先显示可匹配的文献定义；文献定义覆盖和分型来源分别列出，型名不代表有利型。</p>
    <div className="matrix-scroll"><table className="individual-table"><thead><tr><th>基因 / 定义</th>{samples.map(s=><th key={s.id}>{s.name}</th>)}</tr></thead><tbody>{genes.map(g=>{const schemes=geneSchemes(g,data.evidence),scheme=schemes.find(s=>s.kind==='literature'&&s.ready)||schemes.find(s=>s.kind==='observed');return <tr key={g.id}><th>{g.name}<small>{scheme.kind==='literature'?'文献定义':'区域标记型'} · {scheme.positions.join(', ')}</small></th>{samples.map(s=>{const c=typeMaterial(s,scheme);return <td key={s.id}>{c.label||statusText[c.status]}<small>{s.genotype_evidence} · 优劣未判定</small></td>;})}</tr>;})}</tbody></table></div></>}
  </section>;
}
