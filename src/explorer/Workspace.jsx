import {useText} from './locale.jsx';
import React,{Suspense,useEffect,useState} from 'react';
import {Button,Dialog} from '@radix-ui/themes';
import {saveFile} from './formats.js';
import {validateSiteSelections} from './siteSelection.js';
import {validateTraitTargets} from './traitAssessment.js';
import {validatePhenotypeCheck} from './phenotypeCheck.js';
export const panels={locus:'基因区域与变异',frequency:'等位基因频率',composition:'多位点基因型组合',phenotype:'地区表型',evidence:'基因与证据',compare:'多基因比较',materials:'材料比较',individuals:'个体明细',ricenavi:'RiceNavi 来源'};
const pages=[
  {id:'gene',title:'基因与群体',sections:['locus','frequency','composition']},
  {id:'results',title:'表型与证据',sections:['phenotype','evidence','ricenavi']},
];
export const headerFunctions=['compare','materials','individuals'];
const panelId=id=>'rf-section-'+id;
export const defaultLayout=Object.keys(panels).filter(id=>id!=='ricenavi').map(id=>({id,title:panels[id],width:'full'}));
export function validateWorkspace(value){
  if(value?.schema!=='RiceFlux workspace 1.0'||!value.config||!Array.isArray(value.config.layout)||!Array.isArray(value.datasets))throw Error('工作区版本或结构无效');
  const ids=value.config.layout.map(p=>p.id);
  if(new Set(ids).size!==ids.length||ids.some(id=>!panels[id]))throw Error('工作区包含未知或重复组件');
  if(value.config.layout.some(p=>!['half','full'].includes(p.width)||typeof p.title!=='string'||p.title.length>80))throw Error('组件设置无效');
  const c=value.config;
  if(!Array.isArray(c.popIds)||!Array.isArray(c.individualIds)||!Number.isFinite(c.minMaf)||c.minMaf<0||c.minMaf>.5||!Number.isFinite(c.maxMissing)||c.maxMissing<0||c.maxMissing>1||typeof c.individualOnly!=='boolean')throw Error('筛选设置无效');
  if(c.material&&(!Array.isArray(c.material.samples||[])||!Array.isArray(c.material.axes||[])||new Set(c.material.samples||[]).size!==(c.material.samples||[]).length||(c.material.samples||[]).some(id=>typeof id!=='string')||(c.material.axes||[]).length>8||new Set(c.material.axes||[]).size!==(c.material.axes||[]).length))throw Error('材料或雷达轴设置无效');
  if(c.compare&&(!Array.isArray(c.compare.ids||[])||new Set(c.compare.ids||[]).size!==(c.compare.ids||[]).length))throw Error('比较基因设置无效');
  const b=c.breeder;
  if(b!==undefined){
    const record=value=>value&&typeof value==='object'&&!Array.isArray(value);
    const strings=map=>map===undefined||record(map)&&Object.values(map).every(v=>typeof v==='string');
    const {goals,review}=b??{};
    if(!record(b)||b.scope!==undefined&&!['material','cross'].includes(b.scope)||
      b.geneIds!==undefined&&(!Array.isArray(b.geneIds)||b.geneIds.some(id=>typeof id!=='string')||new Set(b.geneIds).size!==b.geneIds.length)||
      b.samples!==undefined&&(!Array.isArray(b.samples)||b.samples.some(id=>typeof id!=='string')||new Set(b.samples).size!==b.samples.length)||
      ['axis','trait','queryTrait','lookupTrait','lookupAxis','lookupGene','lookupScheme','focus','female','male'].some(key=>b[key]!==undefined&&typeof b[key]!=='string')||
      !strings(b.schemes)||!strings(b.tracking)||goals!==undefined&&(!record(goals)||Object.values(goals).some(g=>!record(g)||!strings(g)))||
      review!==undefined&&(!record(review)||typeof review.context!=='string'||!record(review.decisions)||
        Object.values(review.decisions).some(v=>!['candidate','verify','hold'].includes(v))))throw Error('育种工作台设置无效');
  }
  validateSiteSelections(c.siteSelections);validateSiteSelections(c.compare?.joint?.customSites);
  validateTraitTargets(c.traitTargets);
  validatePhenotypeCheck(c.phenotypeCheck);
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
export function WorkspaceTools({data,config,onLayout,onDisplay,onRestore}){
  const localize = useText();
  const [open,setOpen]=useState(false),[name,setName]=useState('我的分析'),[saved,setSaved]=useState([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  function pack(){return {schema:'RiceFlux workspace 1.0',name,saved_at:new Date().toISOString(),config,datasets:data.meta.datasets,local_datasets:(data.datasetBundles||[]).filter(b=>data.datasetRegistry.some(r=>r.id===b.manifest.id&&r.local)).map(b=>b.overlays?{manifest:b.manifest,baseVersion:b.baseVersion,overlays:b.overlays}:{manifest:b.manifest,texts:b.texts})};}
  async function task(fn){setBusy(true);setMessage('');try{await fn()}catch(e){setMessage(e.message)}finally{setBusy(false)}}
  const refresh=async()=>setSaved(await storage('list'));
  function move(index,delta){const layout=[...config.layout],next=index+delta;if(next<0||next>=layout.length)return;[layout[index],layout[next]]=[layout[next],layout[index]];onLayout(layout);}
  return <><Button variant="soft" onClick={()=>{setOpen(true);task(refresh)}}>{localize("我的工作区")}</Button><Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Content maxWidth="780px"><Dialog.Title>{localize("我的工作区")}</Dialog.Title><Dialog.Description>{localize("保存筛选、材料和分析设置。导出的设置可在其他设备恢复。")}</Dialog.Description>
    <div className="compare-tools"><input aria-label={localize("工作区名称")} value={name} maxLength={60} onChange={e=>setName(e.target.value)}/><button disabled={busy||!name.trim()} onClick={()=>task(async()=>{await storage('save',pack());await refresh();setMessage('已保存当前布局、筛选和本地数据集');})}>{localize("保存工作区")}</button><button disabled={busy} onClick={()=>saveFile('riceflux_workspace.json',JSON.stringify(pack()),'application/json')}>{localize("导出设置")}</button><label className="file-button">{localize("导入设置")}<input type="file" accept=".json" aria-label={localize("导入工作区设置")} onChange={e=>{const file=e.target.files[0];e.target.value='';if(file)task(async()=>{const p=validateWorkspace(JSON.parse(await file.text()));await onRestore(p);setMessage('已恢复设置');});}}/></label></div>
    {saved.map(s=><div className="saved-workspace" key={s.name}><span>{localize(s.name)}<small>{localize(new Date(s.saved_at).toLocaleString())}</small></span><button disabled={busy} onClick={()=>task(async()=>{await onRestore(validateWorkspace(s));setName(s.name);setMessage('已恢复 '+s.name);})}>{localize("恢复")}</button><button disabled={busy} onClick={()=>task(async()=>{await storage('delete',s.name);await refresh()})}>{localize("删除存档")}</button></div>)}
    <details><summary>{localize("阅读与区段顺序")}</summary><div className="compare-tools"><label>{localize("字号")+" "}<select aria-label={localize("页面字号")} value={config.display.text} onChange={e=>onDisplay({...config.display,text:e.target.value})}><option value="standard">{localize("标准 · 16")}</option><option value="large">{localize("大字 · 18")}</option></select></label>
      <button onClick={()=>onLayout(defaultLayout)}>{localize("恢复默认区段")}</button><select value="" aria-label={localize("加入分析组件")} onChange={e=>{const id=e.target.value;if(id)onLayout([...config.layout,{id,title:panels[id],width:'full'}]);}}><option value="">{localize("加入组件…")}</option>{Object.entries(panels).filter(([id])=>!config.layout.some(p=>p.id===id)).map(([id,title])=><option key={id} value={id}>{localize(title)}</option>)}</select></div>
    {config.layout.map((p,i)=><div className="component-editor" key={p.id}><input aria-label={localize('组件标题 '+panels[p.id])} value={p.title} maxLength={80} onChange={e=>onLayout(config.layout.map(x=>x.id===p.id?{...x,title:e.target.value}:x))}/><select aria-label={localize('组件宽度 '+panels[p.id])} value={p.width} onChange={e=>onLayout(config.layout.map(x=>x.id===p.id?{...x,width:e.target.value}:x))}><option value="full">{localize("整行")}</option><option value="half">{localize("半行")}</option></select><button disabled={!i} onClick={()=>move(i,-1)}>↑</button><button disabled={i===config.layout.length-1} onClick={()=>move(i,1)}>↓</button><button onClick={()=>onLayout(config.layout.filter(x=>x.id!==p.id))}>{localize("移除")}</button></div>)}
    </details><p className="footnote">{localize("存档在浏览器中。可导出设置备份。")}</p>{message&&<p role="status">{localize(message)}</p>}<div className="dialog-actions"><Dialog.Close><Button disabled={busy}>{localize("完成")}</Button></Dialog.Close></div></Dialog.Content></Dialog.Root></>;
}
export function jumpToSection(id){
  const target=document.getElementById(id==='overview'?'explorer-main':panelId(id));
  if(!target)return false;
  const disclosure=target.querySelector(':scope > .section-disclosure');
  if(disclosure)disclosure.open=true;
  target.focus({preventScroll:true});
  target.scrollIntoView({block:'start'});
  return true;
}

export function WorkspaceNavigation({layout,toolbar,onJump}){
  const localize = useText();
  useEffect(()=>{
    const header=toolbar.current;
    if(!header)return;
    const resize=new ResizeObserver(()=>{
      header.parentElement.style.setProperty('--research-header-height',header.offsetHeight+'px');
    });
    resize.observe(header);
    return()=>resize.disconnect();
  },[toolbar]);
  const links=pages.flatMap(page=>layout.some(p=>page.sections.includes(p.id))?[page]:[]);
  if(!links.length)return null;
  return <nav className="research-sections" aria-label={localize("分析区段")}>
    {links.map(({id,title})=><button type="button" key={id} aria-controls={panelId(id)}
      onClick={()=>onJump(id)}>{localize(title)}</button>)}
  </nav>;
}

function ToolSection({title,children}){
  const localize = useText();
  const [visited,setVisited]=useState(false);
  return <details className="section-disclosure" onToggle={e=>{if(e.currentTarget.open)setVisited(true);}}>
    <summary>{localize(title)}</summary>
    {localize(visited&&children)}
  </details>;
}

export function WorkspaceLayout({layout,content,openTool,onCloseTool,toolTrigger}){
  const localize = useText();
  const visible=pages.map(page=>({...page,panels:layout.filter(p=>page.sections.includes(p.id)&&content[p.id])})).filter(page=>page.panels.length);
  const tool=layout.find(p=>p.id===openTool&&headerFunctions.includes(p.id)&&content[p.id]);
  const render=p=><Suspense fallback={<p className="section-loading" role="status">{localize("正在载入")}{localize(p.title)}…</p>}>{localize(content[p.id])}</Suspense>;
  return <>
    <div id="analysis-workspace" className="reader-columns" data-split={visible.length===2?'true':undefined}>
      {visible.map(page=><section className="reader-page" key={page.id} data-page={page.id} id={panelId(page.id)} tabIndex={-1} aria-label={localize(page.title)}>
        <header className="reader-page-heading"><h2>{localize(page.title)}</h2>
          {page.panels.some(p=>p.id==='evidence')&&<button className="site-detail" type="button" onClick={()=>jumpToSection('evidence')}>{localize("查看证据 ↓")}</button>}
        </header>
        <div className="workspace-grid">{page.panels.map(p=><section className={'work-panel '+p.width} key={p.id} id={panelId(p.id)} data-panel={p.id} aria-label={localize(p.title)} tabIndex={-1}>
          {p.id==='ricenavi'?<ToolSection title={localize(p.title)}>{localize(render(p))}</ToolSection>:
            <>{p.title!==panels[p.id]&&<div className="custom-panel-title">{localize(p.title)}</div>}{localize(render(p))}</>}
        </section>)}</div>
      </section>)}
      {!visible.length&&<p>{localize("可在「我的工作区」添加分析区段。")}</p>}
    </div>
    <Dialog.Root open={Boolean(tool)} onOpenChange={open=>{if(!open)onCloseTool();}}>
      <Dialog.Content className="reader-function-dialog" maxWidth="1300px" aria-describedby={undefined}
        onCloseAutoFocus={event=>{event.preventDefault();toolTrigger.current?.focus({preventScroll:true});}}>
        {tool&&<>
          <div className="reader-function-heading">
            <Dialog.Title>{localize(tool.title)}</Dialog.Title>
            <Dialog.Close><Button variant="soft" color="gray">{localize("关闭")}</Button></Dialog.Close>
          </div>
          <div data-panel={tool.id}>{localize(render(tool))}</div>
        </>}
      </Dialog.Content>
    </Dialog.Root>
  </>;
}
