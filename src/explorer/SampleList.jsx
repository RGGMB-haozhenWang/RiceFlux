import React,{useMemo,useState} from 'react';
import {Button,Dialog} from '@radix-ui/themes';
import {fileText,resolveSampleList} from './dataImport.js';
import {saveFile,writeTSV} from './formats.js';

export function SampleList({data,onApply}) {
  const [open,setOpen]=useState(false),[text,setText]=useState(''),[dataset,setDataset]=useState('all'),[error,setError]=useState('');
  const activeDataset=data.meta.datasets.some(d=>d.id===dataset)?dataset:'all';
  const result=useMemo(()=>{
    if(!text.trim())return {rows:[],error:''};
    try{return {rows:resolveSampleList(text,data.individuals,activeDataset),error:''};}
    catch(e){return {rows:[],error:e.message};}
  },[text,data,activeDataset]);
  const matched=[...new Map(result.rows.filter(r=>r.sample).map(r=>[r.sample.id,r.sample])).values()];
  const unknown=result.rows.filter(r=>r.status==='unknown'),ambiguous=result.rows.filter(r=>r.status==='ambiguous');
  const problems=[...unknown,...ambiguous];
  function downloadExample(){
    const samples=data.individuals.filter(s=>activeDataset==='all'||s.dataset_id===activeDataset);
    const first=samples[0];
    const second=samples.find(s=>s.population_id!==first?.population_id)??samples[1];
    const rows=[first,second].filter(Boolean).map(s=>({sample_id:s.source_sample_id||s.id,dataset_id:s.dataset_id}));
    saveFile('riceflux_sample_list.tsv',writeTSV(['sample_id','dataset_id'],rows),'text/tab-separated-values');
  }
  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Trigger><Button variant="soft" size="2">导入样本名单</Button></Dialog.Trigger>
    <Dialog.Content maxWidth="640px">
      <Dialog.Title>样本名单圈定群体 / Sample list</Dialog.Title>
      <Dialog.Description>一行一个编号，或上传包含 sample_id、可选 dataset_id 的 TSV。应用后按匹配材料重算。</Dialog.Description>
      <div className="compare-tools"><label>数据集 <select value={activeDataset} onChange={e=>setDataset(e.target.value)}><option value="all">所有已加载数据集</option>{data.meta.datasets.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
      <label className="file-button">上传名单<input type="file" aria-label="读取样本名单" accept=".txt,.tsv,.gz" onChange={async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;setError('');try{setText(await fileText(file));}catch(err){setError(err.message);}}}/></label><button onClick={downloadExample}>下载本库示例 TSV</button></div>
      <textarea className="sample-list-input" aria-label="粘贴样本编号" rows={7} value={text} onChange={e=>setText(e.target.value)}/>
      {(error||result.error)&&<p role="alert">{error||result.error}</p>}
      <p role="status">匹配 {matched.length} 份 · 未找到 {unknown.length} 条 · 需指定数据集 {ambiguous.length} 条</p>
      {problems.length>0&&<p>{problems.slice(0,8).map(r=>r.sample_id).join('、')}{problems.length>8?'…':''}</p>}
      <div className="dialog-actions"><button disabled={!result.rows.length} onClick={()=>saveFile('riceflux_sample_list_matches.tsv',writeTSV(['dataset_id','sample_id','status','matched_dataset','matched_accession'],result.rows.map(r=>({...r,matched_dataset:r.sample?.dataset_id,matched_accession:r.sample?.id}))),'text/tab-separated-values')}>下载匹配明细</button>
        <Button disabled={!matched.length} onClick={()=>{onApply(matched);setOpen(false);}}>应用匹配材料</Button></div>
    </Dialog.Content>
  </Dialog.Root>;
}
