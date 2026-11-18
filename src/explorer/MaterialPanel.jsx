import React,{useMemo,useState} from 'react';
import {phenotypeAxes,radarRows} from './analysis.js';
import {matchesMaterial,saveFile} from './formats.js';
import {readableDefinition} from './provenance.js';
import {materialTables,zipTables} from './exports.js';
import {siteName} from './regions.js';
import {sourceColor} from './datasetColors.js';
import {geneSchemes,typeMaterial,statusText} from './jointHaplotypes.js';
const radarCenter=[290,164],radarRadius=108;
const number=x=>Number.isFinite(x)?Number(x.toFixed(2)):'—';
export function MaterialPanel({data,reference,genes,settings={},onSettings}){
  const [query,setQuery]=useState(''),[withPhenotypes,setWithPhenotypes]=useState(true),[page,setPage]=useState(0);
  const axes=useMemo(()=>phenotypeAxes(data),[data]);
  const defaults=[...new Set(axes.map(e=>e.trait_id))].slice(0,5).map(id=>axes.find(e=>e.trait_id===id&&e.source.site==='Hefei'&&e.source.year==='2023')?.id||axes.find(e=>e.trait_id===id).id);
  const axisIds=settings.axes||defaults,active=axisIds.map(id=>axes.find(e=>e.id===id)).filter(Boolean);
  const ids=settings.samples||[],byId=useMemo(()=>new Map(data.individuals.map(s=>[s.id,s])),[data]);
  const samples=ids.map(id=>byId.get(id)).filter(Boolean),lastPage=Math.max(0,Math.ceil(samples.length/6)-1),currentPage=Math.min(page,lastPage),visible=samples.slice(currentPage*6,currentPage*6+6);
  const refs=[...new Set(reference.map(s=>JSON.stringify([s.dataset_id,s.source_group||s.population_id])))];
  const refKey=refs.includes(settings.reference)?settings.reference:'current';
  const comparison=refKey==='current'?reference:reference.filter(s=>JSON.stringify([s.dataset_id,s.source_group||s.population_id])===refKey);
  const rows=useMemo(()=>radarRows(samples,comparison,active),[samples,comparison,active]);
  const selectedIds=new Set(ids),matches=data.individuals.filter(s=>!selectedIds.has(s.id)&&(!withPhenotypes||Object.values(s.phenotypes).some(Number.isFinite))&&matchesMaterial(s,query)),hits=matches.slice(0,30);
  const rowByKey=useMemo(()=>new Map(rows.map(r=>[JSON.stringify([r.sample_id,r.environment_id]),r])),[rows]);
  const update=patch=>onSettings({...settings,...patch});
  const point=(i,p)=>{const a=2*Math.PI*i/active.length-Math.PI/2;return [radarCenter[0]+Math.cos(a)*radarRadius*p/100,radarCenter[1]+Math.sin(a)*radarRadius*p/100];};
  const color=(s,i)=>sourceColor(s.dataset_id,data.datasetRegistry,i);
  return <section className="panel material-comparison"><div className="panel-title"><h2>材料比较 / Accessions</h2></div>
    <div className="compare-tools"><input type="search" aria-label="搜索比较材料" placeholder="材料编号或原名" value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label="加入材料比较" value="" onChange={e=>{if(e.target.value)update({samples:[...ids,e.target.value]});}}><option value="">选择材料 / Add accession</option>{hits.map(s=><option key={s.id} value={s.id}>{s.id} · {s.name} · {s.dataset_name}</option>)}</select><label><input type="checkbox" checked={withPhenotypes} onChange={e=>setWithPhenotypes(e.target.checked)}/>仅列有表型材料</label><button disabled={!matches.length} onClick={()=>update({samples:[...ids,...matches.map(s=>s.id)]})}>加入匹配结果 · {matches.length}</button><button onClick={()=>update({samples:[]})}>清空材料 / Clear</button></div>
    <div className="compare-tools material-pagination"><b>已选 {samples.length} 份 / selected</b><button disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>上一页 / Prev</button><span>{currentPage+1} / {lastPage+1} 页</span><button disabled={currentPage===lastPage} onClick={()=>setPage(currentPage+1)}>下一页 / Next</button></div><div className="joint-chips compare-tools">{visible.map((s,i)=><button style={{borderColor:color(s,i)}} key={s.id} onClick={()=>update({samples:ids.filter(id=>id!==s.id)})}>{s.name} · {s.id} ×</button>)}</div>
    <div className="material-dimensions"><label>百分位参考群体 <select aria-label="百分位参考群体" value={refKey} onChange={e=>update({reference:e.target.value})}><option value="current">左侧已选群体与材料类别（不随关注个体缩小）</option>{refs.map(k=><option key={k} value={k}>{JSON.parse(k).join(' / ')}</option>)}</select></label>
    <details><summary>编辑比较维度与试验环境（{active.length} 个轴）</summary><div className="axis-config">{axisIds.map((id,i)=><label key={i}>{axes.find(e=>e.id===id)?.trait_name||'维度'}<select aria-label={'雷达轴 '+(i+1)} value={axes.some(e=>e.id===id)?id:''} onChange={e=>update({axes:axisIds.map((v,j)=>j===i?e.target.value:v)})}><option value="">未接入的环境</option>{axes.filter(e=>!axisIds.includes(e.id)||e.id===id).map(e=><option key={e.id} value={e.id}>{e.label}</option>)}</select><button onClick={()=>update({axes:axisIds.filter((_,j)=>j!==i)})}>移除轴</button></label>)}</div><button disabled={axisIds.length>=8||axisIds.length>=axes.length} onClick={()=>update({axes:[...axisIds,axes.find(e=>!axisIds.includes(e.id)).id]})}>加入比较维度</button></details></div>
    <p className="footnote material-reference">参考范围 {comparison.length.toLocaleString()} 份；各轴按同地点、年份和指标的有效值计算百分位，并保留缺失。</p>
    {!samples.length?<div className="empty">选择材料以查看原始表型、百分位和多基因分型。</div>:<><div className="radar-layout">{active.length>=3?<svg viewBox="0 0 580 328" className="radar" role="img" aria-label="材料表型百分位雷达图">
      {[25,50,75,100].map(p=><g key={p}><polygon points={active.map((_,i)=>point(i,p).join(',')).join(' ')} fill="none" stroke="#dce4e5"/>{p<100&&<text x={radarCenter[0]+7} y={radarCenter[1]-p*radarRadius/100} className="axis">{p}</text>}</g>)}
      {active.map((e,i)=>{
        const [x,y]=point(i,113),anchor=x>radarCenter[0]+20?'start':x<radarCenter[0]-20?'end':'middle';
        const repeated=active.some(a=>a.id!==e.id&&a.trait_id===e.trait_id);
        return <g key={e.id}><line x1={radarCenter[0]} y1={radarCenter[1]} x2={point(i,100)[0]} y2={point(i,100)[1]} stroke="#dce4e5"/>
          <text x={x} y={y} textAnchor={anchor} className="radar-axis-label"><title>{e.label}</title><tspan x={x}>{e.trait_name}</tspan><tspan x={x} dy="17">{e.unit}</tspan>{repeated&&<tspan x={x} dy="15">{siteName(e.source.original_site||e.source.site)} {e.source.year}</tspan>}</text>
        </g>;
      })}
      {visible.map((s,k)=>{const rs=active.map(e=>rowByKey.get(JSON.stringify([s.id,e.id])));return <g key={s.id}>{rs.map((r,i)=>{const next=(i+1)%rs.length;if(r.percentile===null)return null;const [x,y]=point(i,r.percentile);return <g key={i}>{rs[next].percentile!==null&&<line x1={x} y1={y} x2={point(next,rs[next].percentile)[0]} y2={point(next,rs[next].percentile)[1]} stroke={color(s,k)} strokeWidth="2"/>}<circle cx={x} cy={y} r="4" fill={color(s,k)}><title>{s.name} · {active[i].label} · 原值 {r.value} · 百分位 {number(r.percentile)} · 参考 n={r.reference_n}</title></circle></g>;})}</g>;})}
    </svg>:<p>雷达图至少需要 3 个维度；原始值见右表。</p>}
    <div className="matrix-scroll"><table className="individual-table"><thead><tr><th>表型 / 环境</th>{visible.map((s,i)=><th key={s.id} style={{color:color(s,i)}}>{s.name}<small>{s.id}</small></th>)}</tr></thead><tbody>{active.map((e,i)=><tr key={e.id}><th>{e.trait_name}<small>{e.assay} · {e.source.site} {e.source.year} · {e.unit}</small></th>{visible.map(s=>{const r=rowByKey.get(JSON.stringify([s.id,e.id]));return <td key={s.id}>{number(r.value)}<small>P {number(r.percentile)} · n={r.reference_n}</small></td>;})}</tr>)}</tbody></table></div></div>
    <button onClick={()=>saveFile('riceflux_material_comparison.zip',zipTables(materialTables(rows,comparison,active)),'application/zip')}>下载全部原值与百分位 TSV 包 / Export all</button>
    <h3>关注基因的材料分型</h3>
    <div className="matrix-scroll"><table className="individual-table"><thead><tr><th>基因 / 定义</th>{visible.map(s=><th key={s.id}>{s.name}</th>)}</tr></thead><tbody>{genes.map(g=>{const schemes=geneSchemes(g,data.evidence),scheme=schemes.find(s=>s.kind==='literature'&&s.ready)||schemes.find(s=>s.kind==='observed');return <tr key={g.id}><th>{g.name}<small>{scheme.kind==='literature'?'文献定义':'区域标记型'} · {scheme.positions.join(', ')}</small></th>{visible.map(s=>{const c=typeMaterial(s,scheme);return <td key={s.id}>{readableDefinition(c.label)||statusText[c.status]}<small>{s.genotype_evidence}</small></td>;})}</tr>;})}</tbody></table></div></>}
  </section>;
}
