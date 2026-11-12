import React,{useState,useEffect,useMemo} from 'react';
import {Button,Dialog} from '@radix-ui/themes';
import {readText} from './observed.js';

const download='./prior/accession_genotypes_6044.tsv.gz';
export function DoiLinks({values,papers}){
  return <>{values.map(d=><React.Fragment key={d}> <a className="doi-link" href={'https://doi.org/'+d} title={papers[d]} target="_blank" rel="noreferrer">{d}</a> </React.Fragment>)}</>;
}
function SiteEvidence({marker,evidence}){
  const row=evidence.sites[marker];
  if(!row)return null;
  return <div className="site-evidence"><strong>{marker} · {row.level}</strong><p>{row.note}</p>
    {[[row.primary,'功能等位原文'],[row.event,'事件来源'],[row.background,'基因背景文献']].filter(([ds])=>ds.length).map(([ds,label])=>
      <details key={label} open={label==='功能等位原文'}><summary>{label}（{ds.length}）</summary><DoiLinks values={ds} papers={evidence.papers}/></details>)}
  </div>;
}
export function parseCallArchive(text){
  const [header,...lines]=text.trimEnd().split('\n'), fields=header.split('\t');
  const markers=fields.slice(7);
  if(fields.slice(0,7).join(',')!=='accession_id,ped_id,id_match,name,type,indica_japonica,source_group'||new Set(markers).size!==markers.length)throw Error('材料分型表头无效');
  const samples=lines.map(line=>{
    const [id,ped,match,name,type,subspecies,group,...pairs]=line.split('\t');
    if(pairs.length!==markers.length)throw Error('材料位点数与字典不一致');
    return {id,ped,match,name,type,subspecies,group,gt:pairs.join('')};
  });
  return {samples,markers};
}
let archivePromise;
function loadArchive(){
  if(!archivePromise)archivePromise=readText(download).then(parseCallArchive).catch(e=>{archivePromise=undefined;throw e});
  return archivePromise;
}
export function AccessionCalls({gene,selected,evidence}){
  const [open,setOpen]=useState(false),[marker,setMarker]=useState(''),[archive,setArchive]=useState(null),[error,setError]=useState('');
  const [kind,setKind]=useState('all'),[search,setSearch]=useState(''),[limit,setLimit]=useState(40),[retry,setRetry]=useState(0);
  useEffect(()=>{if(!open||archive)return;let active=true;setError('');loadArchive().then(v=>{if(active)setArchive(v)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[open,archive,retry]);
  const column=archive?.markers.indexOf(marker)??-1;
  const rows=useMemo(()=>{
    const term=search.trim().toLowerCase();
    return (archive?.samples||[]).filter(s=>(kind==='all'||s.type===kind||(kind==='flagged'&&s.match!=='exact')) &&
      (!term||[s.id,s.ped,s.name].some(v=>v.toLowerCase().includes(term))));
  },[archive,kind,search]);
  return <div className="accession-source">
    {selected && <SiteEvidence marker={selected.id} evidence={evidence}/>}
    <Button size="1" variant="soft" onClick={()=>{setMarker(selected?.id||gene.variants[0].id);setLimit(40);setOpen(true)}}>查询 6,044 份材料分型</Button>
    <Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Content maxWidth="760px">
      <Dialog.Title>{gene.name} · 逐材料分型</Dialog.Title>
      <Dialog.Description>登记现代品种 5,222 份、地方品种 822 份。带 #1 的 14 份材料在原文中标为亚种归属有分歧，保留原始分型。</Dialog.Description>
      <div className="accession-filters">
        <label>位点<select value={marker} onChange={e=>setMarker(e.target.value)}>{gene.variants.map(v=><option key={v.id}>{v.id}</option>)}</select></label>
        <label>材料类别<select value={kind} onChange={e=>{setKind(e.target.value);setLimit(40)}}><option value="all">全部材料</option><option value="modern cultivar">现代品种</option><option value="landrace">地方品种</option><option value="flagged">#1 亚种归属有分歧</option></select></label>
        <label>材料编号或品种名<input type="search" value={search} onChange={e=>{setSearch(e.target.value);setLimit(40)}}/></label>
      </div>
      <SiteEvidence marker={marker} evidence={evidence}/>
      {error?<p role="alert">{error} <button onClick={()=>setRetry(n=>n+1)}>重新读取</button></p>:!archive?<p role="status">读取原始分型…</p>:column<0?<p role="alert">逐材料分型表中没有该位点。</p>:<>
        <p className="footnote">{rows.length.toLocaleString()} 份符合筛选 · 0 或 N 为原始缺失码</p>
        <div className="matrix-scroll accession-table"><table className="individual-table"><thead><tr>{['名录编号 / PED','品种名','类别','登记亚种 / 群体','正链分型'].map(h=><th key={h}>{h}</th>)}</tr></thead>
          <tbody>{rows.slice(0,limit).map(s=><tr key={s.id}><td>{s.id}{s.id!==s.ped&&<small> PED {s.ped}</small>}</td><td>{s.name}</td><td>{s.type==='landrace'?'地方品种':'现代品种'}</td><td>{s.subspecies} / {s.group}{s.match!=='exact'?' · 归属有分歧':''}</td><td>{s.gt.slice(2*column,2*column+2).split('').join('/')}</td></tr>)}</tbody></table></div>
        {rows.length>limit&&<Button size="1" variant="ghost" onClick={()=>setLimit(n=>n+100)}>显示更多材料</Button>}
      </>}
      <div className="dialog-actions"><a className="doi-link" href={download} download>下载全部材料 × 254 位点（TSV.GZ）</a><Dialog.Close><Button>关闭</Button></Dialog.Close></div>
    </Dialog.Content></Dialog.Root>
  </div>;
}
