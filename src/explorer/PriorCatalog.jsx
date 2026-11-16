import React,{useState} from 'react';
import {Button,Dialog} from '@radix-ui/themes';
import {MagnifyingGlassIcon} from '@radix-ui/react-icons';
import {catalogStatus} from './catalog.js';
import {findGenes} from './geneSearch.js';
export function PriorFinder({data,onChoose}){
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[scope,setScope]=useState('全部现行基因'),[limit,setLimit]=useState(55);
 const s=data.catalogSummary;
 const hits=open?findGenes(data.genes,query).filter(g=>{
  const c=g.catalog,status=catalogStatus(g);
  if(scope==='历史身份'?!c.historical:c.historical)return false;
  if(scope==='核心 50'&&!c.core||!['全部现行基因','历史身份','核心 50'].includes(scope)&&scope!==status)return false;
  return true;
 }):[];
 return <><div className="quick-gene-search"><input aria-label="基因查询" placeholder="MSU ID / 基因名 / 别名" value={query} onChange={e=>{setQuery(e.target.value);setLimit(55)}} onKeyDown={e=>{if(e.key==='Enter')setOpen(true)}}/><Button className="prior-search" size="2" variant="soft" onClick={()=>setOpen(true)}><MagnifyingGlassIcon/>查询 {s.active} 个基因</Button></div>
 <Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Content maxWidth="720px"><Dialog.Title>水稻先验基因库</Dialog.Title><Dialog.Description>V4.0 收录 {s.v4_genes} 个基因，另保留 {s.external_core} 个核心基因。可跨性状查找；历史身份单列。</Dialog.Description>
 <div className="catalog-filters"><input aria-label="检索全库" type="search" placeholder="基因名、别名、MSU / RAP 编号或性状" value={query} onChange={e=>{setQuery(e.target.value);setLimit(55)}}/><select aria-label="先验范围" value={scope} onChange={e=>{setScope(e.target.value);setLimit(55)}}>{['全部现行基因','核心 50','文献位点有分型','仅区域 SNP 有分型','未接入分型','历史身份'].map(x=><option key={x}>{x}</option>)}</select></div>
 <p className="footnote">{hits.length} 个匹配基因</p><div className="catalog-list">{hits.slice(0,limit).map(g=><button key={g.id} onClick={()=>{onChoose(g);setOpen(false)}}><b>{g.catalog.msu||g.catalog.rap||g.catalog.sourceId}</b><small>{g.name} · {g.catalog.aliases.filter(a=>a!==g.name).slice(0,4).join(' / ')} · {catalogStatus(g)}</small></button>)}{!hits.length&&<p>没有匹配项。可改用编号或切换先验范围。</p>}{hits.length>limit&&<Button onClick={()=>setLimit(limit+100)}>显示更多基因</Button>}</div>
 <div className="dialog-actions"><a href="./prior/v4_prior_genes.tsv" download>下载基因目录</a><Dialog.Close><Button>关闭</Button></Dialog.Close></div></Dialog.Content></Dialog.Root></>;
}
