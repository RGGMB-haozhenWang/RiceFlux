import React,{useMemo,useState} from 'react';
import {Button,Dialog} from '@radix-ui/themes';
import {MagnifyingGlassIcon} from '@radix-ui/react-icons';
import {SourceBadges} from './SourceBadges.jsx';
import {findGenes} from './geneSearch.js';
import {geneEvidence,geneSupport,geneTraits,hasPhenotypes} from './provenance.js';
import {datasetBadge,datasetTint} from './datasetColors.js';
import {downloadTable} from './formats.js';

const pageSize=55;
function matchesEvidence(evidence,summary,traits,supported){
  const {support,functional,hap,papers,indel}=summary;
  switch(evidence){
    case 'P': return supported.length>0;
    case 'no_phenotype': return traits.length>0&&!supported.length;
    case 'F': return functional>0;
    case 'H': return hap>0;
    case 'indel': return indel;
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

export function PriorFinder({data,onChoose,onInspect}){
  const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[dataset,setDataset]=useState('all');
  const [evidence,setEvidence]=useState('all'),[traitId,setTrait]=useState(''),[page,setPage]=useState(0);
  const traitIndex=useMemo(()=>{
    const byGene=new Map(),options=new Map();
    if(open)for(const gene of data.genes){
      const traits=geneTraits(data,gene);
      byGene.set(gene.id,traits);
      for(const trait of traits)options.set(trait.id,trait);
    }
    return {byGene,options};
  },[open,data]);
  const activeTrait=traitIndex.options.has(traitId)?traitId:'';
  const hits=useMemo(()=>{
    if(!open)return [];
    return findGenes(data.genes,query).flatMap(gene=>{
      if(evidence==='goal_profile'&&(!gene.catalog?.core||gene.catalog?.historical))return [];
      const linked=traitIndex.byGene.get(gene.id);
      const traits=activeTrait?linked.filter(t=>t.id===activeTrait):linked;
      if(activeTrait&&!traits.length)return [];
      const summary=geneEvidence(data,gene,dataset);
      const supported=traits.filter(t=>hasPhenotypes(t,dataset));
      if(dataset!=='all'&&!summary.support.length&&!supported.length)return [];
      return matchesEvidence(evidence,summary,traits,supported)?[{gene,traits,supported}]:[];
    });
  },[open,data,query,dataset,evidence,traitIndex,activeTrait]);
  const change=set=>event=>{set(event.target.value);setPage(0);};
  const offset=Math.min(page,Math.max(0,Math.ceil(hits.length/pageSize)-1))*pageSize;
  function exportCatalog(){
    const columns=['gene_id','MSU_ID','RAP_ID','gene_name','aliases','chromosome','gene_start','gene_end',
      'reference_model','catalog_group','indel_datasets','catalog_dois'];
    downloadTable({filename:'riceflux_gene_catalog.txt',columns},data.genes.map(g=>({
      gene_id:g.id,MSU_ID:g.catalog?.msu,RAP_ID:g.catalog?.rap,gene_name:g.name,aliases:g.catalog?.aliases?.join(';'),
      chromosome:g.chromosome,gene_start:g.gene_start,gene_end:g.gene_end,reference_model:g.model,
      catalog_group:g.catalog?.collection||'prior',
      indel_datasets:geneSupport(data,g).filter(r=>Number(r.indel_sites)>0).map(r=>r.dataset_id+'='+r.indel_sites).join(';'),
      catalog_dois:g.catalog?.geneDOI?.join(';'),
    })));
  }
  return <>
    <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Trigger><Button className="prior-search" size="2" variant="soft"><MagnifyingGlassIcon/>查询 {data.genes.length.toLocaleString()} 个基因</Button></Dialog.Trigger>
    <Dialog.Content maxWidth="720px">
      <Dialog.Title>水稻先验基因库</Dialog.Title>
      <Dialog.Description>按基因名或 ID 检索。InDel 表示至少一个已登记数据集观察到非参考等位。P 表示有实测表型。</Dialog.Description>
      <div className="catalog-filters source-filters">
        <input aria-label="检索全库" type="search" placeholder="基因名、别名、MSU / RAP 编号" value={query} onChange={change(setQuery)}/>
        <select aria-label="按关联性状筛选" value={activeTrait} onChange={change(setTrait)}>
          <option value="">全部关联性状</option>
          {[...traitIndex.options.values()].sort((a,b)=>a.name.localeCompare(b.name,'zh')).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select aria-label="数据集覆盖" className="dataset-tint" style={dataset==='all'?undefined:datasetTint(dataset,data.datasetRegistry)} value={dataset} onChange={change(setDataset)}>
          <option value="all">全部数据集 / All datasets</option>
          {data.datasetRegistry.map(r=><option key={r.id} value={r.id}>{datasetBadge(r.id,data.datasetRegistry)} · {r.name}</option>)}
        </select>
        <select aria-label="证据与实测表型" value={evidence} onChange={change(setEvidence)}>
          <option value="all">全部证据 / All evidence</option>
          <optgroup label="实测表型 / Phenotypes">
            <option value="goal_profile">性状目标判型 · V4 首批</option>
            <option value="P">P · 有实测性状</option>
            <option value="no_phenotype">关联性状均暂无实测</option>
          </optgroup>
          <optgroup label="分型与文献 / Calls and literature">
            <option value="F">F · 文献功能位点</option>
            <option value="H">H · 文献单倍型组分</option>
            <option value="indel">InDel · 有分型</option>
            <option value="L">L · 基因层文献</option>
            <option value="regional">区域标记</option>
            <option value="untyped">未接入分型</option>
          </optgroup>
        </select>
      </div>
      <p className="footnote">{hits.length.toLocaleString()} 个匹配基因{hits.length>pageSize&&
        ` · 当前 ${(offset+1).toLocaleString()}–${Math.min(offset+pageSize,hits.length).toLocaleString()}`}</p>
      <div className="catalog-list">
        {hits.slice(offset,offset+pageSize).map(({gene,traits,supported})=><div className="catalog-row" key={gene.id} onClick={()=>{onChoose(gene,activeTrait||supported[0]?.id);setOpen(false);}}>
          <button type="button" className="catalog-gene">
            <b>{gene.catalog.msu||gene.catalog.rap||gene.catalog.sourceId}</b>
            <small>{[gene.name,...gene.catalog.aliases.filter(a=>a!==gene.name).slice(0,4)].join(' / ')}</small>
          </button>
          <SourceBadges data={data} gene={gene} phenotypeDataset={dataset} onInspect={(...args)=>{setOpen(false);onInspect(...args);}}/>
          <PrimaryTraits traits={traits} supported={supported}/>
        </div>)}
        {!hits.length&&<p>没有匹配项。可改用编号或切换数据集与证据。</p>}
      </div>
      <div className="dialog-actions">
        <Button type="button" variant="soft" color="gray" onClick={exportCatalog}>下载基因目录 TXT</Button>
        {hits.length>pageSize&&<span className="catalog-pager">
          <Button disabled={!offset} variant="soft" onClick={()=>setPage(offset/pageSize-1)}>上一页</Button>
          <Button disabled={offset+pageSize>=hits.length} variant="soft" onClick={()=>setPage(offset/pageSize+1)}>下一页</Button>
        </span>}
        <Dialog.Close><Button>关闭</Button></Dialog.Close>
      </div>
    </Dialog.Content></Dialog.Root>
  </>;
}
