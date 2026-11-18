import React,{useState} from 'react';
import {Button,Dialog} from '@radix-ui/themes';
import {MagnifyingGlassIcon} from '@radix-ui/react-icons';
import {SourceBadges} from './SourceBadges.jsx';
import {findGenes} from './geneSearch.js';
import {geneEvidence} from './provenance.js';
import {datasetBadge,datasetTint} from './datasetColors.js';
export function PriorFinder({data,onChoose}){
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[scope,setScope]=useState('active'),[dataset,setDataset]=useState('all'),[evidence,setEvidence]=useState('all'),[limit,setLimit]=useState(55);
 const s=data.catalogSummary;
 const hits=open?findGenes(data.genes,query).filter(g=>{
  const c=g.catalog;
  if(scope==='historical'?!c.historical:c.historical)return false;
  if(scope==='core'&&!c.core)return false;
  const {support,functional,hap,papers}=geneEvidence(data,g,dataset);
  if(dataset!=='all'&&!support.length)return false;
  return evidence==='all'||(evidence==='F'&&functional>0)||(evidence==='H'&&hap>0)||
    (evidence==='L'&&papers>0&&!functional&&!hap)||(evidence==='regional'&&support.length>0&&!functional&&!hap)||
    (evidence==='untyped'&&!support.length);
 }):[];
 const change=set=>event=>{set(event.target.value);setLimit(55);};
 return <><div className="quick-gene-search"><input aria-label="基因查询" placeholder="MSU ID / 基因名 / 别名" value={query} onChange={e=>{setQuery(e.target.value);setLimit(55)}} onKeyDown={e=>{if(e.key==='Enter')setOpen(true)}}/><Button className="prior-search" size="2" variant="soft" onClick={()=>setOpen(true)}><MagnifyingGlassIcon/>查询 {s.active} 个基因</Button></div>
 <Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Content maxWidth="720px"><Dialog.Title>水稻先验基因库</Dialog.Title><Dialog.Description>V4.0 收录 {s.v4_genes} 个基因，另保留 {s.external_core} 个核心基因。可跨性状查找；历史身份单列。</Dialog.Description>
 <div className="catalog-filters source-filters"><input aria-label="检索全库" type="search" placeholder="基因名、别名、MSU / RAP 编号" value={query} onChange={change(setQuery)}/><select aria-label="先验范围" value={scope} onChange={change(setScope)}><option value="active">现行基因</option><option value="core">核心 50</option><option value="historical">历史身份</option></select>
 <select aria-label="数据集覆盖" className="dataset-tint" style={dataset==='all'?undefined:datasetTint(dataset,data.datasetRegistry)} value={dataset} onChange={change(setDataset)}><option value="all">全部数据集 / All datasets</option>{data.datasetRegistry.map(r=><option key={r.id} value={r.id}>{datasetBadge(r.id,data.datasetRegistry)} · {r.name}</option>)}</select>
 <select aria-label="文献证据类别" value={evidence} onChange={change(setEvidence)}><option value="all">全部证据 / All evidence</option><option value="F">F · 文献功能位点</option><option value="H">H · 文献单倍型组分</option><option value="L">L · 基因层文献</option><option value="regional">区域 SNP</option><option value="untyped">未接入分型</option></select></div>
 <p className="footnote">{hits.length} 个匹配基因</p><div className="catalog-list">{hits.slice(0,limit).map(g=><button key={g.id} onClick={()=>{onChoose(g);setOpen(false)}}><b>{g.catalog.msu||g.catalog.rap||g.catalog.sourceId}</b><SourceBadges data={data} gene={g}/><small>{[g.name,...g.catalog.aliases.filter(a=>a!==g.name).slice(0,4)].join(' / ')}</small></button>)}{!hits.length&&<p>没有匹配项。可改用编号或切换数据集与证据。</p>}{hits.length>limit&&<Button onClick={()=>setLimit(limit+100)}>显示更多基因</Button>}</div>
 <div className="dialog-actions"><a href="./prior/v4_prior_genes.tsv" download>下载基因目录</a> · <a href="./annotations/gene_identity.tsv" download>名称与 ID 复核 / Identity audit</a><Dialog.Close><Button>关闭</Button></Dialog.Close></div></Dialog.Content></Dialog.Root></>;
}
