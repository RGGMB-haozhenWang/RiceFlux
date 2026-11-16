import React,{useEffect,useMemo,useState} from 'react';
import {readText} from './observed.js';
import {readTable} from './datasets.js';
import {saveFile,writeTSV} from './formats.js';
const path='sources/ricenavi-20261025/';
export function RiceNaviPanel({gene}){
  const [open,setOpen]=useState(false),[data,setData]=useState(null),[calls,setCalls]=useState(null),[error,setError]=useState(''),[material,setMaterial]=useState(''),[locus,setLocus]=useState(''),[all,setAll]=useState(false),[busy,setBusy]=useState(false);
  useEffect(()=>{if(!open||data)return;const c=new AbortController();Promise.all(['loci.tsv','materials.tsv'].map(f=>readText(import.meta.env.BASE_URL+path+f,c.signal))).then(([l,m])=>setData({loci:readTable(l).objects(),materials:readTable(m).objects()})).catch(e=>{if(e.name!=='AbortError')setError(e.message)});return()=>c.abort();},[open]);
  const genes=new Set([gene.name,...gene.catalog?.aliases||[]].flatMap(n=>n.split(/[;,/]/)).map(n=>n.trim().toLowerCase()));
  const loci=data?.loci.filter(r=>all||genes.has(r.gene_symbol.toLowerCase()))||[],active=loci.find(r=>r.external_id===locus)||loci[0];
  const selected=useMemo(()=>calls?.filter(r=>r.external_id===active?.external_id&&(!material||r.material_id===material))||[],[calls,active,material]);
  async function loadCalls(){setBusy(true);setError('');try{setCalls(readTable(await readText(import.meta.env.BASE_URL+path+'calls.tsv.gz')).objects());}catch(e){setError(e.message)}finally{setBusy(false)}}
  return <section className="panel"><div className="panel-title"><h2>RiceNavi · 独立来源</h2><button aria-expanded={open} onClick={()=>setOpen(!open)}>{open?'收起来源':'打开来源'}</button></div>{open&&<>
    <p>319 个来源位点 · 404 份材料 · 128,876 条原始调用。基因别名用于检索，未与 6044 自动认定为同一事件或同一材料。</p>
    <p className="footnote">来源分型缺少逐调用 QC 与原始 VCF 绑定；“|”不证明分相，SV/缺失编码按原值保留。来源效应描述不直接转成有利等位判断。材料表型未绑定试验环境，暂不进入 6044 雷达图。</p>
    <div className="compare-tools">{['loci.tsv','materials.tsv','calls.tsv.gz','manifest.json'].map(f=><a href={'./'+path+f} download key={f}>{f}</a>)}<a href="https://github.com/xhhuanglab/RiceNavi/tree/3f62be31b91c1cc1d1730dd92d4b2d48d3baa22e" target="_blank" rel="noreferrer">冻结来源 ↗</a></div>
    {error&&<p role="alert">{error}</p>}{!data?<p>正在读取来源目录…</p>:<><div className="compare-tools"><label><input type="checkbox" checked={all} onChange={e=>{setAll(e.target.checked);setLocus('')}}/>查看全部来源位点</label><select aria-label="RiceNavi 位点" value={active?.external_id||''} onChange={e=>setLocus(e.target.value)}>{loci.map(r=><option value={r.external_id} key={r.external_id}>{r.gene_symbol} · {r.chromosome}:{r.position_literal} · {r.variant_type}</option>)}</select></div>
    {!active?<p>当前基因没有按精确别名匹配的 RiceNavi 来源记录。</p>:<><p>{active.gene_symbol} · {active.chromosome}:{active.position_literal} · {active.ref_literal} → {active.alt_literal} · {active.method}</p><p>来源效应描述：{active.source_effect_label||'未注明'}</p>
      {!calls?<button disabled={busy} onClick={loadCalls}>{busy?'读取原始调用…':'查看 404 份材料原始调用'}</button>:<><select aria-label="RiceNavi 材料" value={material} onChange={e=>setMaterial(e.target.value)}><option value="">全部材料</option>{data.materials.map(s=><option key={s.material_id} value={s.material_id}>{s.material_id} · {s.reported_name}</option>)}</select><button onClick={()=>saveFile('ricenavi_selected_calls.tsv',writeTSV(Object.keys(selected[0]||calls[0]),selected),'text/tab-separated-values')}>下载当前来源调用</button><div className="matrix-scroll"><table className="individual-table"><thead><tr>{['材料 / 来源名称','原始编码','来源解析等位','解析状态','QC / 相位'].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{selected.slice(0,40).map(r=><tr key={r.material_id}><td>{r.material_id}<small>{data.materials.find(s=>s.material_id===r.material_id)?.reported_name}</small></td><td>{r.raw_call}</td><td>{r.decoded_alleles}</td><td>{r.parse_status}</td><td>未认证 / {r.phase_basis}</td></tr>)}</tbody></table></div><p className="footnote">预览前 40 / {selected.length} 行；下载包含全部当前选中记录。</p></>}
    </>}</>}
  </>}</section>;
}
