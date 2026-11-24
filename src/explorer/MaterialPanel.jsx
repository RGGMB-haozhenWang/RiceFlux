import {useText} from './locale.jsx';
import React,{useMemo,useState} from 'react';
import {phenotypeAxes,radarRows} from './analysis.js';
import {matchesMaterial,saveFile} from './formats.js';
import {readableDefinition} from './provenance.js';
import {materialTables,zipTables} from './exports.js';
import {siteName} from './regions.js';
import {sourceColor} from './datasetColors.js';
import {geneSchemes,typeMaterial,statusText} from './jointHaplotypes.js';
import {useGeneCalls} from './useGeneCalls.js';
const radarCenter=[290,164],radarRadius=108;
const number=x=>Number.isFinite(x)?Number(x.toFixed(2)):'—';
export function MaterialPanel({data,reference,genes,settings={},onSettings}){
  const localize = useText();
  const [query,setQuery]=useState(''),[withPhenotypes,setWithPhenotypes]=useState(true),[page,setPage]=useState(0);
  const axes=useMemo(()=>phenotypeAxes(data),[data]);
  const defaults=[...new Set(axes.map(e=>e.trait_id))].slice(0,5).map(id=>axes.find(e=>e.trait_id===id&&e.source.site==='Hefei'&&e.source.year==='2023')?.id||axes.find(e=>e.trait_id===id).id);
  const axisIds=settings.axes||defaults,active=axisIds.map(id=>axes.find(e=>e.id===id)).filter(Boolean);
  const ids=settings.samples||[],byId=useMemo(()=>new Map(data.individuals.map(s=>[s.id,s])),[data]);
  const samples=ids.map(id=>byId.get(id)).filter(Boolean),lastPage=Math.max(0,Math.ceil(samples.length/6)-1),currentPage=Math.min(page,lastPage),visible=samples.slice(currentPage*6,currentPage*6+6);
  const calls=useGeneCalls(data,genes.map(g=>g.id),samples.length>0);
  const refs=[...new Set(reference.map(s=>JSON.stringify([s.dataset_id,s.source_group||s.population_id])))];
  const refKey=refs.includes(settings.reference)?settings.reference:'current';
  const comparison=refKey==='current'?reference:reference.filter(s=>JSON.stringify([s.dataset_id,s.source_group||s.population_id])===refKey);
  const rows=useMemo(()=>radarRows(samples,comparison,active),[samples,comparison,active]);
  const selectedIds=new Set(ids),matches=data.individuals.filter(s=>!selectedIds.has(s.id)&&(!withPhenotypes||Object.values(s.phenotypes).some(Number.isFinite))&&matchesMaterial(s,query)),hits=matches.slice(0,30);
  const rowByKey=useMemo(()=>new Map(rows.map(r=>[JSON.stringify([r.sample_id,r.environment_id]),r])),[rows]);
  const update=patch=>onSettings({...settings,...patch});
  const point=(i,p)=>{const a=2*Math.PI*i/active.length-Math.PI/2;return [radarCenter[0]+Math.cos(a)*radarRadius*p/100,radarCenter[1]+Math.sin(a)*radarRadius*p/100];};
  const color=(s,i)=>sourceColor(s.dataset_id,data.datasetRegistry,i);
  return <section className="panel material-comparison"><div className="panel-title"><h2>{localize("材料比较 / Accessions")}</h2></div>
    <div className="compare-tools"><input type="search" aria-label={localize("搜索比较材料")} placeholder={localize("材料编号或原名")} value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label={localize("加入材料比较")} value="" onChange={e=>{if(e.target.value)update({samples:[...ids,e.target.value]});}}><option value="">{localize("选择材料 / Add accession")}</option>{hits.map(s=><option key={s.id} value={s.id}>{localize(s.id)} · {localize(s.name)} · {localize(s.dataset_name)}</option>)}</select><label><input type="checkbox" checked={withPhenotypes} onChange={e=>setWithPhenotypes(e.target.checked)}/>{localize("仅列有表型材料")}</label><button disabled={!matches.length} onClick={()=>update({samples:[...ids,...matches.map(s=>s.id)]})}>{localize("加入匹配结果 ·")+" "}{localize(matches.length)}</button><button onClick={()=>update({samples:[]})}>{localize("清空材料 / Clear")}</button></div>
    <div className="compare-tools material-pagination"><b>{localize("已选")+" "}{localize(samples.length)}{" "+localize("份 / selected")}</b><button disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>{localize("上一页 / Prev")}</button><span>{localize(currentPage+1)} / {localize(lastPage+1)}{" "+localize("页")}</span><button disabled={currentPage===lastPage} onClick={()=>setPage(currentPage+1)}>{localize("下一页 / Next")}</button></div><div className="joint-chips compare-tools">{visible.map((s,i)=><button style={{borderColor:color(s,i)}} key={s.id} onClick={()=>update({samples:ids.filter(id=>id!==s.id)})}>{localize(s.name)} · {localize(s.id)} ×</button>)}</div>
    <div className="material-dimensions"><label>{localize("百分位参考群体")+" "}<select aria-label={localize("百分位参考群体")} value={refKey} onChange={e=>update({reference:e.target.value})}><option value="current">{localize("左侧已选群体与材料类别（不随关注个体缩小）")}</option>{refs.map(k=><option key={k} value={k}>{localize(JSON.parse(k).join(' / '))}</option>)}</select></label>
    <details><summary>{localize("编辑比较维度与试验环境（")}{localize(active.length)}{" "+localize("个轴）")}</summary><div className="axis-config">{axisIds.map((id,i)=><label key={i}>{axes.find(e=>e.id===id)?.trait_name||localize("维度")}<select aria-label={localize('雷达轴 '+(i+1))} value={axes.some(e=>e.id===id)?id:''} onChange={e=>update({axes:axisIds.map((v,j)=>j===i?e.target.value:v)})}><option value="">{localize("未接入的环境")}</option>{axes.filter(e=>!axisIds.includes(e.id)||e.id===id).map(e=><option key={e.id} value={e.id}>{localize(e.label)}</option>)}</select><button onClick={()=>update({axes:axisIds.filter((_,j)=>j!==i)})}>{localize("移除轴")}</button></label>)}</div><button disabled={axisIds.length>=8||axisIds.length>=axes.length} onClick={()=>update({axes:[...axisIds,axes.find(e=>!axisIds.includes(e.id)).id]})}>{localize("加入比较维度")}</button></details></div>
    <p className="footnote material-reference">{localize("参考范围")+" "}{localize(comparison.length.toLocaleString())}{" "+localize("份；各轴按同地点、年份和指标的有效值计算百分位，并保留缺失。")}</p>
    {!samples.length?<div className="empty">{localize("选择材料以查看原始表型、百分位和多基因分型。")}</div>:<><div className="radar-layout">{active.length>=3?<svg viewBox="0 0 580 328" className="radar" role="img" aria-label={localize("材料表型百分位雷达图")}>
      {[25,50,75,100].map(p=><g key={p}><polygon points={active.map((_,i)=>point(i,p).join(',')).join(' ')} fill="none" stroke="#dce4e5"/>{p<100&&<text x={radarCenter[0]+7} y={radarCenter[1]-p*radarRadius/100} className="axis">{localize(p)}</text>}</g>)}
      {active.map((e,i)=>{
        const [x,y]=point(i,113),anchor=x>radarCenter[0]+20?'start':x<radarCenter[0]-20?'end':'middle';
        const repeated=active.some(a=>a.id!==e.id&&a.trait_id===e.trait_id);
        return <g key={e.id}><line x1={radarCenter[0]} y1={radarCenter[1]} x2={point(i,100)[0]} y2={point(i,100)[1]} stroke="#dce4e5"/>
          <text x={x} y={y} textAnchor={anchor} className="radar-axis-label"><title>{localize(e.label)}</title><tspan x={x}>{localize(e.trait_name)}</tspan><tspan x={x} dy="17">{localize(e.unit)}</tspan>{repeated&&<tspan x={x} dy="15">{localize(siteName(e.source.original_site||e.source.site))} {localize(e.source.year)}</tspan>}</text>
        </g>;
      })}
      {visible.map((s,k)=>{const rs=active.map(e=>rowByKey.get(JSON.stringify([s.id,e.id])));return <g key={s.id}>{rs.map((r,i)=>{const next=(i+1)%rs.length;if(r.percentile===null)return null;const [x,y]=point(i,r.percentile);return <g key={i}>{rs[next].percentile!==null&&<line x1={x} y1={y} x2={point(next,rs[next].percentile)[0]} y2={point(next,rs[next].percentile)[1]} stroke={color(s,k)} strokeWidth="2"/>}<circle cx={x} cy={y} r="4" fill={color(s,k)}><title>{localize(s.name)} · {localize(active[i].label)}{" "+localize("· 原值")+" "}{localize(r.value)}{" "+localize("· 百分位")+" "}{localize(number(r.percentile))}{" "+localize("· 参考 n=")}{localize(r.reference_n)}</title></circle></g>;})}</g>;})}
    </svg>:<p>{localize("雷达图至少需要 3 个维度；原始值见右表。")}</p>}
    <div className="matrix-scroll"><table className="individual-table"><thead><tr><th>{localize("表型 / 环境")}</th>{visible.map((s,i)=><th key={s.id} style={{color:color(s,i)}}>{localize(s.name)}<small>{localize(s.id)}</small></th>)}</tr></thead><tbody>{active.map((e,i)=><tr key={e.id}><th>{localize(e.trait_name)}<small>{localize(e.assay)} · {localize(e.source.site)} {localize(e.source.year)} · {localize(e.unit)}</small></th>{visible.map(s=>{const r=rowByKey.get(JSON.stringify([s.id,e.id]));return <td key={s.id}>{localize(number(r.value))}<small>P {localize(number(r.percentile))} · n={localize(r.reference_n)}</small></td>;})}</tr>)}</tbody></table></div></div>
    <button onClick={()=>saveFile('riceflux_material_comparison.zip',zipTables(materialTables(rows,comparison,active)),'application/zip')}>{localize("下载全部原值与百分位 TXT 包 / Export all")}</button>
    <h3>{localize("关注基因的材料分型")}</h3>
    {!calls.ready?(calls.error?<p role="alert">{localize(calls.error)} <button onClick={calls.retry}>{localize("重试")}</button></p>:<p role="status">{localize("正在读取材料分型…")}</p>):<div className="matrix-scroll"><table className="individual-table"><thead><tr><th>{localize("基因 / 定义")}</th>{visible.map(s=><th key={s.id}>{localize(s.name)}</th>)}</tr></thead><tbody>{genes.map(g=>{const schemes=geneSchemes(g,data.evidence),scheme=schemes.find(s=>s.kind==='literature'&&s.ready)||schemes.find(s=>s.kind==='observed');return <tr key={g.id}><th>{localize(g.name)}<small>{scheme.kind==='literature'?localize("文献定义"):localize("区域标记型")} · {localize(scheme.positions.join(', '))}</small></th>{visible.map(s=>{const c=typeMaterial(s,scheme);return <td key={s.id}>{localize(readableDefinition(c.label)||statusText[c.status])}<small>{localize(s.genotype_evidence)}</small></td>;})}</tr>;})}</tbody></table></div>}</>}
  </section>;
}
