import React,{useMemo,useState} from 'react';
import {Button,Dialog} from '@radix-ui/themes';
import {datasetFiles,readPackage,combineDatasets,groupOptions,sampleTable} from './datasets.js';
import {loadRegistered} from './observed.js';
import {saveFile} from './formats.js';
import {validateDataset} from './model.js';

async function fileText(file){
  const bytes=new Uint8Array(await file.arrayBuffer());
  return bytes[0]===31&&bytes[1]===139?new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text():new TextDecoder().decode(bytes);
}
export function DataPanel({data,onApply}){
  const [open,setOpen]=useState(false),[entries,setEntries]=useState(data.datasetRegistry),[loaded,setLoaded]=useState(new Map(data.datasetBundles.map(b=>[b.manifest.id,b])));
  const [ids,setIds]=useState(data.meta.datasets.map(d=>d.id)),[group,setGroup]=useState(data.meta.groupBy),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [previewId,setPreview]=useState(data.meta.datasets[0].id),[table,setTable]=useState('samples');
  const bundle=loaded.get(previewId);
  const preview=useMemo(()=>{if(!open||!bundle)return null;const lines=bundle.texts[table].trimEnd().split('\n');return {fields:lines[0].split('\t'),count:lines.length-1,rows:lines.slice(1,13).map(line=>line.split('\t'))};},[open,bundle,table]);
  async function upload(event){
    const files=[...event.target.files];event.target.value='';if(!files.length)return;
    setError('');setBusy(true);
    try{
      if(new Set(files.map(f=>f.name)).size!==files.length)throw Error('请一次导入一个数据集目录，文件名不可重复');
      const file=files.find(f=>f.name==='manifest.json');if(!file)throw Error('请同时选择 manifest.json 和五个 TSV/TSV.GZ 文件');
      const manifest=JSON.parse(await file.text());
      if(entries.some(r=>r.id===manifest.id))throw Error('数据集 ID 已存在。新版本请使用新的 id，并登记 version');
      const parsed=await readPackage(manifest,async name=>{const f=files.find(x=>x.name===name);if(!f)throw Error('缺少 '+name);return fileText(f);},data.reference);
      validateDataset(combineDatasets(data.reference,[parsed]));
      setLoaded(prev=>new Map(prev).set(manifest.id,parsed));setEntries(prev=>[...prev,{id:manifest.id,name:manifest.name,version:manifest.version,local:true}]);
      setIds(prev=>[...prev,manifest.id]);setPreview(manifest.id);setGroup('dataset_group');
    }catch(e){setError(e.message);}finally{setBusy(false);}
  }
  async function apply(){
    setBusy(true);setError('');
    try{
      const cache=new Map(loaded),bundles=[];
      for(const id of ids){
        if(!cache.has(id))cache.set(id,await loadRegistered(import.meta.env.BASE_URL,entries.find(r=>r.id===id),data.reference));
        bundles.push(cache.get(id));
      }
      const next=validateDataset(combineDatasets(data.reference,bundles,group));
      onApply({...next,reference:data.reference,datasetRegistry:entries,datasetBundles:bundles});setLoaded(cache);setOpen(false);
    }catch(e){setError(e.message);}finally{setBusy(false);}
  }
  function downloadManifest(){
    const m={...bundle.manifest,files:Object.fromEntries(datasetFiles.map(key=>[key,key+'.tsv']))};
    saveFile('manifest.json',JSON.stringify(m,null,2)+'\n','application/json');
  }
  return <><Button variant="soft" color="gray" onClick={()=>setOpen(true)}>数据集 · {data.meta.datasets.length}</Button>
  <Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Content maxWidth="960px" className="dataset-dialog">
    <Dialog.Title>数据集与群体比较</Dialog.Title><Dialog.Description>选择数据集、比较维度；TSV 可下载、预览及重新导入。</Dialog.Description>
    <div className="dataset-list">{entries.map(r=><label key={r.id}><input type="checkbox" checked={ids.includes(r.id)} disabled={busy} onChange={e=>setIds(prev=>e.target.checked?[...prev,r.id]:prev.filter(id=>id!==r.id))}/><strong>{r.name}</strong><small>{r.id} · {r.version}{r.local?' · 本次会话':''}</small><button onClick={e=>{e.preventDefault();setPreview(r.id)}} disabled={!loaded.has(r.id)}>预览</button></label>)}</div>
    <div className="compare-tools"><label>比较维度 <select aria-label="比较维度" value={group} onChange={e=>setGroup(e.target.value)}>{groupOptions.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
      <label className="file-button">导入数据集<input aria-label="导入数据集" type="file" multiple accept=".json,.tsv,.txt,.gz" onChange={upload} disabled={busy}/></label>
      <a href="./datasets/README.txt" target="_blank" rel="noreferrer">接口规范</a><a href="./datasets/rice6044-v1.zip" download>6044 完整 TSV 包</a>
      <button onClick={()=>saveFile('riceflux_selected_samples.tsv',sampleTable(data),'text/tab-separated-values')}>当前材料与分组 TSV</button>
    </div><p className="footnote">导入仅保留在本次浏览器会话；发布新数据集时更新 datasets/index.tsv。不同数据集中的同名材料按独立记录保留，重叠队列请分开统计。</p>
    {error&&<p role="alert">{error}</p>}{busy&&<p role="status">正在校验并读取数据…</p>}
    {bundle&&<><h3>{bundle.manifest.name} · {bundle.manifest.genotype_evidence} · 表格预览</h3><div className="compare-tools"><select aria-label="预览表格" value={table} onChange={e=>setTable(e.target.value)}>{datasetFiles.map(key=><option key={key}>{key}</option>)}</select><button onClick={()=>saveFile(table+'.tsv',bundle.texts[table],'text/tab-separated-values;charset=utf-8')}>下载当前 TSV</button><button onClick={downloadManifest}>下载输入清单</button></div>
    <p className="footnote">{preview?.count.toLocaleString()} 行 × {preview?.fields.length.toLocaleString()} 列 · 预览前 12 行、8 列</p>
    {preview&&<div className="matrix-scroll"><table className="individual-table"><thead><tr>{preview.fields.slice(0,8).map(k=><th key={k}>{k}</th>)}</tr></thead><tbody>{preview.rows.slice(0,12).map((row,i)=><tr key={i}>{row.slice(0,8).map((value,j)=><td key={j}>{value}</td>)}</tr>)}</tbody></table></div>}</>}
    <div className="dialog-actions"><span>{ids.length} 个数据集已选择</span><Dialog.Close><Button variant="soft" color="gray">关闭</Button></Dialog.Close><Button disabled={busy||!ids.length} onClick={apply}>应用数据集</Button></div>
  </Dialog.Content></Dialog.Root></>;
}
