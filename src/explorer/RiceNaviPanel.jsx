import {useText} from './locale.jsx';
import React,{useEffect,useMemo,useState} from 'react';
import {readText} from './observed.js';
import {readTable} from './datasets.js';
import {saveFile,writeTSV} from './formats.js';
const path='sources/ricenavi-20261025/';
export function RiceNaviPanel({gene}){
  const localize = useText();
  const [open,setOpen]=useState(false),[data,setData]=useState(null),[calls,setCalls]=useState(null),[error,setError]=useState(''),[material,setMaterial]=useState(''),[locus,setLocus]=useState(''),[all,setAll]=useState(false),[busy,setBusy]=useState(false);
  useEffect(()=>{if(!open||data)return;const c=new AbortController();Promise.all(['loci.tsv','materials.tsv','alt_function_review.tsv'].map(f=>readText(import.meta.env.BASE_URL+path+f,c.signal))).then(([l,m,r])=>setData({loci:readTable(l).objects(),materials:readTable(m).objects(),review:readTable(r).objects()})).catch(e=>{if(e.name!=='AbortError')setError(e.message)});return()=>c.abort();},[open]);
  const genes=new Set([gene.name,...gene.catalog?.aliases||[]].flatMap(n=>n.split(/[;,/]/)).map(n=>n.trim().toLowerCase()));
  const loci=data?.loci.filter(r=>all||genes.has(r.gene_symbol.toLowerCase()))||[],active=loci.find(r=>r.external_id===locus)||loci[0];
  const review=data?.review.find(r=>r.chr===active?.chromosome&&r.position===active?.position_literal&&r.ref===active?.ref_literal&&r.alt===active?.alt_literal);
  const selected=useMemo(()=>calls?.filter(r=>r.external_id===active?.external_id&&(!material||r.material_id===material))||[],[calls,active,material]);
  async function loadCalls(){setBusy(true);setError('');try{setCalls(readTable(await readText(import.meta.env.BASE_URL+path+'calls.tsv.gz')).objects());}catch(e){setError(e.message)}finally{setBusy(false)}}
  return <section className="panel"><div className="panel-title"><h2>{localize("RiceNavi · 独立来源")}</h2><button aria-expanded={open} onClick={()=>setOpen(!open)}>{open?localize("收起来源"):localize("打开来源")}</button></div>{open&&<>
    <p>{localize("319 个来源位点 · 404 份材料 · 128,876 条原始调用。其中 23 个严格匹配 SNP 已可在“数据接口 → D2 → 应用”进入主面板；其余保留为来源记录。材料不与 6044 自动合并。")}</p>
    <p className="footnote">{localize("来源调用未核逐调用 QC 或分相，保留 SV 与缺失原值；ALT 作用保留 RiceNavi 来源标注。表型环境未绑定，不纳入 6044 雷达图。")}</p>
    <div className="compare-tools">{['loci.tsv','materials.tsv','calls.tsv.gz','manifest.json'].map(f=><a href={'./'+path+f} download key={f}>{localize(f)}</a>)}<a href="https://github.com/xhhuanglab/RiceNavi/tree/3f62be31b91c1cc1d1730dd92d4b2d48d3baa22e" target="_blank" rel="noreferrer">{localize("冻结来源 ↗")}</a></div>
    {error&&<p role="alert">{localize(error)}</p>}{!data?<p>{localize("正在读取来源目录…")}</p>:<><div className="compare-tools"><label><input type="checkbox" checked={all} onChange={e=>{setAll(e.target.checked);setLocus('')}}/>{localize("查看全部来源位点")}</label><select aria-label={localize("RiceNavi 位点")} value={active?.external_id||''} onChange={e=>setLocus(e.target.value)}>{loci.map(r=><option value={r.external_id} key={r.external_id}>{localize(r.gene_symbol)} · {localize(r.chromosome)}:{localize(r.position_literal)} · {localize(r.variant_type)}</option>)}</select></div>
    {!active?<p>{localize("当前基因没有按精确别名匹配的 RiceNavi 来源记录。")}</p>:<><p>{localize(active.gene_symbol)} · {localize(active.chromosome)}:{localize(active.position_literal)} · {localize(active.ref_literal)} → {localize(active.alt_literal)} · {localize(active.method)}</p><p>{localize("ALT 等位作用（RiceNavi）：")}{active.source_effect_label||localize("未注明")}</p>
      {review&&<p role="note">{localize(review.note)} <a href={'https://doi.org/'+review.doi} target="_blank" rel="noreferrer">{localize("核对原文 ↗")}</a></p>}
      {!calls?<button disabled={busy} onClick={loadCalls}>{busy?localize("读取原始调用…"):localize("查看 404 份材料原始调用")}</button>:<><select aria-label={localize("RiceNavi 材料")} value={material} onChange={e=>setMaterial(e.target.value)}><option value="">{localize("全部材料")}</option>{data.materials.map(s=><option key={s.material_id} value={s.material_id}>{localize(s.material_id)} · {localize(s.reported_name)}</option>)}</select><button onClick={()=>saveFile('ricenavi_selected_calls.tsv',writeTSV(Object.keys(selected[0]||calls[0]),selected),'text/tab-separated-values')}>{localize("下载当前来源调用")}</button><div className="matrix-scroll"><table className="individual-table"><thead><tr>{['材料 / 来源名称','原始编码','来源解析等位','解析状态','QC / 相位'].map(x=><th key={x}>{localize(x)}</th>)}</tr></thead><tbody>{selected.slice(0,40).map(r=><tr key={r.material_id}><td>{localize(r.material_id)}<small>{localize(data.materials.find(s=>s.material_id===r.material_id)?.reported_name)}</small></td><td>{localize(r.raw_call)}</td><td>{localize(r.decoded_alleles)}</td><td>{localize(r.parse_status)}</td><td>{localize("未认证 /")+" "}{localize(r.phase_basis)}</td></tr>)}</tbody></table></div><p className="footnote">{localize("预览前 40 /")+" "}{localize(selected.length)}{" "+localize("行；下载包含全部当前选中记录。")}</p></>}
    </>}</>}
  </>}</section>;
}
