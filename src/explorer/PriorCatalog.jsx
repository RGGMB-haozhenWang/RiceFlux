import React,{useMemo,useState} from 'react';
import {Button,Dialog} from '@radix-ui/themes';
import {MagnifyingGlassIcon} from '@radix-ui/react-icons';
import {SourceBadges} from './SourceBadges.jsx';
import {findGenes} from './geneSearch.js';
import {geneEvidence,geneTraits,hasPhenotypes} from './provenance.js';
import {datasetBadge,datasetTint} from './datasetColors.js';

function matchesEvidence(evidence,summary,traits,supported){
  const {support,functional,hap,papers}=summary;
  switch(evidence){
    case 'P': return supported.length>0;
    case 'no_phenotype': return traits.length>0&&!supported.length;
    case 'F': return functional>0;
    case 'H': return hap>0;
    case 'L': return papers>0&&!functional&&!hap;
    case 'regional': return support.length>0&&!functional&&!hap;
    case 'untyped': return !support.length;
    default: return true;
  }
}

function PrimaryTraits({traits,supported}){
  if(!traits.length)return <div className="catalog-traits"><small>暂无已登记性状</small></div>;
  const observed=new Set(supported.map(t=>t.id));
  const ordered=[...supported,...traits.filter(t=>!observed.has(t.id))];
  return <div className="catalog-traits" aria-label="主要性状及实测状态">
    {ordered.slice(0,4).map(t=>observed.has(t.id)
      ? <span key={t.id} className="source-badge phenotype-support" title="当前所选数据集有实测表型">P · {t.name}</span>
      : <span key={t.id} className="catalog-unmeasured">{t.name} · 暂无实测</span>)}
    {ordered.length>4&&<small>另 {ordered.length-4} 项</small>}
  </div>;
}

export function PriorFinder({data,onChoose}){
  const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[dataset,setDataset]=useState('all');
  const [evidence,setEvidence]=useState('all'),[limit,setLimit]=useState(55);
  const hits=useMemo(()=>{
    if(!open)return [];
    return findGenes(data.genes,query).flatMap(gene=>{
      const summary=geneEvidence(data,gene,dataset);
      const traits=geneTraits(data,gene),supported=traits.filter(t=>hasPhenotypes(t,dataset));
      if(dataset!=='all'&&!summary.support.length&&!supported.length)return [];
      return matchesEvidence(evidence,summary,traits,supported)?[{gene,traits,supported}]:[];
    });
  },[open,data,query,dataset,evidence]);
  const change=set=>event=>{set(event.target.value);setLimit(55);};
  return <>
    <div className="quick-gene-search">
      <input aria-label="基因查询" placeholder="MSU ID / 基因名 / 别名" value={query} onChange={change(setQuery)} onKeyDown={e=>{if(e.key==='Enter')setOpen(true)}}/>
      <Button className="prior-search" size="2" variant="soft" onClick={()=>setOpen(true)}><MagnifyingGlassIcon/>查询 {data.genes.length} 个基因</Button>
    </div>
    <Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Content maxWidth="720px">
      <Dialog.Title>水稻先验基因库</Dialog.Title>
      <Dialog.Description>按基因名或 ID 检索。P 表示当前所选数据集有该性状的实测表型。</Dialog.Description>
      <div className="catalog-filters source-filters">
        <input aria-label="检索全库" type="search" placeholder="基因名、别名、MSU / RAP 编号" value={query} onChange={change(setQuery)}/>
        <select aria-label="数据集覆盖" className="dataset-tint" style={dataset==='all'?undefined:datasetTint(dataset,data.datasetRegistry)} value={dataset} onChange={change(setDataset)}>
          <option value="all">全部数据集 / All datasets</option>
          {data.datasetRegistry.map(r=><option key={r.id} value={r.id}>{datasetBadge(r.id,data.datasetRegistry)} · {r.name}</option>)}
        </select>
        <select aria-label="证据与实测表型" value={evidence} onChange={change(setEvidence)}>
          <option value="all">全部证据 / All evidence</option>
          <optgroup label="实测表型 / Phenotypes">
            <option value="P">P · 有实测性状</option>
            <option value="no_phenotype">关联性状均暂无实测</option>
          </optgroup>
          <optgroup label="分型与文献 / Calls and literature">
            <option value="F">F · 文献功能位点</option>
            <option value="H">H · 文献单倍型组分</option>
            <option value="L">L · 基因层文献</option>
            <option value="regional">区域 SNP</option>
            <option value="untyped">未接入分型</option>
          </optgroup>
        </select>
      </div>
      <p className="footnote">{hits.length} 个匹配基因</p>
      <div className="catalog-list">
        {hits.slice(0,limit).map(({gene,traits,supported})=><button key={gene.id} onClick={()=>{onChoose(gene,supported[0]?.id);setOpen(false);}}>
          <div className="catalog-gene">
            <b>{gene.catalog.msu||gene.catalog.rap||gene.catalog.sourceId}</b>
            <small>{[gene.name,...gene.catalog.aliases.filter(a=>a!==gene.name).slice(0,4)].join(' / ')}</small>
          </div>
          <SourceBadges data={data} gene={gene} phenotypeDataset={dataset}/>
          <PrimaryTraits traits={traits} supported={supported}/>
        </button>)}
        {!hits.length&&<p>没有匹配项。可改用编号或切换数据集与证据。</p>}
        {hits.length>limit&&<Button onClick={()=>setLimit(n=>n+100)}>显示更多基因</Button>}
      </div>
      <div className="dialog-actions">
        <a href="./prior/v4_prior_genes.tsv" download>下载基因目录</a> · <a href="./annotations/gene_identity.tsv" download>名称与 ID 复核 / Identity audit</a>
        <Dialog.Close><Button>关闭</Button></Dialog.Close>
      </div>
    </Dialog.Content></Dialog.Root>
  </>;
}
