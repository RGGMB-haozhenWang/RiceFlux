import React,{useMemo,useState,useEffect} from 'react';
import {Button,Dialog} from '@radix-ui/themes';
import {datasetFiles,readPackage,combineDatasets,groupOptions,sampleTable} from './datasets.js';
import {loadRegistered} from './observed.js';
import {saveFile} from './formats.js';
import {DatasetProvenance} from './DatasetProvenance.jsx';
import {createLocalDataset,extendDataset,fileText} from './dataImport.js';
import {datasetBadge,datasetTint} from './datasetColors.js';
const RiceNaviPanel=React.lazy(()=>import('./RiceNaviPanel.jsx').then(m=>({default:m.RiceNaviPanel})));
import {validateDataset} from './model.js';

const ext=/(?:\.tsv|\.txt)(?:\.gz)?$/i;
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
  const bundle=loaded.get(previewId);
  const tableState=readTable&&readTable.bundle===bundle&&readTable.key===table?readTable:null;
  const tableText=bundle?.texts?.[table]??tableState?.text;
  useEffect(()=>{
    if(!open||!showTables||!bundle?.sourceText)return;
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
      if(new Set(selected.map(f=>f.name)).size!==selected.length)throw Error('请一次导入一个数据集目录，文件名不可重复');
      let parsed,override=false;
      if(importMode==='package'){
        const file=selected.find(f=>f.name==='manifest.json');if(!file)throw Error('请同时选择 manifest.json 和五个 TSV/TSV.GZ 文件');
        const manifest=JSON.parse(await file.text());
        if(entries.some(r=>r.id===manifest.id))throw Error('该数据集 ID 已存在，请使用新 ID');
        parsed=await readPackage(manifest,async name=>{const f=selected.find(x=>x.name===name);if(!f)throw Error('缺少 '+name);return fileText(f);},data.reference);
      }else{
        const permitted=importMode==='phenotypes'?['environments','phenotypes']:importMode==='genotypes'?['variants','genotypes']:datasetFiles;
        const keys=selected.map(f=>f.name.replace(ext,''));
        if(new Set(keys).size!==keys.length||keys.some(k=>!permitted.includes(k)))throw Error('请按所选导入方式提供命名正确的表格');
        const input=Object.fromEntries(await Promise.all(selected.map(async(f,i)=>[keys[i],await fileText(f)])));
        const stamp=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
        const metadata={id:'local-'+stamp,version:'local-'+stamp,name:importName,source:importSource,genotype_evidence:importEvidence};
        if(importMode==='new')parsed=createLocalDataset(input,metadata,data.reference);
        else{
          if(!bundle)throw Error('先预览一个目标数据集');
          const source=bundle.sourceBundle?await bundle.sourceBundle():bundle;
          parsed=extendDataset(source,importMode,input,metadata,data.reference);
          if(!entries.find(e=>e.id===bundle.manifest.id)?.local||bundle.overlays){
            parsed.baseVersion=bundle.baseVersion||bundle.manifest.version;
            parsed.overlays=[...(bundle.overlays||[]),{kind:importMode,input,metadata}];
          }
          override=true;
        }
      }
      validateDataset(combineDatasets(data.reference,[parsed]));
      const {id,name,version}=parsed.manifest,newEntry={id,name,version,local:true};
      setLoaded(prev=>new Map(prev).set(id,parsed));setEntries(prev=>override?prev.map(r=>r.id===id?newEntry:r):[...prev,newEntry]);
      setIds(prev=>prev.includes(id)?prev:[...prev,id]);setPreview(id);if(!override)setGroup('dataset_group');
    }catch(e){setError(e.message);}finally{setBusy(false);}
  }
  async function previewDataset(id){
    setPreview(id);if(loaded.has(id))return;setBusy(true);setError('');
    try{const b=await loadRegistered(import.meta.env.BASE_URL,entries.find(r=>r.id===id),data.reference);setLoaded(prev=>new Map(prev).set(id,b));}catch(e){setError(e.message)}finally{setBusy(false)}
  }
  async function apply(){
    setBusy(true);setError('');
    try{
      const cache=new Map(loaded),bundles=[];
      for(const id of ids){
        if(!cache.has(id))cache.set(id,await loadRegistered(import.meta.env.BASE_URL,entries.find(r=>r.id===id),data.reference));
        bundles.push(cache.get(id));
      }
      const next=validateDataset(combineDatasets(data.reference,bundles,group,entries));
      await onApply({...next,reference:data.reference,datasetRegistry:entries,datasetBundles:bundles});setLoaded(cache);changeOpen(false);
    }catch(e){setError(e.message);}finally{setBusy(false);}
  }
  function downloadManifest(){
    const m={...bundle.manifest,files:Object.fromEntries(datasetFiles.map(key=>[key,key+'.tsv']))};
    delete m.packed;
    saveFile('manifest.json',JSON.stringify(m,null,2)+'\n','application/json');
  }
  return <><Button variant="soft" color="gray" onClick={()=>changeOpen(true)}>数据接口 / Data · {data.meta.datasets.length}</Button>
  <Dialog.Root open={open} onOpenChange={changeOpen}><Dialog.Content maxWidth="960px" className="dataset-dialog">
    <Dialog.Title>数据集与溯源 / Data sources</Dialog.Title><Dialog.Description>选择数据集，预览或导入材料。</Dialog.Description>
    <div className="dataset-list">{entries.map(r=><label key={r.id}><input type="checkbox" checked={ids.includes(r.id)} disabled={busy} onChange={e=>setIds(prev=>e.target.checked?[...prev,r.id]:prev.filter(id=>id!==r.id))}/><strong><span className="source-badge dataset-tint" style={datasetTint(r.id,entries)}>{datasetBadge(r.id,entries)}</span> {r.name}</strong><small>{r.id} · {r.version}{r.local?' · 本地导入':''}</small><button onClick={e=>{e.preventDefault();previewDataset(r.id)}} disabled={busy}>来源 / 预览</button></label>)}</div>
    <div className="compare-tools"><label>比较维度 <select aria-label="比较维度" value={group} onChange={e=>setGroup(e.target.value)}>{groupOptions.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
      <a href="./datasets/README.txt" target="_blank" rel="noreferrer">输入格式 / Load data</a><a href="./datasets/examples/riceflux_import_examples.zip" download>导入样例 / Templates</a><a href="./datasets/rice6044-v1.zip" download>6044 TSV</a><a href="./datasets/ricenavi-v1.zip" download>RiceNavi TSV</a>
      <button onClick={()=>saveFile('riceflux_selected_samples.tsv',sampleTable(data),'text/tab-separated-values')}>当前材料与分组 TSV</button>
    </div><p className="footnote">同名材料按数据集分别统计；设置可保存到工作区。</p>
    <details className="dataset-import"><summary>导入基因型 / 表型 · Import data</summary>
      <div className="compare-tools"><select aria-label="数据导入方式" value={importMode} onChange={e=>setImportMode(e.target.value)}><option value="package">数据包（清单 + 五表）</option><option value="new">新建本地数据集</option><option value="phenotypes">给预览数据集追加表型</option><option value="genotypes">给仅表型数据集追加基因型</option></select>
        {importMode==='new'&&<input aria-label="本地数据集名称" placeholder="数据集名称" value={importName} onChange={e=>setImportName(e.target.value)}/>}
        {importMode!=='package'&&<input aria-label="导入数据来源" placeholder="来源说明或 DOI" value={importSource} onChange={e=>setImportSource(e.target.value)}/>}
        {(importMode==='new'||importMode==='genotypes')&&<select aria-label="导入分型证据" value={importEvidence} onChange={e=>setImportEvidence(e.target.value)}>{['G_chip','G_projected','G_direct','G_mixed'].map(value=><option key={value}>{value}</option>)}</select>}
        <label className="file-button">选择文件<input aria-label="导入数据集" type="file" multiple accept=".json,.tsv,.txt,.gz" onChange={upload} disabled={busy}/></label>
      </div>
      <p className="footnote">{importMode==='package'?'manifest.json + samples、variants、genotypes、environments、phenotypes。':importMode==='new'?'samples.tsv + 分型两表、表型两表或两者。':importMode==='phenotypes'?`${bundle?.manifest.name||'先预览目标'} · environments.tsv + phenotypes.tsv`:`${bundle?.manifest.name||'先预览目标'} · variants.tsv + genotypes.tsv`}</p>
      {importMode!=='phenotypes'&&<p className="footnote">Tables 1.2 支持 SNP 和短 InDel。短 InDel 填写带共同锚定碱基的 REF/ALT 序列，如 A/AT 或 AT/A。</p>}
    </details>
    {error&&<p role="alert">{error}</p>}{busy&&<p role="status">正在校验并读取数据…</p>}
    {bundle&&<><DatasetProvenance data={data} datasetId={bundle.manifest.id}/><details onToggle={e=>{setShowTables(e.currentTarget.open);if(!e.currentTarget.open)setReadTable(null);}}><summary>原始表格预览 / Source tables · {bundle.manifest.name}</summary><div className="compare-tools"><select aria-label="预览表格" value={table} onChange={e=>setTable(e.target.value)}>{datasetFiles.map(key=><option key={key}>{key}</option>)}</select><button disabled={!tableText} onClick={()=>saveFile(table+'.tsv',tableText,'text/tab-separated-values;charset=utf-8')}>下载当前 TSV</button><button onClick={downloadManifest}>下载输入清单</button></div>
    {preview?<p className="footnote">{preview.count.toLocaleString()} 行 × {preview.fields.length.toLocaleString()} 列 · 预览前 12 行、8 列</p>:tableState?.error?<p role="alert">{tableState.error} <button onClick={()=>{setReadTable(null);setRetryTable(n=>n+1);}}>重试</button></p>:showTables&&<p role="status">正在读取原始表…</p>}
    {preview&&<div className="matrix-scroll"><table className="individual-table"><thead><tr>{preview.fields.slice(0,8).map(k=><th key={k}>{k}</th>)}</tr></thead><tbody>{preview.rows.slice(0,12).map((row,i)=><tr key={i}>{row.slice(0,8).map((value,j)=><td key={j}>{value}</td>)}</tr>)}</tbody></table></div>}</details></>}
    <details><summary>RiceNavi 完整来源库 / All source records</summary>{open&&<React.Suspense fallback={<p>Loading…</p>}><RiceNaviPanel gene={gene}/></React.Suspense>}</details><div className="dialog-actions"><span>{ids.length} 个数据集已选择</span><Dialog.Close><Button variant="soft" color="gray">关闭</Button></Dialog.Close><Button disabled={busy||!ids.length} onClick={apply}>应用数据集 / Apply</Button></div>
  </Dialog.Content></Dialog.Root></>;
}
