import React,{useMemo,useState} from 'react';
import {Button,Dialog} from '@radix-ui/themes';
import {alleleStats,percent} from './model.js';
import {resolveSites,siteOrder} from './siteSelection.js';
import {presetTitle,geneSupport} from './provenance.js';
import {markerDatasetSupport} from './researcherUi.js';
import {markerAnnotation} from './alleles.js';
import {MarkerIcon,markerNames} from './VariantMark.jsx';

export function SitePicker({data,gene,cohort,selection,initialIds=[],schemes=[],onApply,onAutomatic}){
  const [open,setOpen]=useState(false),[ids,setIds]=useState([]),[query,setQuery]=useState('');
  const rows=useMemo(()=>gene.variants.slice().sort(siteOrder).map(v=>({v,stats:alleleStats(cohort,v),...markerAnnotation(v)})),[gene,cohort]);
  const support=useMemo(()=>data?markerDatasetSupport(data,gene,geneSupport(data,gene)):new Map(),[data,gene]);
  const loadedMarkers=new Set(gene.variants.map(v=>v.id));
  const metadataOnly=[...support].filter(([id])=>!loadedMarkers.has(id)&&id.toLowerCase().includes(query.toLowerCase().trim()));
  const supportText=id=>[...(support.get(id)?.values()||[])].map(d=>d.name+' · '+(d.loaded?'已载入':'未载入')).join('；')||'未登记数据集轴';
  const selected=new Set(ids),missing=ids.filter(id=>!gene.variants.some(v=>v.id===id));
  const presets=schemes.filter(s=>s.kind==='literature');
  const preview=resolveSites(gene,{markerIds:ids,assembly:gene.assembly});
  const visible=rows.filter(({v,kind})=>[v.id,String(v.pos),v.feature,markerNames[kind]].join(' ').toLowerCase().includes(query.toLowerCase().trim()));
  const hasIndel=rows.some(row=>row.kind!=='SNP');
  function preset(predicate){setIds(rows.filter(predicate).map(({v})=>v.id));}
  return <><Button variant="soft" onClick={()=>{setIds(selection?.markerIds||initialIds);setQuery('');setOpen(true);}} aria-label={gene.name+' 自选单倍型位点'}>自选位点{selection?' · '+selection.markerIds.length:''}</Button>
    <Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Content maxWidth="960px" className="site-picker"><Dialog.Title>{gene.name} · 自选单倍型位点</Dialog.Title><Dialog.Description>选择用于单倍型组合的位点。</Dialog.Description>
      <div className="site-presets"><button onClick={()=>preset(()=>true)}>全选</button><button onClick={()=>setIds([])}>清空</button><button onClick={()=>preset(({v})=>/CDS/i.test(v.feature||''))}>仅 CDS</button><button onClick={()=>preset(({v})=>/promoter|启动子|上游/i.test(v.feature||''))}>仅启动子</button>
        {hasIndel&&<>
          <button disabled={!rows.some(row=>row.kind==='SNP')} onClick={()=>preset(({kind})=>kind==='SNP')}>仅 SNP</button>
          <button onClick={()=>preset(({kind})=>kind!=='SNP')}>仅 InDel</button>
        </>}
        {presets.length>0&&<select aria-label="文献位点预设" value="" onChange={e=>{const s=presets.find(s=>s.id===e.target.value);if(s)setIds(s.markers.map(v=>v.id));}}><option value="">文献位点预设…</option>{presets.map((s,i)=><option key={s.id} value={s.id} disabled={!s.ready}>{presetTitle(s)} · {s.positions.length} 位点{s.ready?'':'（未完整覆盖）'}</option>)}</select>}
        <input type="search" aria-label="搜索自选位点" placeholder="坐标 / 区域 / 类型" value={query} onChange={e=>setQuery(e.target.value)}/>
      </div>
      {presets.some(s=>s.provenance)&&<details><summary>预设出处 / Preset provenance</summary>{presets.filter(s=>s.provenance).map(s=><p key={s.id}><a href={'https://doi.org/'+s.provenance.doi} target="_blank" rel="noreferrer">{s.provenance.title}</a> · {s.provenance.locator}<br/>{s.provenance.summary}<br/>{s.provenance.caveat}</p>)}</details>}
      <p className="selection-status" role="status">已选 {ids.length} / {gene.variants.length} 位点 · {gene.chromosome} · {gene.assembly}{missing.length>0&&' · '+missing.length+' 个位点在当前数据中不可用'}{!ids.length&&' · 不生成组合'}</p>
      {selection?.assembly&&selection.assembly!==gene.assembly&&<p role="alert">原选择来自 {selection.assembly}，请核对当前参考版本后重新选择。</p>}
      {missing.length>0&&<div className="unavailable-sites">未覆盖：{missing.map(id=><button key={id} onClick={()=>setIds(ids.filter(x=>x!==id))}>移除 {id} ×</button>)}</div>}
      <div className="site-table-scroll"><table className="individual-table">
        <thead><tr><th>选择</th><th>位置 / 标记</th><th>REF → ALT</th><th>区域</th><th>MAF</th><th>Missing</th><th>支持数据集</th></tr></thead>
        <tbody>{visible.map(({v,stats,kind,ref,alts})=><tr key={v.id} className={selected.has(v.id)?'selected-person':''}>
          <td><input type="checkbox" aria-label={'纳入位点 '+v.id} checked={selected.has(v.id)} onChange={e=>setIds(e.target.checked?[...ids,v.id]:ids.filter(id=>id!==v.id))}/></td>
          <th scope="row"><MarkerIcon kind={kind}/>{v.pos.toLocaleString()}<small>{markerNames[kind]} · {v.msu_site_id||v.id}</small></th>
          <td>{ref} → {alts.join(' / ')||'—'}</td><td>{v.feature||'未注释'}</td><td>{percent(stats.maf)}</td><td>{percent(stats.missing)}</td><td className="site-dataset-support">{supportText(v.id)}</td>
        </tr>)}{metadataOnly.map(([id])=><tr key={id} className="metadata-marker"><td><input type="checkbox" disabled aria-label={'尚未载入位点 '+id}/></td><th scope="row">{id}<small>位点元数据 · 分型未载入</small></th><td>—</td><td>—</td><td>—</td><td>—</td><td className="site-dataset-support">{supportText(id)}</td></tr>)}</tbody>
      </table>{!visible.length&&!metadataOnly.length&&<p>没有符合条件的位点。</p>}</div>
      <p className="footnote">自选模式使用已勾选的分型位点，不受 MAF／缺失阈值筛除；未测位点不作推断。</p>
      <div className="dialog-actions"><span>{preview.ready?'将联动更新组合、成员与频率':'当前选择无法完整判型'}</span><div>{onAutomatic&&<Button variant="soft" onClick={()=>{onAutomatic();setOpen(false);}}>恢复 QC 自动选择</Button>} <Dialog.Close><Button variant="soft">取消</Button></Dialog.Close> <Button onClick={()=>{onApply({assembly:gene.assembly,markerIds:preview.markerIds});setOpen(false);}}>应用位点</Button></div></div>
    </Dialog.Content></Dialog.Root></>;
}
