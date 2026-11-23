import React,{useMemo,useState,useEffect} from 'react';
import {Button,Dialog} from '@radix-ui/themes';
import {datasetFiles,datasetTableKeys,combineDatasets,groupOptions,sampleTable} from './datasets.js';
import {loadRegistered} from './observed.js';
import {saveFile} from './formats.js';
import {DatasetProvenance} from './DatasetProvenance.jsx';
import {importDatasetFiles} from './dataImport.js';
import {datasetIntake,semanticManifest} from './inputSchema.js';
import {datasetBadge,datasetTint} from './datasetColors.js';
const RiceNaviPanel=React.lazy(()=>import('./RiceNaviPanel.jsx').then(m=>({default:m.RiceNaviPanel})));
import {validateDataset} from './model.js';

export function DataPanel({data,onApply,gene}){
  const [open,setOpen]=useState(false),[entries,setEntries]=useState(data.datasetRegistry),[loaded,setLoaded]=useState(new Map(data.datasetBundles.map(b=>[b.manifest.id,b])));
  const [ids,setIds]=useState(data.meta.datasets.map(d=>d.id)),[group,setGroup]=useState(data.meta.groupBy),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [previewId,setPreview]=useState(data.meta.datasets[0].id),[table,setTable]=useState('samples');
  const [importMode,setImportMode]=useState('package'),[importName,setImportName]=useState(''),[importSource,setImportSource]=useState(''),[importEvidence,setImportEvidence]=useState('G_chip');
  const [showTables,setShowTables]=useState(false),[readTable,setReadTable]=useState(null),[retryTable,setRetryTable]=useState(0);
  function changeOpen(next){
    setOpen(next);
    if(!next){setShowTables(false);setReadTable(null);}
  }
  useEffect(()=>{setEntries(data.datasetRegistry);setIds(data.meta.datasets.map(d=>d.id));setGroup(data.meta.groupBy);setLoaded(prev=>new Map([...prev,...data.datasetBundles.map(b=>[b.manifest.id,b])]));setPreview(data.meta.datasets[0].id);},[data]);
  function cachedBundle(id){
    const bundle=loaded.get(id);
    return bundle?.manifest.version===entries.find(r=>r.id===id)?.version?bundle:undefined;
  }
  async function readDataset(id){
    const cached=cachedBundle(id);
    if(cached)return cached;
    const row=entries.find(r=>r.id===id);
    if(!row||row.local)throw Error('数据集版本不可用：'+id);
    return loadRegistered(import.meta.env.BASE_URL,row,data.reference);
  }
  const bundle=cachedBundle(previewId);
  const rice6044=entries.find(r=>r.id==='rice6044'&&!r.local)?.manifest?.split('/')[0];
  const tables=bundle?datasetTableKeys(bundle.manifest):datasetFiles;
  const tableState=readTable&&readTable.bundle===bundle&&readTable.key===table?readTable:null;
  const tableText=bundle?.texts?.[table]??tableState?.text;
  useEffect(()=>{
    if(!open||!showTables||!bundle?.sourceText||!datasetTableKeys(bundle.manifest).includes(table))return;
    let active=true;
    setReadTable(null);
    bundle.sourceText(table).then(text=>{
      if(active)setReadTable({bundle,key:table,text});
    },error=>{
      if(active)setReadTable({bundle,key:table,error:error.message});
    });
    return()=>{active=false;};
  },[open,showTables,bundle,table,retryTable]);
  const preview=useMemo(()=>{
    if(!open||!showTables||!tableText)return null;
    const lines=tableText.trimEnd().split('\n');
    return {fields:lines[0].split('\t'),count:lines.length-1,rows:lines.slice(1,13).map(line=>line.split('\t'))};
  },[open,showTables,tableText]);
  async function upload(event){
    const selected=[...event.target.files];event.target.value='';if(!selected.length)return;
    setError('');setBusy(true);
    try{
      const stamp='local-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
      const metadata={id:stamp,version:stamp,name:importName,source:importSource,genotype_evidence:importEvidence};
      const {bundle:parsed,override}=await importDatasetFiles(selected,
        {mode:importMode,metadata,target:bundle,registry:entries,reference:data.reference});
      validateDataset(combineDatasets(data.reference,[parsed]));
      const {id,name,version}=parsed.manifest,newEntry={id,name,version,local:true};
      setLoaded(prev=>new Map(prev).set(id,parsed));setEntries(prev=>override?prev.map(r=>r.id===id?newEntry:r):[...prev,newEntry]);
      setIds(prev=>prev.includes(id)?prev:[...prev,id]);setPreview(id);if(!override)setGroup('dataset_group');
    }catch(e){setError(e.message);}finally{setBusy(false);}
  }
  async function previewDataset(id){
    setPreview(id);setTable('samples');setError('');if(cachedBundle(id))return;setBusy(true);
    try{const b=await readDataset(id);setLoaded(prev=>new Map(prev).set(id,b));}catch(e){setError(e.message)}finally{setBusy(false)}
  }
  async function apply(){
    setBusy(true);setError('');
    try{
      const bundles=await Promise.all(ids.map(readDataset));
      const next=validateDataset(combineDatasets(data.reference,bundles,group,entries));
      await onApply(next);
      setLoaded(prev=>new Map([...prev,...bundles.map(b=>[b.manifest.id,b])]));
      changeOpen(false);
    }catch(e){setError(e.message);}finally{setBusy(false);}
  }
  function downloadManifest(semantic){
    const m={...bundle.manifest,files:Object.fromEntries(tables.map(key=>[key,key+'.txt']))};
    delete m.packed;
    saveFile(semantic?'manifest.jsonld':'manifest.json',JSON.stringify(semantic?semanticManifest(m):m,null,2)+'\n',
      semantic?'application/ld+json':'application/json');
  }
  return <><Button variant="soft" color="gray" onClick={()=>changeOpen(true)}>数据接口 / Data · {data.meta.datasets.length}</Button>
  <Dialog.Root open={open} onOpenChange={changeOpen}><Dialog.Content maxWidth="960px" className="dataset-dialog">
    <Dialog.Title>数据集与溯源 / Data sources</Dialog.Title><Dialog.Description>选择数据集，预览或导入材料。</Dialog.Description>
    <div className="dataset-list">{entries.map(r=><label key={r.id}><input type="checkbox" checked={ids.includes(r.id)} disabled={busy} onChange={e=>setIds(prev=>e.target.checked?[...prev,r.id]:prev.filter(id=>id!==r.id))}/><strong><span className="source-badge dataset-tint" style={datasetTint(r.id,entries)}>{datasetBadge(r.id,entries)}</span> {r.name}</strong><small>{r.id} · {r.version}{r.local?' · 本地导入':''}</small><button onClick={e=>{e.preventDefault();previewDataset(r.id)}} disabled={busy}>来源 / 预览</button></label>)}</div>
    <div className="compare-tools"><label>比较维度 <select aria-label="比较维度" value={group} onChange={e=>setGroup(e.target.value)}>{groupOptions.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
      <a href="./datasets/README.txt" target="_blank" rel="noreferrer">输入格式 / Load data</a><a href="./formats/dataset-intake.json" target="_blank" rel="noreferrer">本体规范 / Ontology</a><a href="./datasets/examples/riceflux_import_examples.zip" download>导入样例 / Templates</a>{rice6044&&<a href={'./datasets/'+rice6044+'.zip'} download>6044 TSV</a>}<a href="./datasets/ricenavi-v1.zip" download>RiceNavi TSV</a>
      <button onClick={()=>saveFile('riceflux_selected_samples.tsv',sampleTable(data),'text/tab-separated-values')}>当前材料与分组 TXT</button>
    </div><p className="footnote">同名材料按数据集分别统计；设置可保存到工作区。</p>
    <details className="dataset-import"><summary>导入基因型 / 表型 · Import data</summary>
      <div className="compare-tools"><select aria-label="数据导入方式" value={importMode} onChange={e=>setImportMode(e.target.value)}>{Object.entries(datasetIntake.profiles).map(([key,profile])=><option key={key} value={key}>{profile.label}</option>)}</select>
        {['new','observations'].includes(importMode)&&<input aria-label="本地数据集名称" placeholder="数据集名称" value={importName} onChange={e=>setImportName(e.target.value)}/>}
        {importMode!=='package'&&<input aria-label="导入数据来源" placeholder="来源说明或 DOI" value={importSource} onChange={e=>setImportSource(e.target.value)}/>}
        {datasetIntake.profiles[importMode].allowVcf&&<select aria-label="导入分型证据" value={importEvidence} onChange={e=>setImportEvidence(e.target.value)}>{datasetIntake.genotypeEvidence.filter(value=>value!=='G_none').map(value=><option key={value}>{value}</option>)}</select>}
        <label className="file-button">选择文件<input aria-label="导入数据集" type="file" multiple accept=".json,.jsonld,.tsv,.txt,.vcf,.gz,.bgz" onChange={upload} disabled={busy}/></label>
      </div>
      <p className="footnote">{datasetIntake.profiles[importMode].requires&&(bundle?.manifest.name||'先预览目标')+' · '}{datasetIntake.profiles[importMode].hint}</p>
    </details>
    {error&&<p role="alert">{error}</p>}{busy&&<p role="status">正在校验并读取数据…</p>}
    {bundle&&<><DatasetProvenance data={data} bundle={bundle}/><details onToggle={e=>{setShowTables(e.currentTarget.open);if(!e.currentTarget.open)setReadTable(null);}}><summary>原始表格预览 / Source tables · {bundle.manifest.name}</summary><div className="compare-tools"><select aria-label="预览表格" value={table} onChange={e=>setTable(e.target.value)}>{tables.map(key=><option key={key}>{key}</option>)}</select><button disabled={!tableText} onClick={()=>saveFile(table+'.txt',tableText,'text/tab-separated-values;charset=utf-8')}>下载当前 TXT</button><button onClick={()=>downloadManifest(false)}>下载输入清单</button><button onClick={()=>downloadManifest(true)}>下载 JSON-LD 清单</button></div>
    {preview?<p className="footnote">{preview.count.toLocaleString()} 行 × {preview.fields.length.toLocaleString()} 列 · 预览前 12 行、8 列</p>:tableState?.error?<p role="alert">{tableState.error} <button onClick={()=>{setReadTable(null);setRetryTable(n=>n+1);}}>重试</button></p>:showTables&&<p role="status">正在读取原始表…</p>}
    {preview&&<div className="matrix-scroll"><table className="individual-table"><thead><tr>{preview.fields.slice(0,8).map(k=><th key={k}>{k}</th>)}</tr></thead><tbody>{preview.rows.slice(0,12).map((row,i)=><tr key={i}>{row.slice(0,8).map((value,j)=><td key={j}>{value}</td>)}</tr>)}</tbody></table></div>}</details></>}
    <details><summary>RiceNavi 完整来源库 / All source records</summary>{open&&<React.Suspense fallback={<p>Loading…</p>}><RiceNaviPanel gene={gene}/></React.Suspense>}</details><div className="dialog-actions"><span>{ids.length} 个数据集已选择</span><Dialog.Close><Button variant="soft" color="gray">关闭</Button></Dialog.Close><Button disabled={busy||!ids.length} onClick={apply}>应用数据集 / Apply</Button></div>
  </Dialog.Content></Dialog.Root></>;
}
