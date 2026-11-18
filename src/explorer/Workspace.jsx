import React,{useState,useRef} from 'react';
import {Button,Dialog} from '@radix-ui/themes';
import {saveFile} from './formats.js';
import {validateSiteSelections} from './siteSelection.js';
export const panels={compare:'多基因比较',locus:'基因区域与变异',frequency:'等位基因频率',composition:'多位点基因型组合',phenotype:'地区表型',evidence:'基因与证据',materials:'材料比较',individuals:'个体明细',ricenavi:'RiceNavi 来源'};
export const defaultLayout=Object.keys(panels).filter(id=>id!=='ricenavi').map(id=>({id,title:panels[id],width:['locus','frequency'].includes(id)?'half':'full'}));
export function validateWorkspace(value){
  if(value?.schema!=='RiceFlux workspace 1.0'||!value.config||!Array.isArray(value.config.layout)||!Array.isArray(value.datasets))throw Error('工作区版本或结构无效');
  const ids=value.config.layout.map(p=>p.id);
  if(new Set(ids).size!==ids.length||ids.some(id=>!panels[id]))throw Error('工作区包含未知或重复组件');
  if(value.config.layout.some(p=>!['half','full'].includes(p.width)||typeof p.title!=='string'||p.title.length>80))throw Error('组件设置无效');
  const c=value.config;
  if(!Array.isArray(c.popIds)||!Array.isArray(c.individualIds)||!Number.isFinite(c.minMaf)||c.minMaf<0||c.minMaf>.5||!Number.isFinite(c.maxMissing)||c.maxMissing<0||c.maxMissing>1||typeof c.individualOnly!=='boolean')throw Error('筛选设置无效');
  if(c.material&&(!Array.isArray(c.material.samples||[])||!Array.isArray(c.material.axes||[])||new Set(c.material.samples||[]).size!==(c.material.samples||[]).length||(c.material.samples||[]).some(id=>typeof id!=='string')||(c.material.axes||[]).length>8||new Set(c.material.axes||[]).size!==(c.material.axes||[]).length))throw Error('材料或雷达轴设置无效');
  if(c.compare&&(!Array.isArray(c.compare.ids||[])||new Set(c.compare.ids||[]).size!==(c.compare.ids||[]).length))throw Error('比较基因设置无效');
  validateSiteSelections(c.siteSelections);validateSiteSelections(c.compare?.joint?.customSites);
  if(c.display&&(!['desk','free'].includes(c.display.mode)||!['standard','large'].includes(c.display.text)||!['overview',...Object.keys(panels)].includes(c.display.tab)))throw Error('阅读布局设置无效');
  return value;
}
function storage(action,value){return new Promise((resolve,reject)=>{
  const req=indexedDB.open('riceflux-workspaces',1);
  req.onupgradeneeded=()=>req.result.createObjectStore('workspaces',{keyPath:'name'});
  req.onerror=()=>reject(req.error);req.onsuccess=()=>{
    const db=req.result,tx=db.transaction('workspaces',action==='list'?'readonly':'readwrite'),s=tx.objectStore('workspaces');
    const op=action==='list'?s.getAll():action==='delete'?s.delete(value):s.put(value);
    let result;op.onsuccess=()=>{result=op.result};tx.oncomplete=()=>{db.close();resolve(result)};tx.onerror=()=>{db.close();reject(tx.error)};tx.onabort=()=>{db.close();reject(tx.error||Error('浏览器存储失败'))};
  };
});}
export function WorkspaceTools({data,config,onLayout,onRestore}){
  const [open,setOpen]=useState(false),[name,setName]=useState('我的分析'),[saved,setSaved]=useState([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  function pack(){return {schema:'RiceFlux workspace 1.0',name,saved_at:new Date().toISOString(),config,datasets:data.meta.datasets,local_datasets:(data.datasetBundles||[]).filter(b=>data.datasetRegistry.some(r=>r.id===b.manifest.id&&r.local)).map(b=>b.overlays?{manifest:b.manifest,baseVersion:b.baseVersion,overlays:b.overlays}:{manifest:b.manifest,texts:b.texts})};}
  async function task(fn){setBusy(true);setMessage('');try{await fn()}catch(e){setMessage(e.message)}finally{setBusy(false)}}
  const refresh=async()=>setSaved(await storage('list'));
  function move(index,delta){const layout=[...config.layout],next=index+delta;if(next<0||next>=layout.length)return;[layout[index],layout[next]]=[layout[next],layout[index]];onLayout(layout);}
  return <><Button variant="soft" onClick={()=>{setOpen(true);task(refresh)}}>我的工作区</Button><Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Content maxWidth="780px"><Dialog.Title>我的工作区</Dialog.Title><Dialog.Description>组件布局、筛选、材料和比较维度可保存到本浏览器；导出设置可迁移到另一台设备。</Dialog.Description>
    <div className="compare-tools"><input aria-label="工作区名称" value={name} maxLength={60} onChange={e=>setName(e.target.value)}/><button disabled={busy||!name.trim()} onClick={()=>task(async()=>{await storage('save',pack());await refresh();setMessage('已保存当前布局、筛选和本地数据集');})}>保存工作区</button><button disabled={busy} onClick={()=>saveFile('riceflux_workspace.json',JSON.stringify(pack()),'application/json')}>导出设置</button><label className="file-button">导入设置<input type="file" accept=".json" aria-label="导入工作区设置" onChange={e=>{const file=e.target.files[0];e.target.value='';if(file)task(async()=>{const p=validateWorkspace(JSON.parse(await file.text()));await onRestore(p);setMessage('已恢复设置');});}}/></label></div>
    {saved.map(s=><div className="saved-workspace" key={s.name}><span>{s.name}<small>{new Date(s.saved_at).toLocaleString()}</small></span><button disabled={busy} onClick={()=>task(async()=>{await onRestore(validateWorkspace(s));setName(s.name);setMessage('已恢复 '+s.name);})}>恢复</button><button disabled={busy} onClick={()=>task(async()=>{await storage('delete',s.name);await refresh()})}>删除存档</button></div>)}
    <h3>分析组件</h3><div className="compare-tools"><button onClick={()=>onLayout(defaultLayout)}>完整布局</button><button onClick={()=>onLayout(['locus','frequency','phenotype','composition','evidence'].map(id=>({...defaultLayout.find(p=>p.id===id),width:'half'})))}>单页概览</button><select value="" aria-label="加入分析组件" onChange={e=>{if(e.target.value)onLayout([...config.layout,defaultLayout.find(p=>p.id===e.target.value)]);}}><option value="">加入组件…</option>{defaultLayout.filter(p=>!config.layout.some(x=>x.id===p.id)).map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></div>
    {config.layout.map((p,i)=><div className="component-editor" key={p.id}><input aria-label={'组件标题 '+panels[p.id]} value={p.title} maxLength={80} onChange={e=>onLayout(config.layout.map(x=>x.id===p.id?{...x,title:e.target.value}:x))}/><select aria-label={'组件宽度 '+panels[p.id]} value={p.width} onChange={e=>onLayout(config.layout.map(x=>x.id===p.id?{...x,width:e.target.value}:x))}><option value="full">整行</option><option value="half">半行</option></select><button disabled={!i} onClick={()=>move(i,-1)}>↑</button><button disabled={i===config.layout.length-1} onClick={()=>move(i,1)}>↓</button><button onClick={()=>onLayout(config.layout.filter(x=>x.id!==p.id))}>移除</button></div>)}
    <p className="footnote">清理浏览器数据会移除存档，请导出设置备份；分析数据以 TSV 下载。</p>{message&&<p role="status">{message}</p>}<div className="dialog-actions"><Dialog.Close><Button disabled={busy}>完成</Button></Dialog.Close></div></Dialog.Content></Dialog.Root></>;
}
export function WorkPanel({children}){return children;}
export function WorkspaceLayout({layout,onLayout,display,onDisplay,children}){
  const drag=useRef(null),[editing,setEditing]=useState(false);
  const content=new Map(React.Children.toArray(children).filter(React.isValidElement).map(c=>[c.props.id,c]));
  const overview=['locus','frequency','composition','phenotype'],desk=display.mode==='desk';
  const english={overview:'Overview',compare:'Multi-gene',evidence:'Evidence',materials:'Accessions',individuals:'Calls',ricenavi:'RiceNavi'};
  const tabs=[{id:'overview',title:'基因总览'},...layout.filter(p=>!overview.includes(p.id))];
  const active=display.tab==='overview'||layout.some(p=>p.id===display.tab)?display.tab:'overview';
  const select=tab=>onDisplay({...display,tab});
  function navigate(e){
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
    const index=tabs.findIndex(t=>t.id===(overview.includes(active)?'overview':active));
    const next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(index+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
    e.preventDefault();select(tabs[next].id);document.getElementById('tab-'+tabs[next].id)?.focus();
  }
  function reorder(target,id=drag.current){if(!id||id===target||!layout.some(p=>p.id===id))return;const items=layout.filter(p=>p.id!==id),entry=layout.find(p=>p.id===id);items.splice(layout.findIndex(p=>p.id===target),0,entry);onLayout(items);drag.current=null}
  return <><div className="workspace-navigation"><div className="analysis-tabs" role="tablist" aria-label="分析视图" onKeyDown={navigate}>{desk&&tabs.map(t=><button key={t.id} id={'tab-'+t.id} role="tab" aria-selected={active===t.id||t.id==='overview'&&overview.includes(active)} tabIndex={active===t.id||t.id==='overview'&&overview.includes(active)?0:-1} aria-controls="analysis-workspace" onClick={()=>select(t.id)}>{t.title}<small>{english[t.id]}</small></button>)}</div>
    <div className="reading-tools"><label>字号<select aria-label="页面字号" value={display.text} onChange={e=>onDisplay({...display,text:e.target.value})}><option value="standard">标准 · 16</option><option value="large">大字 · 18</option></select></label><button aria-pressed={!desk} onClick={()=>{onDisplay({...display,mode:desk?'free':'desk'});setEditing(false);}}>{desk?'自由布局':'返回电脑总览'}</button>{!desk&&<button aria-pressed={editing} onClick={()=>setEditing(!editing)}>{editing?'完成布局编辑':'编辑布局'}</button>}</div></div>
    {desk&&overview.includes(active)&&<button className="back-overview" onClick={()=>select('overview')}>← 返回基因总览</button>}
    <div id="analysis-workspace" role={desk?'tabpanel':undefined} aria-labelledby={desk?'tab-'+(overview.includes(active)?'overview':active):undefined} className={'workspace-grid'+(desk?' desk-grid '+(active==='overview'?'overview-grid':'expanded-grid'):'')+(editing?' editing':'')}>
      {layout.map(p=><div className={'work-panel '+p.width} key={p.id} data-panel={p.id} hidden={desk&&(active==='overview'?!overview.includes(p.id):p.id!==active)} onDragOver={e=>{if(editing){e.preventDefault();e.dataTransfer.dropEffect='move'}}} onDrop={e=>{e.preventDefault();reorder(p.id,e.dataTransfer.getData('text/plain')||drag.current)}}>
        {desk&&active==='overview'&&<button className="expand-panel" aria-label={'展开 '+p.title} onClick={()=>select(p.id)}>展开 ↗</button>}
        {editing&&<div className="panel-handle" draggable onDragStart={e=>{drag.current=p.id;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',p.id)}} onDragEnd={()=>drag.current=null}><span>⠿ {p.title}</span><button aria-label={'隐藏 '+p.title} onClick={()=>onLayout(layout.filter(x=>x.id!==p.id))}>×</button></div>}
        {p.title!==panels[p.id]&&<div className="custom-panel-title">{p.title}</div>}{(!desk||(active==='overview'?overview.includes(p.id):p.id===active))&&content.get(p.id)}
      </div>)}
      {desk&&active==='overview'&&!layout.some(p=>overview.includes(p.id))&&<p>总览组件已移除，可在“我的工作区”加入。</p>}
    </div></>;
}
