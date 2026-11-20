import {WorkspaceTools,WorkspaceLayout,WorkspaceNavigation,defaultLayout,expandableSections,jumpToSection} from './Workspace.jsx';
import {SitePicker} from './SitePicker.jsx';
import {analysisSites} from './siteSelection.js';
import {geneSchemes} from './jointHaplotypes.js';
const MaterialPanel=React.lazy(()=>import('./MaterialPanel.jsx').then(m=>({default:m.MaterialPanel})));
import {EvidencePanel} from './EvidencePanel.jsx';
const RiceNaviPanel=React.lazy(()=>import('./RiceNaviPanel.jsx').then(m=>({default:m.RiceNaviPanel})));
const BreederWorkspace=__RICEFLUX_AUDIENCE__==='researcher'?null:
  React.lazy(()=>import('./BreederWorkspace.jsx').then(m=>({default:m.BreederWorkspace})));
import {geneTables,zipTables} from './exports.js';
import {combineDatasets,readPackage} from './datasets.js';
import {SampleList} from './SampleList.jsx';
import {AlleleFrequency,alleleFrequencyText,markerQuality} from './AlleleFrequency.jsx';
import {extendDataset} from './dataImport.js';
import {DataPanel} from './DataPanel.jsx';
import {PopulationComposition} from './PopulationComposition.jsx';
const ComparePanel=React.lazy(()=>import('./ComparePanel.jsx').then(m=>({default:m.ComparePanel})));
const IndelDetails=React.lazy(()=>import('./IndelDetails.jsx').then(m=>({default:m.IndelDetails})));
import {PhenotypeProfile} from './PhenotypeProfile.jsx';
import {SourceBadges} from './SourceBadges.jsx';
import {Tutorial} from './Tutorial.jsx';
import {GenomeTrack} from './GenomeTrack.jsx';
import {markerAnnotation} from './alleles.js';
import {MarkerIcon,markerNames} from './VariantMark.jsx';
import {PavPanel} from './PavPanel.jsx';
import {formats,matchesMaterial,saveFile} from './formats.js';
import {callOf} from './catalog.js';
import {PriorFinder} from './PriorCatalog.jsx';
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Theme, Select, Button, Checkbox, Dialog, TextField, Switch} from '@radix-ui/themes';
import {ChevronDownIcon, DownloadIcon, MagnifyingGlassIcon, InfoCircledIcon, PersonIcon, LayersIcon, CheckIcon, ResetIcon} from '@radix-ui/react-icons';
import './theme.css';
import './style.css';
import {validateDataset, selectCohort, inMaterialScope, alleleStats, genotypeGroups, gtToken, quantile, percent} from './model.js';

import {regionalView, siteName} from './regions.js';
import {AccessionCalls} from './AccessionCalls.jsx';
import {HaplotypeMatches} from './HaplotypeMatches.jsx';
import {RegionalPhenotypes} from './RegionalPhenotypes.jsx';
import './desktop.css';
import {loadAbstracts,loadExplorer,loadRegistered} from './observed.js';
import {geneSupport,geneTraits,hasPhenotypes} from './provenance.js';
import {loadTraitEvidence,traitEvidenceFor} from './traitEvidence.js';
const initialView=new URLSearchParams(location.search).get('view');
const demo=initialView==='demo'&&__RICEFLUX_AUDIENCE__!=='breeder';
const embedded=new URLSearchParams(location.search).get('embed')==='1';
const isTraitOption=trait=>trait.category!=='基因先验';
function preferredTrait(data,gene){
  const options=geneTraits(data,gene);
  return options.find(t=>hasPhenotypes(t))?.id??options[0]?.id
    ??gene.trait_ids.findLast(id=>data.traits.some(t=>t.id===id&&isTraitOption(t)))??gene.trait_ids[0];
}
function initialSelection(data,requested=''){
  if(data.meta.synthetic)return ['heading','SIM_HD01'];
  const gene=(requested&&data.genes.find(g=>g.id===requested || g.name===requested || g.catalog?.sourceId===requested || g.catalog?.msu===requested || g.catalog?.rap===requested)) || data.genes.find(g=>g.name==='DTH7');
  return [preferredTrait(data,gene),gene.id];
}
const allMaterials={materialScope:'all',individualIds:[],individualOnly:false};
const defaultWorkspace={
  ...allMaterials,geneId:'SIM_HD01',traitId:'heading',popIds:[],variantId:'',
  minMaf:.05,maxMissing:.2,plotSelection:{},siteSelections:{},traitTargets:{},
  layout:defaultLayout,display:{mode:'desk',tab:'overview',text:'standard'},material:{},compare:{},breeder:{},
};
const defaultCohort=data=>({...allMaterials,popIds:data.populations.map(p=>p.id)});
function extendRows(event,more){
  const box=event.currentTarget;
  if(box.scrollTop+box.clientHeight>=box.scrollHeight-80)more();
}
const COLORS=['#438e7b','#7b9fc6','#ba9cc6','#d6aa71','#8a9e8e','#c58383','#8d92bc','#86b5ba'];
const evidenceName={G_chip:'观测分型',G_projected:'投影分型',G_direct:'直接检测',G_mixed:'混合分型证据',G_none:'仅表型'};
const fmt=n=>n==null?'—':Number(n.toFixed(2)).toString();
function Choice({label,value,options,onChange}) {return <label className="choice"><span>{label}</span><Select.Root value={value} onValueChange={onChange}><Select.Trigger aria-label={label}/><Select.Content position="popper">{options.map(o=><Select.Item key={o.id} value={o.id}>{o.name}</Select.Item>)}</Select.Content></Select.Root></label>;}
function GeneTraitChoice({trait,options,onChange}){
  if(trait.id==='all_prior')return <span><i/>暂无已登记性状</span>;
  if(options.length<2)return <span><i/>{trait.name}</span>;
  const observed=options.filter(t=>hasPhenotypes(t));
  const unavailable=options.filter(t=>!hasPhenotypes(t));
  const activeInList=options.some(t=>t.id===trait.id);
  return <span className="gene-trait-choice">
    <label htmlFor="gene-trait">关联性状</label>
    <select id="gene-trait" aria-label="切换当前基因性状" value={trait.id} onChange={e=>onChange(e.target.value)}>
      {!activeInList&&<option value={trait.id}>{trait.name} · 当前视图</option>}
      {observed.length>0&&<optgroup label="有实测表型">{observed.map(t=><option key={t.id} value={t.id}>P · {t.name}</option>)}</optgroup>}
      {unavailable.length>0&&<optgroup label="暂无实测表型">{unavailable.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</optgroup>}
    </select>
  </span>;
}
function Toggle({checked,onChange,children}) {return <label className="toggle"><Checkbox checked={checked} onCheckedChange={onChange}/><span>{children}</span></label>;}
function Panel({title,sub,tag,children,className=''}) {return <section className={`panel ${className}`}><div className="panel-title"><div><h2>{title}</h2>{sub&&<p>{sub}</p>}</div>{tag&&<span className="panel-tag">{tag}</span>}</div>{children}</section>;}
function Empty({children}) {return <div className="empty"><LayersIcon/><p>{children}</p></div>;}

function ToolbarMenu({children}){
  const menu=useRef(null);
  useEffect(()=>{
    function closeOutside(event){if(menu.current?.open&&!menu.current.contains(event.target))menu.current.open=false;}
    document.addEventListener('pointerdown',closeOutside);
    document.addEventListener('focusin',closeOutside);
    return()=>{document.removeEventListener('pointerdown',closeOutside);document.removeEventListener('focusin',closeOutside);};
  },[]);
  return <details className="reader-more" ref={menu} onKeyDown={e=>{
    if(e.key==='Escape'&&menu.current.contains(e.target)){menu.current.open=false;menu.current.querySelector('summary').focus();}
  }}>
    <summary>更多<ChevronDownIcon aria-hidden="true"/></summary>
    <div className="reader-more-list" onClick={e=>{
      if(e.currentTarget.contains(e.target)&&e.target.closest('button')&&menu.current.open){
        menu.current.open=false;
        menu.current.querySelector('summary').focus({preventScroll:true});
      }
    }}>{children}</div>
  </details>;
}

function GeneTrack({gene,variants,selected,onSelect}) {
  const scale=p=>42+(p-gene.start)/(gene.end-gene.start)*710;
  const promoter=gene.promoter||{start:gene.strand==='+'?gene.start:gene.gene_end, end:gene.strand==='+'?gene.gene_start:gene.end};
  return <div className="track-scroll"><svg className="gene-track" viewBox="0 0 800 170" role="group" aria-label={`${gene.name} 基因结构和变异位置`}>
    <text x="42" y="20" className="track-label">{gene.chromosome} · {gene.assembly} · {demo?'示意坐标':'参考坐标'}</text><text x="752" y="20" textAnchor="end" className="track-label">{gene.strand} 链</text>
    {[0,.25,.5,.75,1].map(t=><g key={t}><line x1={42+710*t} x2={42+710*t} y1="32" y2="137" stroke="#eef1f3"/><text x={42+710*t} y="158" textAnchor="middle" className="axis">{Math.round(gene.start+(gene.end-gene.start)*t).toLocaleString()}</text></g>)}
    <line x1={scale(gene.gene_start)} x2={scale(gene.gene_end)} y1="74" y2="74" stroke="#4d897a" strokeWidth="2"/>
    {gene.features.map((f,i)=><rect key={i} x={scale(f.start)} y="62" width={scale(f.end)-scale(f.start)} height="24" rx="3" fill="#659d8d"/>)}
    <rect x={scale(promoter.start)} y="65" width={scale(promoter.end)-scale(promoter.start)} height="18" fill="#e4ece8" rx="3"/>
    <text x={scale((gene.gene_start+gene.gene_end)/2)} y="49" textAnchor="middle" className="track-name">{gene.name} {gene.strand==='+'?'→':'←'}</text>
    {gene.variants.map(v=><g key={v.id} opacity={variants.includes(v)?1:.25} role="button" tabIndex={variants.includes(v)?0:-1} aria-disabled={!variants.includes(v)} aria-label={`选择位点 ${v.id}`} onClick={()=>variants.includes(v)&&onSelect(v.id)} onKeyDown={e=>{if(variants.includes(v)&&(e.key==='Enter'||e.key===' ')){e.preventDefault();onSelect(v.id);}}}><line x1={scale(v.pos)} x2={scale(v.pos)} y1="89" y2="113" stroke={selected?.id===v.id?'#3572c5':'#9ab5c7'} strokeWidth="1.5"/><circle cx={scale(v.pos)} cy="119" r={selected?.id===v.id?6:4} fill={selected?.id===v.id?'#3572c5':'#a8bfce'}/><title>{v.id} · {v.pos} · {v.ref}→{v.alt??'—'} · {v.feature}</title></g>)}
  </svg></div>;
}

function Phenotypes({groups,trait,selectedIds}) {
  const values=groups.flatMap(g=>g.members.map(s=>s.phenotypes[trait.id])).filter(Number.isFinite);
  if(!values.length)return <Empty>当前没有可用的表型值。</Empty>;
  const lo=Math.min(...values)-1,hi=Math.max(...values)+1,x=v=>100+(v-lo)/(hi-lo)*570;
  return <div className="plot-scroll"><svg viewBox={`0 0 750 ${60+groups.length*48}`} role="img" aria-label={`${trait.name}按基因型组合的表型分布，点代表个体，线框为四分位范围`}>
    {[0,.25,.5,.75,1].map(t=><g key={t}><line x1={100+t*570} x2={100+t*570} y1="15" y2={groups.length*48+20} stroke="#edf0f3"/><text x={100+t*570} y={groups.length*48+43} textAnchor="middle" className="axis">{fmt(lo+(hi-lo)*t)}</text></g>)}
    {groups.map((g,i)=>{const vals=g.members.map(s=>s.phenotypes[trait.id]).filter(Number.isFinite),y=38+i*48;const q1=quantile(vals,.25),med=quantile(vals,.5),q3=quantile(vals,.75);return <g key={g.key}><text x="12" y={y} className="plot-group">G{String(i+1).padStart(2,'0')}</text><text x="48" y={y} className="axis">n={vals.length}</text>{vals.length>0&&<><line x1={x(Math.min(...vals))} x2={x(Math.max(...vals))} y1={y-4} y2={y-4} stroke={COLORS[i%8]}/><rect x={x(q1)} y={y-16} width={Math.max(1,x(q3)-x(q1))} height="24" fill={COLORS[i%8]} fillOpacity=".12" stroke={COLORS[i%8]} rx="3"/><line x1={x(med)} x2={x(med)} y1={y-16} y2={y+8} stroke={COLORS[i%8]} strokeWidth="2"/>{g.members.filter(s=>Number.isFinite(s.phenotypes[trait.id])).map((s,j)=><circle key={s.id} cx={x(s.phenotypes[trait.id])} cy={y-4+((j%5)-2)*3} r={selectedIds.includes(s.id)?4:2.8} fill={COLORS[i%8]} stroke={selectedIds.includes(s.id)?'#1f313c':'none'} strokeWidth="1.5"><title>{s.id} · {s.phenotypes[trait.id]} {trait.unit}</title></circle>)}</>}</g>;})}
  </svg></div>;
}

function App() {
  const [data,setData]=useState(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  const [workspace,setWorkspace]=useState(defaultWorkspace);
  const {traitId,geneId,popIds,individualIds,individualOnly,materialScope,minMaf,maxMissing,variantId,plotSelection,siteSelections,traitTargets,
    layout,display,material:materialSettings,compare:compareSettings,breeder:breederSettings}=workspace;
  const readerLayout=useMemo(()=>demo?layout.filter(p=>p.id==='individuals'||p.id!=='evidence'&&!expandableSections.includes(p.id)):layout,[layout]);
  const [groupKey,setGroup]=useState(null),[showAll,setShowAll]=useState(false);
  const [pick,setPick]=useState(false),[query,setQuery]=useState(''),[help,setHelp]=useState(false),[notice,setNotice]=useState('');
  const [breederOpen,setBreederOpen]=useState(initialView==='breeder');
  const [memberLimit,setMemberLimit]=useState(96),[pickerLimit,setPickerLimit]=useState(96);
  const [geneLoad,setGeneLoad]=useState(null),geneRequest=useRef(0);
  const [filters,setFilters]=useState(false),toolbar=useRef(null);
  const [inspection,setInspection]=useState(null);
  const [traitSources,setTraitSources]=useState(null),[traitSourceError,setTraitSourceError]=useState('');
  function update(patch){
    setWorkspace(current=>({...current,...(typeof patch==='function'?patch(current):patch)}));
  }
  const setting=key=>value=>update(current=>({[key]:typeof value==='function'?value(current[key]):value}));
  const setVariant=setting('variantId'),setIndividuals=setting('individualIds'),setLayout=setting('layout');
  function inspectIndel(gene,markerId,sourceId,trigger){
    setInspection({gene,markerId,sourceId,trigger});
  }
  function selectMarker(variant,trigger){
    setVariant(variant.id);
    if(!demo&&variant.markerType==='InDel')inspectIndel(gene,variant.id,undefined,trigger);
  }
  useEffect(()=>{const c=new AbortController();setError('');
    const requested=decodeURIComponent(location.hash.slice(1))||new URLSearchParams(location.search).get('gene');
    loadExplorer(import.meta.env.BASE_URL,demo,c.signal,d=>initialSelection(d,requested)[1]).then(validateDataset).then(d=>{
      if(c.signal.aborted)return;
      const [traitId,geneId]=initialSelection(d,requested);
      update({traitId,geneId,...defaultCohort(d)});
      setData(d);
    }).catch(e=>{if(e.name!=='AbortError')setError(e.message);});
    return()=>c.abort();
  },[retry]);
  useEffect(()=>{if(notice){const t=setTimeout(()=>setNotice(''),4000);return()=>clearTimeout(t);}},[notice]);
  const gene=data?.genes.find(g=>g.id===geneId);
  const assessmentPilot=!demo&&!breederOpen&&Boolean(gene?.catalog?.core&&!gene.catalog.historical);
  useEffect(()=>{
    if(!assessmentPilot)return;
    let current=true;
    loadTraitEvidence(import.meta.env.BASE_URL).then(source=>{
      if(current){setTraitSources(source);setTraitSourceError('');}
    },error=>{if(current)setTraitSourceError(error.message);});
    return()=>{current=false;};
  },[assessmentPilot]);
  const traitReview=useMemo(()=>assessmentPilot?
    {...traitEvidenceFor(traitSources,gene),error:traitSourceError,loading:!traitSources&&!traitSourceError}:null,
    [assessmentPilot,traitSources,gene,traitSourceError]);
  const relatedTraits=useMemo(()=>gene?geneTraits(data,gene):[],[data,gene]);
  const trait=data?.traits.find(t=>t.id===traitId)||relatedTraits.find(t=>t.id===traitId);
  const view=useMemo(()=>regionalView(trait,plotSelection),[trait,plotSelection]);
  const tablePhenotype=view?.active.id || traitId;
  const tableHeading=view ? trait.name+' · '+siteName(view.active.source.site)+' '+view.year+(view.assays.length>1?' · '+view.assay:'')+' ('+view.unit+')' : trait?.name+' ('+trait?.unit+')';
  function changePlot(patch){update({plotSelection:{assay:view.assay,year:view.year,site:view.active.source.site,...patch}});}
  function setTraitTarget(key,range){
    update(current=>{
      const traitTargets={...current.traitTargets};
      if(range)traitTargets[key]=range;
      else delete traitTargets[key];
      return {traitTargets};
    });
  }
  function inspectTrial(trait,trial){
    update({traitId:trait.id,plotSelection:{assay:trial.assay,year:trial.year,site:trial.active.source.site},display:{...display,tab:'individuals'}});
    setGroup(null);
    requestAnimationFrame(()=>jumpToSection('individuals'));
  }
  function goToSection(id){
    if(jumpToSection(id))setting('display')(value=>({...value,tab:id}));
  }
  const cohort=useMemo(()=>data?selectCohort(data,popIds,individualIds,individualOnly,materialScope):[],[data,popIds,individualIds,individualOnly,materialScope]);
  const scopeMembers=useMemo(()=>data?.individuals.filter(s=>inMaterialScope(s,materialScope))||[],[data,materialScope]);
  const eligible=useMemo(()=>scopeMembers.filter(s=>popIds.includes(s.population_id)),[scopeMembers,popIds]);
  const groupCounts=useMemo(()=>{
    const counts=new Map();
    for(const sample of scopeMembers)counts.set(sample.population_id,(counts.get(sample.population_id)||0)+1);
    return counts;
  },[scopeMembers]);
  const scopeGroups=data?.populations.filter(p=>groupCounts.has(p.id))||[];
  const scopes=useMemo(()=>{
    if(!data||demo)return [];
    const counts=new Map();
    let legacy=0;
    for(const sample of data.individuals){
      counts.set(sample.kind,(counts.get(sample.kind)||0)+1);
      if(sample.legacy)legacy++;
    }
    const labels={'modern cultivar':'现代品种',landrace:'地方品种'};
    return [{id:'all',name:'全部材料 · '+data.individuals.length},
      ...[...counts].map(([id,count])=>({id,name:(labels[id]||id)+' · '+count})),
      ...(legacy?[{id:'legacy',name:'原分析现代籼稻 · '+legacy}]:[])];
  },[data]);
  function changeScope(scope) {
    const members=data.individuals.filter(s=>inMaterialScope(s,scope));
    const ids=new Set(members.map(s=>s.id));
    update(current=>({materialScope:scope,popIds:[...new Set(members.map(s=>s.population_id))],
      individualIds:current.individualIds.filter(id=>ids.has(id)),individualOnly:false}));
    setGroup(null);
  }
  const matchingIndividuals=pick?eligible.filter(s=>matchesMaterial(s,query)):[];
  const sites=useMemo(()=>gene?analysisSites(cohort,gene,siteSelections[geneId],minMaf,maxMissing):{variants:[],ready:false,mode:'qc',missing:[]},[cohort,gene,siteSelections,geneId,minMaf,maxMissing]);
  const variants=sites.variants;
  const schemes=useMemo(()=>gene&&!demo?geneSchemes(gene,data.evidence):[],[gene,data?.evidence]);
  function selectSites(selection){
    update(current=>{
      const siteSelections={...current.siteSelections};
      if(selection)siteSelections[geneId]=selection;
      else delete siteSelections[geneId];
      return {siteSelections,variantId:''};
    });
    setGroup(null);setShowAll(false);
  }
  const selected=variants.find(v=>v.id===variantId)||variants[0];
  const stats=selected?alleleStats(cohort,selected):null;
  const groups=useMemo(()=>sites.ready?genotypeGroups(cohort,variants):[],[cohort,sites]);
  const complete=groups.reduce((n,g)=>n+g.members.length,0),visibleGroups=useMemo(()=>showAll?groups:groups.slice(0,8),[showAll,groups]);
  const group=groups.find(g=>g.key===groupKey),tableRows=group?group.members:cohort;
  const selectedStats=selected?alleleStats(cohort.filter(s=>individualIds.includes(s.id)),selected):null;
  useEffect(()=>setMemberLimit(96),[geneId,traitId,popIds,groupKey,individualOnly,minMaf,maxMissing]);
  useEffect(()=>setPickerLimit(96),[pick,query,popIds]);
  function switchGeneTrait(id){
    if(id===traitId)return;
    geneRequest.current++;
    setGeneLoad(null);
    update({traitId:id,plotSelection:{}});
  }
  function chooseTrait(id){
    const candidates=data.genes.filter(g=>g.trait_ids.includes(id));
    if(candidates.some(g=>g.id===geneId))switchGeneTrait(id);
    else if(candidates.length)chooseGene(candidates[0].id,id);
  }
  function linkGene(id){
    if(!demo)history.replaceState(null,'','#'+encodeURIComponent(id));
  }
  async function chooseGene(id,trait=traitId,clearPlot=trait!==traitId){
    const request=++geneRequest.current;
    const name=data.genes.find(g=>g.id===id)?.name||id;
    try{
      if(data.genesReady&&!data.genesReady([id])){
        setGeneLoad({name});
        await data.loadGenes([id]);
      }
      if(request!==geneRequest.current)return;
      setGeneLoad(null);
      linkGene(id);
      update(current=>({geneId:id,traitId:trait,variantId:'',display:{...current.display,tab:'overview'},...(clearPlot?{plotSelection:{}}:{})}));
      setGroup(null);
      requestAnimationFrame(()=>window.scrollTo({top:0}));
    }catch(error){
      if(request===geneRequest.current)setGeneLoad({name,error:error.message,id,trait,clearPlot});
    }
  }
  function togglePop(id){
    update(current=>{
      const popIds=current.popIds.includes(id)?current.popIds.filter(p=>p!==id):[...current.popIds,id];
      const eligible=new Set(scopeMembers.filter(s=>popIds.includes(s.population_id)).map(s=>s.id));
      return {popIds,individualIds:current.individualIds.filter(id=>eligible.has(id))};
    });
    setGroup(null);
  }
  function applySampleList(samples){
    update({materialScope:'all',popIds:[...new Set(samples.map(s=>s.population_id))],
      individualIds:samples.map(s=>s.id),individualOnly:true});
    setGroup(null);
    setFilters(false);
    setNotice(`已按名单圈定 ${samples.length} 份材料`);
  }
  function toggleIndividual(id){setIndividuals(ids=>ids.includes(id)?ids.filter(x=>x!==id):[...ids,id]);}
  function reset(){
    const [t,g]=initialSelection(data);
    update({...defaultCohort(data),minMaf:defaultWorkspace.minMaf,maxMissing:defaultWorkspace.maxMissing,
      siteSelections:{},plotSelection:{},variantId:''});
    setGroup(null);setShowAll(false);
    chooseGene(g,t);
  }
  const workspaceConfig={...workspace,groupBy:data?.meta.groupBy};
  function changeView(open){
    const url=new URL(location.href);
    if(open)url.searchParams.set('view','breeder');
    else{
      url.searchParams.delete('view');
      url.searchParams.delete('task');
    }
    history.replaceState(null,'',url);
    setBreederOpen(open);
  }
  async function applyData(next,config){
    const request=++geneRequest.current;
    setGeneLoad(null);
    await next.loadGenes?.([config.geneId||geneId]);
    if(request!==geneRequest.current)throw Error('分析设置已更新，请重试这次数据切换。');
    setData(next);
    update(config);
    setGroup(null);setShowAll(false);
  }
  async function chooseDatasets(next){
    const g=next.genes.find(g=>g.id===geneId);
    const options=geneTraits(next,g);
    const nextTrait=options.find(t=>t.id===traitId)||options.find(t=>t.name===trait?.name);
    await applyData(next,{...defaultCohort(next),plotSelection:{},
      traitId:nextTrait?.id??(next.traits.some(t=>t.id===traitId)?traitId:preferredTrait(next,g))});
    setNotice('数据集与分组已更新');
  }
  async function restoreWorkspace(saved){
    const bundles=[],entries=[...(data.reference.datasetRegistry||data.datasetRegistry).filter(r=>!r.local)];
    for(const d of saved.datasets){
      const local=saved.local_datasets?.find(b=>b.manifest.id===d.id);
      if(local){
        if(local.manifest.version!==d.version)throw Error('本地数据版本不匹配');
        if(local.overlays){
          const source=entries.find(r=>r.id===d.id&&r.version===local.baseVersion);
          if(!source)throw Error('工作区依赖的底表版本不可用：'+d.id);
          let bundle=await loadRegistered(import.meta.env.BASE_URL,source,data.reference);
          if(bundle.sourceBundle)bundle=await bundle.sourceBundle();
          for(const patch of local.overlays)bundle=extendDataset(bundle,patch.kind,patch.input,patch.metadata,data.reference);
          if(bundle.manifest.version!==d.version)throw Error('追加数据版本不匹配');
          bundles.push({...bundle,baseVersion:local.baseVersion,overlays:local.overlays});
        }else bundles.push(await readPackage(local.manifest,name=>local.texts[Object.keys(local.manifest.files).find(k=>local.manifest.files[k]===name)],data.reference));
        const i=entries.findIndex(r=>r.id===d.id),item={...d,local:true};
        if(i<0)entries.push(item);else entries[i]=item;
      }else{
        const row=entries.find(r=>r.id===d.id&&!r.local);
        if(!row||row.version!==d.version)throw Error('工作区依赖的数据集版本不可用：'+d.id+' / '+d.version);
        bundles.push(data.datasetBundles.find(b=>b.manifest.id===d.id&&b.manifest.version===d.version)||await loadRegistered(import.meta.env.BASE_URL,row,data.reference));
      }
    }
    const c=saved.config,next=validateDataset(combineDatasets(data.reference,bundles,c.groupBy||data.meta.groupBy,entries));
    const restoredGene=next.genes.find(g=>g.id===c.geneId);
    if(!restoredGene)throw Error('工作区基因已不兼容');
    const storedTrait=next.traits.find(t=>t.id===c.traitId)||geneTraits(next,restoredGene).find(t=>t.id===c.traitId);
    if(!storedTrait)throw Error('工作区性状已不兼容');
    const restoredTrait=isTraitOption(storedTrait)?c.traitId:preferredTrait(next,restoredGene);
    const populationIds=new Set(next.populations.map(p=>p.id)),sampleIds=new Set(next.individuals.map(s=>s.id));
    const config=Object.fromEntries(Object.entries(defaultWorkspace).map(([key,fallback])=>[key,c[key]??fallback]));
    await applyData(next,{...config,traitId:restoredTrait,display:c.display||{...defaultWorkspace.display,mode:'free'},
      popIds:c.popIds.filter(id=>populationIds.has(id)),individualIds:c.individualIds.filter(id=>sampleIds.has(id)),
      plotSelection:restoredTrait===c.traitId?(c.plotSelection||{}):{}});
    linkGene(c.geneId);
    if(c.display?.tab&&c.display.tab!=='overview')requestAnimationFrame(()=>jumpToSection(c.display.tab));
  }
  async function download(){const abstracts=demo?undefined:await loadAbstracts(import.meta.env.BASE_URL).catch(()=>undefined);const files=geneTables({...data,abstracts},gene,cohort,variants,workspaceConfig);saveFile('riceflux_'+geneId+'_tables.zip',zipTables(files),'application/zip');setNotice('已导出基因、分型、表型、频率及证据 TXT 包');}

  if(!data)return <Theme accentColor="blue"><main className="loading"><h1>Flux Explorer</h1><p role={error?'alert':'status'}>{error||'正在载入群体与变异数据…'}</p>{error&&<Button onClick={()=>setRetry(x=>x+1)}>重新载入</Button>}<a href="https://github.com/RGGMB-haozhenWang/RiceFlux">查看项目仓库</a></main></Theme>;
  const availableSources=gene.variants.length?[]:geneSupport(data,gene)
    .filter(r=>Number(r.marker_count)>0&&!data.meta.datasets?.some(d=>d.id===r.dataset_id));
  const researcher=__RICEFLUX_AUDIENCE__==='researcher'||(__RICEFLUX_AUDIENCE__!=='breeder'&&(!breederOpen||demo));
  const geneIdentity=gene.catalog?.msu||gene.id;
  const controls=<>
    {!demo&&<DataPanel data={data} onApply={chooseDatasets} gene={gene}/>}
    <WorkspaceTools data={data} config={workspaceConfig} onLayout={setLayout} onDisplay={setting('display')} onRestore={restoreWorkspace}/>
    <Button variant="ghost" color="gray" onClick={()=>setHelp(true)}><InfoCircledIcon/>教程</Button>
  </>;
  return <Theme accentColor="blue" grayColor="slate" radius="large" appearance="light" className={'reading-'+display.text}>
  <div className={'app-shell'+(researcher?' research-reader':'')+(embedded?' app-embedded':'')}>
    <header className={'app-toolbar'+(researcher?' research-toolbar':'')} ref={toolbar}>
      <a className="logo" href="./" aria-label="RiceFlux 首页"><span className="flux-mark" aria-hidden="true"><i/><i/><i/></span>Flux</a>
      {!demo&&__RICEFLUX_AUDIENCE__==='combined'&&<nav className="app-modes" aria-label="工作台">
        <Button variant={researcher?'soft':'ghost'} color="gray" aria-pressed={researcher} onClick={()=>changeView(false)}>基因分析</Button>
        <Button variant={researcher?'ghost':'soft'} color="gray" aria-pressed={!researcher} onClick={()=>changeView(true)}>育种工作台</Button>
      </nav>}
      {researcher?<>
        {!demo&&<PriorFinder data={data} onChoose={(g,preferred)=>chooseGene(g.id,preferred??preferredTrait(data,g),true)} onInspect={inspectIndel}/>}
        <h1 className="reader-gene" title={gene.name+' · '+geneIdentity}><span>{gene.name}</span><small>{geneIdentity}</small></h1>
        <WorkspaceNavigation layout={readerLayout} toolbar={toolbar} onJump={goToSection}/>
        <div className="app-tools reader-tools">
          <Dialog.Root open={filters} onOpenChange={setFilters}>
            <Dialog.Trigger><Button variant="soft" color="gray" className="reader-filter-button">筛选 <span data-cohort-count={cohort.length}>{cohort.length.toLocaleString()} 份</span></Button></Dialog.Trigger>
            <Dialog.Content maxWidth="580px" className="reader-filter-dialog">
              <Dialog.Title>分析筛选</Dialog.Title>
              <Dialog.Description>选择材料范围、群体与位点质控。筛选即时生效。</Dialog.Description>
              {demo?<><Choice label="性状" value={traitId} options={data.traits} onChange={chooseTrait}/>
                <Choice label="基因" value={geneId} options={data.genes.filter(g=>g.trait_ids.includes(traitId))} onChange={chooseGene}/></>:
                <Choice label="材料范围" value={materialScope} onChange={changeScope} options={scopes}/>}
              <details className="sidebar-section">
                <summary>群体 <small>{popIds.length} / {scopeGroups.length}</small></summary>
                <div className="pop-controls">{scopeGroups.map(p=><Toggle key={p.id} checked={popIds.includes(p.id)} onChange={()=>togglePop(p.id)}>
                  <i style={{background:p.color}}/><span title={p.description}>{p.name}{p.description&&p.description!==p.name&&<small className="population-description">{p.description.split(' / ')[0]}</small>}</span>
                  <em>{groupCounts.get(p.id)}</em>
                </Toggle>)}</div>
              </details>
              <div className="reader-material-actions">
                <Button variant="surface" color="gray" className="choose-people" onClick={()=>setPick(true)}><PersonIcon/>选择个体<span>{individualIds.length}</span></Button>
                {!demo&&<SampleList data={data} onApply={applySampleList}/>}
              </div>
              <label className="only-switch"><Switch size="1" checked={individualOnly} onCheckedChange={v=>{update({individualOnly:v});setGroup(null);}}/>仅统计已选个体</label>
              <details className="sidebar-section"><summary>位点质控{sites.mode==='manual'?' · 自选模式':''}</summary>
                <label className="range-label">最小 MAF <b>{percent(minMaf)}</b><input aria-label="最小 MAF" type="range" min="0" max="0.5" step="0.01" value={minMaf} onChange={e=>{update({minMaf:Number(e.target.value)});setGroup(null);}}/></label>
                <label className="range-label">最大等位缺失率 <b>{percent(maxMissing)}</b><input aria-label="最大缺失比例" type="range" min="0" max="1" step="0.05" value={maxMissing} onChange={e=>{update({maxMissing:Number(e.target.value)});setGroup(null);}}/></label>
              </details>
              <div className="dialog-actions"><Button variant="ghost" color="gray" onClick={()=>{reset();setFilters(false);}}><ResetIcon/>重置分析筛选</Button><Dialog.Close><Button>完成</Button></Dialog.Close></div>
            </Dialog.Content>
          </Dialog.Root>
          <ToolbarMenu>
            {readerLayout.filter(p=>expandableSections.includes(p.id)).map(p=><button key={p.id} type="button" onClick={()=>goToSection(p.id)}>{p.title}</button>)}
            {controls}
            <Button variant="ghost" color="gray" onClick={download}><DownloadIcon/>下载基因数据</Button>
          </ToolbarMenu>
        </div>
      </>:<div className="app-tools">{controls}</div>}
    </header>
    {researcher?<div className={'explorer reader-explorer'+(embedded?' embedded':'')}>
    <a className="skip" href="#explorer-main" onClick={e=>{e.preventDefault();goToSection('overview');}}>跳到分析结果</a>
    <div className="canvas">
      <main id="explorer-main" tabIndex={-1}><div className="hero">
        <div className="reader-context">
          <span className="synthetic"><span/>{demo?'合成数据 Demo':evidenceName[data.meta.genotype_evidence]}</span>
          <GeneTraitChoice trait={trait} options={relatedTraits} onChange={switchGeneTrait}/>
          {individualOnly&&<small>仅统计已选个体</small>}
        </div>
        {!demo&&<SourceBadges data={data} gene={gene} onInspect={inspectIndel}/>}
      </div>
        {geneLoad&&<p className="notice" role={geneLoad.error?'alert':'status'}>{geneLoad.error?<>{geneLoad.name} · {geneLoad.error} <button onClick={()=>chooseGene(geneLoad.id,geneLoad.trait,geneLoad.clearPlot)}>重试</button></>:`正在读取 ${geneLoad.name} 的分型…`}</p>}
        <WorkspaceLayout layout={readerLayout} content={{
          compare: !demo&&<ComparePanel data={data} activeGene={gene} cohort={cohort} config={compareSettings} onConfig={setting('compare')} onInspect={inspectIndel}/>,
          locus: <Panel title="基因区域 / Locus" tag={`${variants.length} / ${gene.variants.length} 位点`}>
            <div className="site-selection-tools">
              <SitePicker gene={gene} cohort={cohort} selection={siteSelections[geneId]} initialIds={variants.map(v=>v.id)} schemes={schemes}
                onApply={selectSites} onAutomatic={()=>selectSites(null)}/>
              <span>{sites.mode==='manual'?'自选组合':'QC 自动选择'}</span>
            </div>
            {(sites.missing.length>0||sites.assemblyMismatch)&&<p role="alert">所选位点未完整覆盖或参考版本改变，暂停组合判型。请打开自选位点核对。</p>}
            {gene.model||demo?<>{demo?
              <GeneTrack gene={gene} variants={variants} selected={selected} onSelect={setVariant}/>:
              <GenomeTrack key={gene.id} gene={gene} variants={variants} selected={selected} onSelect={setVariant}
                onInspect={(id,trigger)=>inspectIndel(gene,id,undefined,trigger)}/>}
              <div className="track-legend">
                <span><i className="cds"/>CDS{demo?' 示意':''}</span>
                <span><i className="promoter"/>{demo?'上游示意':'上游 2 kb'}</span>
                {demo&&<span><i className="snp"/>SNP</span>}
                <span>基因跨度 {(gene.gene_end-gene.gene_start+1).toLocaleString()} bp</span>
                <span>1-based · 区间 {gene.start.toLocaleString()}–{gene.end.toLocaleString()}</span>
              </div>
            </>:<Empty>尚未核定参考基因模型，无法绘制坐标与结构。</Empty>}
            <div className="variants">
              {variants.map(v=>{
                const {kind,ref,alts}=markerAnnotation(v);
                const active=v.id===selected?.id;
                return <button key={v.id} className={active?'selected':''} aria-pressed={active} onClick={e=>selectMarker(v,e.currentTarget)}
                  aria-haspopup={!demo&&v.markerType==='InDel'?'dialog':undefined}
                  title={markerNames[kind]+' · '+markerQuality(alleleStats(cohort,v))}>
                  <MarkerIcon kind={kind}/>{v.pos.toLocaleString()}<small>{ref} → {alts.join(' / ')||'—'}</small>
                </button>;
              })}
              {!variants.length&&<Empty>{gene.variants.length?(sites.mode==='manual'?'尚未选择位点，请点击“自选位点”。':
                '没有通过 QC 的位点；请选择材料或调整阈值。'):availableSources.length?
                '在数据接口载入 '+availableSources.map(r=>r.badge).join(' / ')+' 查看该基因的位点。':
                '当前数据集没有该基因的目标位点。'}</Empty>}
            </div>
            {!demo&&<PavPanel gene={gene} cohort={cohort} populations={data.populations}/>}
            <details className="locus-details">
              <summary>参考模型与原始分型</summary>
              <p className="footnote">{demo?'坐标与结构均来自 SIM-RICE-v1 虚拟组装，非真实水稻注释或 AtFLM 坐标。':
                gene.model?gene.model+' · 日本晴参考坐标，正链等位。':'身份或参考模型待核。'}</p>
              {!demo&&gene.variants.length>0&&<AccessionCalls key={gene.id} gene={gene} selected={selected} evidence={data.evidence} cohort={cohort} literature={data.literature}/>}
            </details>
          </Panel>,
          frequency: <Panel title="等位频率 / Frequency" sub={selected?`${selected.id} · ${selected.ref}→${selected.alt||'—'} · ${selected.feature}`:'等待可用位点'}>
          {stats&&<p className="reader-frequency">ALT 合计 <strong>{percent(stats.af)}</strong> · {stats.alt.toLocaleString()} / {stats.called.toLocaleString()} 个有效等位</p>}
          <AlleleFrequency variant={selected} cohort={cohort} populations={data.populations.filter(p=>popIds.includes(p.id))}/>
          {individualIds.length>0&&<div className="focus-individual"><PersonIcon/><span>关注材料</span><b>{selectedStats?alleleFrequencyText(selectedStats)||percent(selectedStats.af):'—'}</b></div>}
        </Panel>,
          composition: <Panel title="基因型组合 / Genotypes" sub="完整未分相基因型组合；频率按个体计数。"  className="matrix-panel"><div className="matrix-scroll"><table className="matrix"><thead><tr><th>组合</th>{variants.map(v=><th key={v.id}><button className={v.id===selected?.id?'active-variant':''} aria-haspopup={!demo&&v.markerType==='InDel'?'dialog':undefined} onClick={e=>selectMarker(v,e.currentTarget)}>{v.pos.toLocaleString()}<small>{v.ref}→{v.alt??'—'}</small></button></th>)}<th>个体数</th><th>占完整个体</th><th>群体组成</th></tr></thead><tbody>{visibleGroups.map((g,i)=><tr key={g.key} className={g.key===group?.key?'active-group':''}><th><button title={g.id} onClick={()=>setGroup(g.key===groupKey?null:g.key)}><i style={{background:COLORS[i%8]}}/>G{String(i+1).padStart(2,'0')}</button></th>{g.tokens.map((t,j)=><td key={variants[j].id}><span className={`gt ${t===`${variants[j].ref}/${variants[j].ref}`?'ref':t.split('/')[0]===t.split('/')[1]?'alt':'het'}`}>{t}</span></td>)}<td><b>{g.members.length}</b></td><td>{percent(g.members.length/complete)}</td><td><PopulationComposition populations={data.populations} members={g.members} selectedIds={individualIds}/></td></tr>)}</tbody></table></div>{!groups.length&&<Empty>没有可分类的完整个体。零位点或含缺失调用时，不生成虚假的单一组合。</Empty>}<div className="panel-bottom"><span>展示 {visibleGroups.length} / {groups.length} 类 · {complete.toLocaleString()} / {cohort.length.toLocaleString()} 份完整分型</span>{group&&readerLayout.some(p=>p.id==='individuals')&&<Button variant="ghost" size="1" onClick={()=>goToSection('individuals')}>查看该组合材料</Button>}{groups.length>8&&<Button variant="ghost" size="1" onClick={()=>setShowAll(v=>!v)}>{showAll?'收起稀有组合':'显示全部组合'}</Button>}</div><div className="population-key">{scopeGroups.map(p=><span key={p.id}><i style={{background:p.color}}/>{p.name}</span>)}</div>{!demo&&<HaplotypeMatches key={gene.id} gene={gene} cohort={cohort} evidence={data.evidence} review={traitReview}/>}</Panel>,
          phenotype: <div className="phenotype-section">{assessmentPilot?
          <PhenotypeProfile key={gene.id} data={data} gene={gene} related={relatedTraits} cohort={cohort} variants={variants} schemes={schemes}
            selectedIds={individualIds} targets={traitTargets} onTarget={setTraitTarget}
            onInspect={layout.some(p=>p.id==='individuals')?inspectTrial:undefined}/>:view ?
          <Panel title={trait.name+' · 分地区表型 ('+view.unit+')'} tag={view.sites.length+' 个试验地点'}>
            <RegionalPhenotypes trait={trait} groups={visibleGroups} allGroups={groups} gene={gene} schemes={schemes} cohort={cohort} markerIds={variants.map(v=>v.id)} view={view} onChange={changePlot} selectedIds={individualIds} compact={false}/>
          </Panel> : demo ? <Panel title={`${trait.name} · 表型对照`} sub={`单位：${trait.unit}。仅展示上表当前组合；线框为四分位范围，中线为中位数，端点为最小/最大值。`} tag="DESCRIPTIVE"><Phenotypes groups={visibleGroups} trait={trait} selectedIds={individualIds}/><p className="footnote">各组 n 为有该性状记录的个体数。{demo?'合成表型独立生成，无显著性检验，不据此推断优良等位基因。':trait.source?'各组按所选地点、年份的实测值统计。':'当前为先验浏览，未选择实测表型。'}</p></Panel> : <Panel title={trait.name+' · 表型对照'}><Empty>当前数据集暂无该性状的实测表型。</Empty></Panel>}</div>,
          evidence: !demo&&<EvidencePanel data={data} gene={gene} trait={trait} cohort={cohort} selected={selected} onInspect={inspectIndel}/>,
          materials: !demo&&<MaterialPanel data={data} reference={eligible} genes={[gene,...(compareSettings.ids||[]).filter(id=>id!==gene.id).map(id=>data.genes.find(g=>g.id===id)).filter(Boolean)]} settings={materialSettings} onSettings={setting('material')}/>,
          ricenavi: !demo&&<RiceNaviPanel gene={gene}/>,
          individuals: <Panel title={group?`组合成员 · ${group.members.length} 份`:'个体基因型明细'} sub={group?'点击同一组合可取消成员筛选；这不会改变上方频率分母。':'勾选关注个体后，可在「筛选」中开启「仅统计已选个体」重算频率。'} tag={`${tableRows.length} INDIVIDUALS`}><div className="matrix-scroll individual-scroll" onScroll={e=>extendRows(e,()=>setMemberLimit(n=>n+96))}><table className="individual-table"><thead><tr><th>关注</th><th>材料</th><th>群体</th><th>{tableHeading}</th>{variants.map(v=><th key={v.id}>{v.pos.toLocaleString()}</th>)}</tr></thead><tbody>{tableRows.slice(0,memberLimit).map(s=><tr key={s.id} className={individualIds.includes(s.id)?'selected-person':''}><td><Checkbox checked={individualIds.includes(s.id)} onCheckedChange={()=>toggleIndividual(s.id)} aria-label={`关注 ${s.id}`}/></td><th scope="row">{s.id}<small>{s.name}</small></th><td>{data.populations.find(p=>p.id===s.population_id)?.name}</td><td>{fmt(s.phenotypes[tablePhenotype])}</td>{variants.map(v=><td key={v.id}>{gtToken(callOf(s,v),v)}</td>)}</tr>)}</tbody></table></div>{!tableRows.length&&<Empty>没有个体符合当前选择。</Empty>}</Panel>,
        }}/>
      </main>
    </div>
    <Dialog.Root open={pick} onOpenChange={setPick}><Dialog.Content maxWidth="650px" className="people-dialog"><Dialog.Title>选择感兴趣的个体</Dialog.Title><Dialog.Description>关注仅作高亮；开启“仅统计已选个体”后重算频率。</Dialog.Description><div className="people-search"><TextField.Root aria-label="查找个体" placeholder={demo?'输入 SIM 编号或材料名称':'输入材料编号或品种名'} value={query} onChange={e=>setQuery(e.target.value)}><TextField.Slot><MagnifyingGlassIcon/></TextField.Slot></TextField.Root><Button variant="soft" onClick={()=>setIndividuals(eligible.map(s=>s.id))}>全选群体个体</Button><Button variant="ghost" color="gray" onClick={()=>setIndividuals([])}>清空</Button></div><div className="people-list" onScroll={e=>extendRows(e,()=>setPickerLimit(n=>n+96))}>{matchingIndividuals.slice(0,pickerLimit).map(s=><Toggle key={s.id} checked={individualIds.includes(s.id)} onChange={()=>toggleIndividual(s.id)}><b>{s.id}</b><small>{!demo?s.name+' · ':''}{data.populations.find(p=>p.id===s.population_id).name}</small></Toggle>)}{!matchingIndividuals.length&&<Empty>{eligible.length?'没有匹配的个体，请调整关键词。':'请先选择群体。'}</Empty>}</div><div className="dialog-actions"><span>已选择 {individualIds.length} 份</span><Dialog.Close><Button>完成选择<CheckIcon/></Button></Dialog.Close></div></Dialog.Content></Dialog.Root>
    </div>:<div className="breeder-shell"><React.Suspense fallback={<p role="status">正在载入育种工作台…</p>}>
      <BreederWorkspace data={data} cohort={cohort} settings={breederSettings} onChange={setting('breeder')}
        initialGene={geneId} initialTrait={traitId} siteSelections={siteSelections}/>
    </React.Suspense></div>}
    <Dialog.Root open={help} onOpenChange={setHelp}><Dialog.Content maxWidth="860px"><Dialog.Title>使用教程 / RiceFlux guide</Dialog.Title><Dialog.Description>选择基因与位点，比较材料。 / Select genes and sites to compare accessions.</Dialog.Description><Tutorial demo={demo}/><Dialog.Close><Button>关闭 / Close</Button></Dialog.Close></Dialog.Content></Dialog.Root>
    {inspection&&<React.Suspense fallback={<p className="notice" role="status">正在打开 InDel 位点详情…</p>}>
      <IndelDetails data={data} cohort={cohort} inspection={inspection} onClose={()=>setInspection(null)}/>
    </React.Suspense>}
    {notice&&<div className="notice" role="status"><CheckIcon/>{notice}</div>}
  </div></Theme>;
}
createRoot(document.getElementById('root')).render(<App/>);
