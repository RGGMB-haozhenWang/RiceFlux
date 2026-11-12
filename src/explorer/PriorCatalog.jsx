import React,{useState} from 'react';
import {Button,Dialog} from '@radix-ui/themes';
import {MagnifyingGlassIcon} from '@radix-ui/react-icons';
import {catalogStatus} from './catalog.js';
import {DoiLinks} from './AccessionCalls.jsx';
export function PriorFinder({data,onChoose}){
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[scope,setScope]=useState('全部现行基因'),[limit,setLimit]=useState(55);
 const lookup=query.trim().toLowerCase(),s=data.catalogSummary;
 const hits=open?data.genes.filter(g=>{
  const c=g.catalog,status=catalogStatus(g);
  if(scope==='历史身份'?!c.historical:c.historical)return false;
  if(scope==='核心 50'&&!c.core||!['全部现行基因','历史身份','核心 50'].includes(scope)&&scope!==status)return false;
  return [g.name,g.id,c.sourceId,c.msu,c.rap,...c.aliases,...c.categories,...c.traits].join(' ').toLowerCase().includes(lookup);
 }).sort((a,b)=>a.name.localeCompare(b.name)):[];
 return <><Button className="prior-search" size="2" variant="soft" onClick={()=>setOpen(true)}><MagnifyingGlassIcon/>全库检索 · {s.active} 个基因</Button>
 <Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Content maxWidth="720px"><Dialog.Title>水稻先验基因库</Dialog.Title><Dialog.Description>V4.0 收录 {s.v4_genes} 个基因，另保留 {s.external_core} 个核心基因。可跨性状查找；历史身份单列。</Dialog.Description>
 <div className="catalog-filters"><input aria-label="检索全库" type="search" placeholder="基因名、别名、MSU / RAP 编号或性状" value={query} onChange={e=>{setQuery(e.target.value);setLimit(55)}}/><select aria-label="先验范围" value={scope} onChange={e=>{setScope(e.target.value);setLimit(55)}}>{['全部现行基因','核心 50','文献位点有分型','仅区域 SNP 有分型','未接入分型','历史身份'].map(x=><option key={x}>{x}</option>)}</select></div>
 <p className="footnote">{hits.length} 个匹配基因</p><div className="catalog-list">{hits.slice(0,limit).map(g=><button key={g.id} onClick={()=>{onChoose(g);setOpen(false)}}><b>{g.name}</b><small>{g.catalog.msu||g.catalog.rap||g.catalog.sourceId} · {catalogStatus(g)}</small></button>)}{!hits.length&&<p>没有匹配项。可改用编号或切换先验范围。</p>}{hits.length>limit&&<Button onClick={()=>setLimit(limit+100)}>显示更多基因</Button>}</div>
 <div className="dialog-actions"><a href="./prior/v4_prior_genes.tsv" download>下载基因目录</a><Dialog.Close><Button>关闭</Button></Dialog.Close></div></Dialog.Content></Dialog.Root></>;
}
export function PriorCard({gene,evidence}){
 const c=gene.catalog;
 return <details className="site-evidence prior-card" key={gene.id} open={!c.core}><summary>{gene.name} · 先验档案与文献（{catalogStatus(gene)}）</summary><p>{[c.core?'原核心集':null,c.sourceId&&!c.historical?'V4.0':null,c.rap,c.msu].filter(Boolean).join(' · ')} {c.identity&&<a href={c.identity} target="_blank" rel="noreferrer">基因身份来源 ↗</a>}</p>
 {c.traits.length>0&&<p><strong>来源记载的基因性状：</strong>{c.traits.join('；')}</p>}{c.function.map(x=><p key={x}>{x}</p>)}
 {c.geneDOI.length>0&&<p><strong>基因层文献：</strong><DoiLinks values={c.geneDOI} papers={evidence.papers}/></p>}
 {c.backgroundDOI.length>0&&<p><strong>已审基因档案的背景文献：</strong><DoiLinks values={c.backgroundDOI} papers={evidence.papers}/></p>}{c.events.length>0?<details><summary>查看 {c.events.length} 条 V4 文献事件与坐标</summary>{c.events.map(e=><div key={e.key} className="catalog-event"><b>{e.label||e.key}</b><p>{[e.type,e.level,e.scope].filter(Boolean).join(' · ')}</p>{e.trait&&<p>{e.trait}</p>}{e.effect&&<p>{e.effect}</p>}<p>{e.pos&&e.pos!=='NA'?e.chr+' · '+e.pos+' · REF '+e.ref+' · 文献状态 '+e.state:'缺少已核定的事件坐标'}</p><p>事件 DOI：{e.doi.length?<DoiLinks values={e.doi} papers={evidence.papers}/>:'本条未登记'}</p></div>)}</details>:<p>{c.historical?'仅保留历史基因身份；不恢复已排除事件。':c.core?'核心集的位点及来源见位点详情。':'当前 V4 档案没有可展示的位点事件。'}</p>}
 {!c.geneDOI.length&&!c.backgroundDOI.length&&!c.events.some(e=>e.doi.length)&&!c.core&&!c.historical&&<p>本次来源未提供可追溯 DOI。</p>}
 {gene.variants.some(v=>v.classified==='区域探索标记')&&<p>本基因展示的是区域探索 SNP：在参考转录本 CDS 和按链方向的上游 2 kb 内各选最多一个群体标记，按转录起始端距离选取。尚未证实这些标记代表文献功能等位。</p>}
 </details>;
}
