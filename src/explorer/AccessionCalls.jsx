import {callOf} from './catalog.js';
import {gtToken} from './model.js';
import {matchesMaterial,saveFile,writeTSV,materialRow} from './formats.js';
import React,{useState} from 'react';
import {Button,Dialog} from '@radix-ui/themes';

export function DoiLinks({values,papers}){
  return <>{values.map(d=><React.Fragment key={d}> <a className="doi-link" href={'https://doi.org/'+d} title={papers[d]} target="_blank" rel="noreferrer">{d}</a> </React.Fragment>)}</>;
}
export function AccessionCalls({gene,selected,evidence,cohort,literature}){
  const [open,setOpen]=useState(false),[marker,setMarker]=useState(''),[search,setSearch]=useState(''),[limit,setLimit]=useState(40);
  const v=gene.variants.find(v=>v.id===marker)||selected||gene.variants[0];
  const rows=open?cohort.filter(s=>matchesMaterial(s,search)):[];
  function download(){const fields=['accession_id','original_name','dataset_id','source_sample_id','material_type','source_group','display_group','genotype_evidence',v.id];saveFile('riceflux_'+v.id.replace(':','_')+'.tsv',writeTSV(fields,rows.map(s=>({...materialRow(s),[v.id]:gtToken(callOf(s,v),v).replaceAll('·','.')}))),'text/tab-separated-values');}
  return <div className="accession-source">
    <Button size="1" variant="soft" onClick={()=>{setMarker(selected?.id||gene.variants[0].id);setLimit(40);setOpen(true)}}>查看当前 {cohort.length.toLocaleString()} 份材料分型</Button>
    <Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Content maxWidth="760px"><Dialog.Title>{gene.name} · 逐材料分型</Dialog.Title><Dialog.Description>按当前数据集与群体选择展示。· 为缺失；品种名沿用原始名录。</Dialog.Description>
    <div className="accession-filters"><label>位点<select value={v.id} onChange={e=>setMarker(e.target.value)}>{gene.variants.map(v=><option key={v.id}>{v.id}</option>)}</select></label><label>材料编号或品种名<input type="search" value={search} onChange={e=>{setSearch(e.target.value);setLimit(40)}}/></label></div>
    <p>{rows.length.toLocaleString()} 份材料</p><div className="matrix-scroll accession-table"><table className="individual-table"><thead><tr>{['材料编号','品种名','数据集 / 来源组','登记亚群','正链分型'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.slice(0,limit).map(s=><tr key={s.id}><td>{s.source_sample_id||s.id}</td><td>{s.name}</td><td>{s.dataset_name} / {s.source_group||s.population_id}</td><td>{s.subspecies}</td><td>{gtToken(callOf(s,v),v)}</td></tr>)}</tbody></table></div>
    {rows.length>limit&&<Button onClick={()=>setLimit(n=>n+100)}>显示更多材料</Button>}<div className="dialog-actions"><button onClick={download}>下载当前分型 TSV</button><Dialog.Close><Button>关闭</Button></Dialog.Close></div></Dialog.Content></Dialog.Root>
  </div>;
}
