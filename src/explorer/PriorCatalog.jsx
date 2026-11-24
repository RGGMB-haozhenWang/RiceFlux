import {useText} from './locale.jsx';
import React,{useMemo,useState} from 'react';
import {Button,Dialog} from '@radix-ui/themes';
import {MagnifyingGlassIcon} from '@radix-ui/react-icons';
import {SourceBadges} from './SourceBadges.jsx';
import {findGenes} from './geneSearch.js';
import {canonicalTraitKey} from './traitVocabulary.js';
import {geneEvidence,geneSupport,geneTraits,hasPhenotypes} from './provenance.js';
import {datasetBadge,datasetTint} from './datasetColors.js';
import {downloadTable} from './formats.js';
import {supportsTraitAssessment} from './traitEvidence.js';

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
  const localize = useText();
  if(!traits.length)return <div className="catalog-traits"><small>{localize("暂无已登记性状")}</small></div>;
  const observed=new Set(supported.map(t=>t.id));
  const ordered=[...supported,...traits.filter(t=>!observed.has(t.id))];
  return <div className="catalog-traits" aria-label={localize("主要性状及实测状态")}>
    {ordered.slice(0,4).map(t=>observed.has(t.id)
      ? <span key={t.id} className="source-badge phenotype-support" title={localize("当前所选数据集有实测表型")}>P · {localize(t.name)}</span>
      : <span key={t.id} className="catalog-unmeasured">{localize(t.name)}{" "+localize("· 暂无实测")}</span>)}
    {ordered.length>4&&<small>{localize("另")+" "}{localize(ordered.length-4)}{" "+localize("项")}</small>}
  </div>;
}

export function PriorFinder({data,onChoose,onInspect}){
  const localize = useText();
  const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[dataset,setDataset]=useState('all');
  const [evidence,setEvidence]=useState('all'),[traitId,setTrait]=useState(''),[page,setPage]=useState(0);
  const traitIndex=useMemo(()=>{
    const byGene=new Map(),options=new Map();
    if(open)for(const gene of data.genes){
      const traits=geneTraits(data,gene);
      byGene.set(gene.id,traits);
      for(const trait of traits)options.set(canonicalTraitKey(trait.name),trait);
    }
    return {byGene,options};
  },[open,data]);
  const activeTrait=traitIndex.options.has(traitId)?traitId:'';
  const hits=useMemo(()=>{
    if(!open)return [];
    return findGenes(data.genes,query).flatMap(gene=>{
      if(evidence==='goal_profile'&&!supportsTraitAssessment(gene))return [];
      const linked=traitIndex.byGene.get(gene.id);
      const traits=activeTrait?linked.filter(t=>canonicalTraitKey(t.name)===activeTrait):linked;
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
      'reference_model','catalog_group','identity_status','original_names','evidence_abstract','bibliography_status','indel_datasets','catalog_dois'];
    downloadTable({filename:'riceflux_gene_catalog.txt',columns},data.genes.map(g=>({
      gene_id:g.id,MSU_ID:g.catalog?.msu,RAP_ID:g.catalog?.rap,gene_name:g.name,aliases:g.catalog?.aliases?.join(';'),
      chromosome:g.chromosome,gene_start:g.gene_start,gene_end:g.gene_end,reference_model:g.model,
      catalog_group:g.catalog?.collection||'prior',
      identity_status:g.catalog?.identityStatus,original_names:g.catalog?.originalNames?.join(';'),
      evidence_abstract:g.catalog?.evidenceAbstract,bibliography_status:g.catalog?.bibliographyStatus,
      indel_datasets:geneSupport(data,g).filter(r=>Number(r.indel_sites)>0).map(r=>r.dataset_id+'='+r.indel_sites).join(';'),
      catalog_dois:g.catalog?.geneDOI?.join(';'),
    })));
  }
  return <>
    <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Trigger><Button className="prior-search" size="2" variant="soft"><MagnifyingGlassIcon/>{localize("查基因")}</Button></Dialog.Trigger>
    <Dialog.Content maxWidth="720px">
      <Dialog.Title>{localize("水稻先验基因库")}</Dialog.Title>
      <Dialog.Description>{localize("按基因名或 ID 检索。InDel 表示至少一个已登记数据集观察到非参考等位。P 表示有实测表型。")}</Dialog.Description>
      <div className="catalog-filters source-filters">
        <input aria-label={localize("检索全库")} type="search" placeholder={localize("基因名、别名、MSU / RAP 编号")} value={query} onChange={change(setQuery)}/>
        <select aria-label={localize("按关联性状筛选")} value={activeTrait} onChange={change(setTrait)}>
          <option value="">{localize("全部关联性状")}</option>
          {[...traitIndex.options.values()].sort((a,b)=>a.name.localeCompare(b.name,'zh')).map(t=><option key={canonicalTraitKey(t.name)} value={canonicalTraitKey(t.name)}>{localize(t.name)}</option>)}
        </select>
        <select aria-label={localize("数据集覆盖")} className="dataset-tint" style={dataset==='all'?undefined:datasetTint(dataset,data.datasetRegistry)} value={dataset} onChange={change(setDataset)}>
          <option value="all">{localize("全部数据集 / All datasets")}</option>
          {data.datasetRegistry.map(r=><option key={r.id} value={r.id}>{localize(datasetBadge(r.id,data.datasetRegistry))} · {localize(r.name)}</option>)}
        </select>
        <select aria-label={localize("证据与实测表型")} value={evidence} onChange={change(setEvidence)}>
          <option value="all">{localize("全部证据 / All evidence")}</option>
          <optgroup label={localize("实测表型 / Phenotypes")}>
            <option value="goal_profile">{localize("性状目标判型 · V4")}</option>
            <option value="P">{localize("P · 有实测性状")}</option>
            <option value="no_phenotype">{localize("关联性状均暂无实测")}</option>
          </optgroup>
          <optgroup label={localize("分型与文献 / Calls and literature")}>
            <option value="F">{localize("F · 文献功能位点")}</option>
            <option value="H">{localize("H · 文献单倍型组分")}</option>
            <option value="indel">{localize("InDel · 有分型")}</option>
            <option value="L">{localize("L · 基因层文献")}</option>
            <option value="regional">{localize("区域标记")}</option>
            <option value="untyped">{localize("未接入分型")}</option>
          </optgroup>
        </select>
      </div>
      <p className="footnote">{localize(hits.length.toLocaleString())}{" "+localize("个匹配基因")}{hits.length>pageSize&&
        localize(" · 当前 #0#–#1#", [(offset+1).toLocaleString(), Math.min(offset+pageSize,hits.length).toLocaleString()])}</p>
      <div className="catalog-list">
        {hits.slice(offset,offset+pageSize).map(({gene,traits,supported})=><div className="catalog-row" key={gene.id} onClick={()=>{onChoose(gene,(activeTrait?traits[0]?.id:undefined)||supported[0]?.id);setOpen(false);}}>
          <button type="button" className="catalog-gene">
            <b>{localize(gene.catalog.msu||gene.catalog.rap||gene.catalog.sourceId)}</b>
            <small>{localize([gene.name,...[...new Set([...(gene.catalog.aliases||[]),...(gene.catalog.originalNames||[])])].filter(a=>a!==gene.name).slice(0,4)].join(' / '))}</small>
          </button>
          <SourceBadges data={data} gene={gene} phenotypeDataset={dataset} onInspect={(...args)=>{setOpen(false);onInspect(...args);}}/>
          <PrimaryTraits traits={traits} supported={supported}/>
          {gene.catalog.identityStatus&&<small className="catalog-identity-status">{localize("身份：")}{localize(gene.catalog.identityStatus)}</small>}
          {(gene.catalog.evidenceAbstract||gene.catalog.bibliographyStatus)&&<details className="catalog-evidence-summary" onClick={e=>e.stopPropagation()}>
            <summary>{localize("证据摘要与出处状态")}</summary>
            {gene.catalog.evidenceAbstract&&<p>{localize(gene.catalog.evidenceAbstract)}</p>}
            {gene.catalog.bibliographyStatus&&<small>{localize("出处：")}{localize(gene.catalog.bibliographyStatus)}</small>}
          </details>}
        </div>)}
        {!hits.length&&<p>{localize("没有匹配项。可改用编号或切换数据集与证据。")}</p>}
      </div>
      <div className="dialog-actions">
        <Button type="button" variant="soft" color="gray" onClick={exportCatalog}>{localize("下载基因目录 TXT")}</Button>
        {hits.length>pageSize&&<span className="catalog-pager">
          <Button disabled={!offset} variant="soft" onClick={()=>setPage(offset/pageSize-1)}>{localize("上一页")}</Button>
          <Button disabled={offset+pageSize>=hits.length} variant="soft" onClick={()=>setPage(offset/pageSize+1)}>{localize("下一页")}</Button>
        </span>}
        <Dialog.Close><Button>{localize("关闭")}</Button></Dialog.Close>
      </div>
    </Dialog.Content></Dialog.Root>
  </>;
}
