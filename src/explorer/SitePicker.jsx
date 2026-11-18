import React,{useMemo,useState} from 'react';
import {Button,Dialog} from '@radix-ui/themes';
import {alleleStats,percent} from './model.js';
import {resolveSites,siteOrder} from './siteSelection.js';
import {presetTitle} from './provenance.js';

export function SitePicker({gene,cohort,selection,initialIds=[],schemes=[],onApply,onAutomatic}){
  const [open,setOpen]=useState(false),[ids,setIds]=useState([]),[query,setQuery]=useState('');
  const rows=useMemo(()=>gene.variants.slice().sort(siteOrder).map(v=>({v,stats:alleleStats(cohort,v)})),[gene,cohort]);
  const selected=new Set(ids),missing=ids.filter(id=>!gene.variants.some(v=>v.id===id));
  const presets=schemes.filter(s=>s.kind==='literature');
  const preview=resolveSites(gene,{markerIds:ids,assembly:gene.assembly});
  const visible=rows.filter(({v})=>[v.id,String(v.pos),v.feature].join(' ').toLowerCase().includes(query.toLowerCase().trim()));
  function preset(predicate){setIds(rows.filter(({v})=>predicate(v)).map(({v})=>v.id));}
  return <><Button variant="soft" onClick={()=>{setIds(selection?.markerIds||initialIds);setQuery('');setOpen(true);}} aria-label={gene.name+' 自选单倍型位点'}>自选位点{selection?' · '+selection.markerIds.length:''}</Button>
    <Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Content maxWidth="960px" className="site-picker"><Dialog.Title>{gene.name} · 自选单倍型位点</Dialog.Title><Dialog.Description>按坐标顺序组合勾选的位点；自选结果与文献命名型分别记录。缺失调用不补为参考等位。</Dialog.Description>
      <div className="site-presets"><button onClick={()=>preset(()=>true)}>全选</button><button onClick={()=>setIds([])}>清空</button><button onClick={()=>preset(v=>/CDS/i.test(v.feature||''))}>仅 CDS</button><button onClick={()=>preset(v=>/promoter|启动子|上游/i.test(v.feature||''))}>仅启动子</button>
        {presets.length>0&&<select aria-label="文献位点预设" value="" onChange={e=>{const s=presets.find(s=>s.id===e.target.value);if(s)setIds(s.markers.map(v=>v.id));}}><option value="">文献位点预设…</option>{presets.map((s,i)=><option key={s.id} value={s.id} disabled={!s.ready}>{presetTitle(s)} · {s.positions.length} 位点{s.ready?'':'（未完整覆盖）'}</option>)}</select>}
        <input type="search" aria-label="搜索自选位点" placeholder="坐标 / 区域" value={query} onChange={e=>setQuery(e.target.value)}/>
      </div>
      {presets.some(s=>s.provenance)&&<details><summary>预设出处 / Preset provenance</summary>{presets.filter(s=>s.provenance).map(s=><p key={s.id}><a href={'https://doi.org/'+s.provenance.doi} target="_blank" rel="noreferrer">{s.provenance.title}</a> · {s.provenance.locator}<br/>{s.provenance.summary}<br/>{s.provenance.caveat}</p>)}</details>}
      <p className="selection-status" role="status">已选 {ids.length} / {gene.variants.length} 位点 · {gene.chromosome} · {gene.assembly}{missing.length>0&&' · '+missing.length+' 个位点在当前数据中不可用'}{!ids.length&&' · 不生成组合'}</p>
      {selection?.assembly&&selection.assembly!==gene.assembly&&<p role="alert">原选择来自 {selection.assembly}，请核对当前参考版本后重新选择。</p>}
      {missing.length>0&&<div className="unavailable-sites">未覆盖：{missing.map(id=><button key={id} onClick={()=>setIds(ids.filter(x=>x!==id))}>移除 {id} ×</button>)}</div>}
      <div className="site-table-scroll"><table className="individual-table"><thead><tr><th>选择</th><th>位置 / 标记</th><th>REF → ALT</th><th>区域</th><th>MAF</th><th>Missing</th></tr></thead><tbody>{visible.map(({v,stats})=><tr key={v.id} className={selected.has(v.id)?'selected-person':''}><td><input type="checkbox" aria-label={'纳入位点 '+v.id} checked={selected.has(v.id)} onChange={e=>setIds(e.target.checked?[...ids,v.id]:ids.filter(id=>id!==v.id))}/></td><th scope="row">{v.pos.toLocaleString()}<small>{v.id}</small></th><td>{v.ref} → {v.alt||'—'}</td><td>{v.feature||'未注释'}</td><td>{percent(stats.maf)}</td><td>{percent(stats.missing)}</td></tr>)}</tbody></table>{!visible.length&&<p>没有符合条件的位点。</p>}</div>
      <p className="footnote">自选模式使用已勾选的分型位点，不受 MAF／缺失阈值筛除；未测位点不作推断。</p>
      <div className="dialog-actions"><span>{preview.ready?'将联动更新组合、成员与频率':'当前选择无法完整判型'}</span><div>{onAutomatic&&<Button variant="soft" onClick={()=>{onAutomatic();setOpen(false);}}>恢复 QC 自动选择</Button>} <Dialog.Close><Button variant="soft">取消</Button></Dialog.Close> <Button onClick={()=>{onApply({assembly:gene.assembly,markerIds:preview.markerIds});setOpen(false);}}>应用位点</Button></div></div>
    </Dialog.Content></Dialog.Root></>;
}
