import {useText} from './locale.jsx';
import React,{useMemo,useState} from 'react';
import {BreederCatalog} from './BreederCatalog.jsx';
import {IntrogressionReview} from './IntrogressionReview.jsx';
import {BreederReview,ReviewRange,ReviewSource,callLabel,shortType,shown} from './BreederReview.jsx';
import {AccessionPicker,CarrierList,breedingTasks} from './BreederTasks.jsx';
import {BreederInput} from './BreederInput.jsx';
import {BreederPlan} from './BreederPlan.jsx';
import {makeBreederPlan,queryTraits} from './breederPlan.js';
import {MaterialCheck,readCheckFiles} from './MaterialCheck.jsx';
import {resolveSampleList} from './dataImport.js';
import {isVcf} from './vcf.js';
import {eventRows} from './evidence.js';
import {downloadTable} from './formats.js';
import {findGenes} from './geneSearch.js';
import {geneSchemes,jointCalls,typeMaterial} from './jointHaplotypes.js';
import {breederAxes,evidenceLevel,genotypePhenotypes,isCross,markerCoverage,materialKey,mostMeasured,parentComparison,registeredCrosses,reviewAxes,targetRange,targetStatus,trackingKey,traitRows} from './breeder.js';
import {LinkagePanel} from './LinkagePanel.jsx';
import {parseMaterialChecks} from './materialCheck.js';
import {readableDefinition} from './provenance.js';
import {siteName} from './regions.js';
import {useGeneCalls} from './useGeneCalls.js';
import './breeder.css';

const labels={met:'达标',outside:'范围外',missing:'缺测',invalid:'区间有误',not_set:'未设目标'};
const comparison={same:'双亲同型',different:'双亲异型，可追踪',inferred:'含代理分型，需实测核对',unresolved:'待补分型'};
const trialLabel=a=>[siteName(a.source.original_site??a.source.site),a.source.year,a.assay!==a.trait_name&&a.assay,a.unit].filter(Boolean).join(' · ');
const schemeNames={literature:'文献单倍型',observed:'群体纯合标记型',custom:'自选位点型'};
const ratio=(n,m)=>m>0?shown(100*n/m)+'%':'—';
const rawId=s=>s.source_sample_id??s.id;
const materialName=s=>s?.name||s?.source_sample_id;
const exportTxt=(filename,fields,rows)=>downloadTable({filename,columns:fields},rows);
function trackingHint(row,requested) {
  if (!requested) return '';
  if (!row.f1) return '追踪型 '+requested+' · 待核';
  const female=row.female.label===requested,male=row.male.label===requested;
  const source=female?(male?'双亲携带':'母本携带'):(male?'父本携带':'双亲未见');
  return '追踪型 '+readableDefinition(requested)+' · '+source;
}

function ParentPanel({data,candidates,axis,models,ready,settings,change,target,onCrosses,onExplore,children}){
  const localize = useText();
  const resolve=key=>candidates.find(s=>materialKey(s)===key);
  const female=resolve(settings.female),male=resolve(settings.male);
  const crosses=useMemo(()=>registeredCrosses(data.individuals,female,male),[data,female,male]);
  const parents=[female,male];
  const paired=female&&male&&female!==male;
  const records=paired&&ready?models.map(m=>({...m,...parentComparison(female,male,m.scheme)})):[];
  const phenotype=s=>axis&&axis.dataset===s?.dataset_id?s.phenotypes[axis.id]??null:null;
  return <section className="breeder-card task-panel" aria-label={localize("双亲分型")}>
    <div className="breeder-parent-grid">
      {[['female','母本',female],['male','父本',male]].map(([key,label,sample])=><AccessionPicker key={key} label={localize(label)}
        samples={candidates} selected={sample} onPick={s=>change({[key]:materialKey(s)})}/>)}
    </div>
    {!paired&&<p className="breeder-note">{female&&male?localize("请选择不同的双亲。"):localize("选双亲后比较携带型。")}</p>}
    {localize(paired&&children)}
    {paired&&axis&&<p className="task-context">{localize(axis.trait_name)} · {localize(trialLabel(axis))}{" "+localize("· 母本")+" "}{phenotype(female)??localize("缺测")}{" "+localize("· 父本")+" "}{phenotype(male)??localize("缺测")}</p>}
    {paired&&!models.length&&<p className="breeder-note">{localize("添加目标基因以查看双亲差异和 F1 预期型。")}</p>}
    {records.length>0&&<div className="matrix-scroll"><table className="individual-table breeder-parent-types"><thead><tr><th>{localize("基因")}</th><th>{localize("母本型")}</th><th>{localize("父本型")}</th><th>{localize("追踪判断")}</th><th>{localize("F1 预期")}</th></tr></thead>
      <tbody>{records.map(r=><tr key={r.gene.id}><th>{localize(r.gene.name)}</th><td>{localize(callLabel(r.female))}</td><td>{localize(callLabel(r.male))}</td><td>{localize(comparison[r.status])}
        {settings.tracking?.[r.trackKey]&&<small>{localize(trackingHint(r,settings.tracking[r.trackKey]))}</small>}</td>
        <td>{r.f1?.join(' · ')??localize("待核")}</td></tr>)}</tbody>
    </table></div>}
    {paired&&crosses.length>0&&<details className="review-disclosure"><summary>{localize("实测组合 ·")+" "}{localize(crosses.length)}{" "+localize("个")}</summary>
        <ul className="breeder-crosses">{crosses.slice(0,6).map(s=><li key={s.id}>{localize(materialName(s))} · {localize(rawId(s))} <b>{localize(shown(phenotype(s)))}{localize(phenotype(s)!==null?' '+axis.unit:'')}</b>
          {localize(target.active&&phenotype(s)!==null&&' · '+labels[targetStatus(phenotype(s),target)])}</li>)}</ul>
        <button className="review-link" type="button" onClick={()=>onCrosses(crosses)}>{localize("打开组合表型")}</button>
    </details>}
    {paired&&axis&&parents.some(s=>phenotype(s)===null)&&<p className="breeder-note">{localize("双亲缺少同口径实测，无法由当前记录估计杂种优势。")}</p>}
    {paired&&<button className="review-link" type="button" onClick={onExplore}>{localize("查找目标性状的携带型")}</button>}
  </section>;
}

function PhenotypeEvidence({reference,axis,target,focus,scope,tracking,onTrack,onCarriers}){
  const localize = useText();
  const [baseline,setBaseline]=useState(null);
  const groups=useMemo(()=>genotypePhenotypes(traitRows(reference,axis,target),focus.scheme,target),
    [reference,axis,target,focus.scheme]);
  const context=JSON.stringify([axis.key,scope,focus.gene.id,focus.scheme.id,focus.scheme.markers.map(m=>m?.id)]);
  const baselineLabel=baseline?.context===context?baseline.label:'';
  const ordinal=axis?.unit==='级';
  const contrast=ordinal?null:groups.find(g=>g.label===baselineLabel);
  const evidence=evidenceLevel(focus.gene,focus.scheme,groups);
  const typed=groups.reduce((total,r)=>total+r.n,0);
  function exportGroups(){
    const fields=['dataset_id','dataset_version','trait_id','environment_id','site','year','assay','unit','material_scope','gene_id','scheme_id','ordered_markers','type','paired_n','mean','median','q1','q3','baseline','raw_mean_difference','target_min','target_max','target_n','target_rate','literature','phenotype','inference','grade'];
    exportTxt('riceflux_breeder_type_effects.txt',fields,groups.map(g=>({
      ...g,...evidence,dataset_id:axis.dataset,dataset_version:axis.version,trait_id:axis.trait_id,environment_id:axis.environment,
      site:axis.source.original_site??axis.source.site,year:axis.source.year,assay:axis.assay,unit:axis.unit,material_scope:scope,
      gene_id:focus.gene.id,scheme_id:focus.scheme.id,ordered_markers:focus.scheme.markers.map(v=>v?.id??'NA').join(','),
      type:g.label,paired_n:g.n,mean:ordinal?null:g.mean,baseline:contrast?.label,raw_mean_difference:contrast?g.mean-contrast.mean:null,
      target_min:target.min,target_max:target.max,target_n:g.met,target_rate:g.met===null?null:g.met/g.n,
    })));
  }
  return <section className="review-analysis-body" aria-label={localize("群体型别证据")}>
      <p className="breeder-evidence-grade">{localize("证据")+" "}{localize(evidence.grade)}</p>
      <p className="breeder-note">{localize(evidence.literature)} {evidence.literature==='L2'?localize("文献型定义"):evidence.literature==='L1'?localize("基因层文献"):localize("暂无文献")} · {localize(evidence.phenotype)} {localize(typed)}{" "+localize("份分型与表型配对 ·")+" "}{localize(evidence.inference)}{" "+localize("暂无模型效应")}</p>
      {focus.scheme.doi.length>0&&<p className="breeder-note">{focus.scheme.doi.map(doi=><a key={doi} href={'https://doi.org/'+doi} target="_blank" rel="noreferrer">{localize(doi)} </a>)}</p>}
      {groups.length>0?<>
        {!ordinal&&groups.length>1&&<label>{localize("对照型")}<select aria-label={localize("选择效力对照型")} value={contrast?.label??''} onChange={e=>setBaseline({context,label:e.target.value})}>
          <option value="">{localize("选择后显示原始均值差")}</option>{groups.map(g=><option key={g.label} value={g.label}>{localize(readableDefinition(g.label))}</option>)}
        </select></label>}
        <label>{localize("拟在后代追踪的型")}<select aria-label={localize("选择拟追踪型")} value={groups.some(g=>g.label===tracking)?tracking:''} onChange={e=>onTrack(e.target.value)}>
          <option value="">{localize("选择型别")}</option>{groups.map(g=><option key={g.label} value={g.label}>{localize(readableDefinition(g.label))}</option>)}
        </select></label>
        {groups.length===1&&<p className="breeder-note">{localize("当前只有一个型别有配对实测，无法比较型别差异。")}</p>}
        <p className="breeder-note">{ordinal?localize("等级性状展示中位等级和四分位范围。"):localize("同一试验内的描述性配对。均值差包含群体背景影响。")}</p>
        <div className="matrix-scroll"><table className="individual-table"><thead><tr><th>{localize("单倍型或标记型")}</th><th>{localize("配对 n")}</th>{!ordinal&&<th>{localize("均值")}</th>}<th>{localize("中位数 [Q1, Q3]")}</th>{contrast&&<th>{localize("均值差")}</th>}{target.active&&<th>{localize("达标率")}</th>}</tr></thead>
          <tbody>{groups.map(g=><tr key={g.label}><th>{onCarriers?<button className="review-link" type="button" onClick={()=>onCarriers(g.label)}
            title={localize("查看有同口径实测的携带材料")}>{localize(readableDefinition(g.label))}</button>:readableDefinition(g.label)}</th><td>{localize(g.n)}</td>{!ordinal&&<td>{localize(shown(g.mean))}</td>}<td>{localize(shown(g.median))} [{localize(shown(g.q1))}, {localize(shown(g.q3))}]</td>{contrast&&<td>{localize(shown(g.mean-contrast.mean))}</td>}{target.active&&<td>{localize(ratio(g.met,g.n))}<small>{localize(g.met)} / {localize(g.n)}</small></td>}</tr>)}</tbody></table></div>
        <button type="button" onClick={exportGroups}>{localize("下载型别对照 TXT")}</button>
      </>:<p className="breeder-note">{localize("当前测定记录暂无可比较的型别。")}</p>}
  </section>;
}

function GeneControls({data,models,focus,change,onFocus}){
  const localize = useText();
  const [query,setQuery]=useState(''),[chromosome,setChromosome]=useState('1');
  const ids=models.map(m=>m.gene.id);
  const available=query.trim()?findGenes(data.genes,query).filter(g=>!ids.includes(g.id)).slice(0,6):[];
  function add(g){
    change({geneIds:[...ids,g.id],focus:g.id});
    setQuery('');
  }
  const chromosomeGenes=data.genes.filter(g=>String(g.chromosome).replace(/^Chr0?/i,'')===chromosome&&!g.catalog?.historical&&!ids.includes(g.id));
  return <div className="review-gene-controls">
    <label>{localize("染色体")}<select aria-label={localize("育种染色体")} value={chromosome} onChange={e=>setChromosome(e.target.value)}>{Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>Chr{localize(i+1)}</option>)}</select></label>
    <label>{localize("按染色体添加基因")}<select aria-label={localize("染色体基因选择")} value="" onChange={e=>{const g=chromosomeGenes.find(g=>g.id===e.target.value);if(g)add(g);}}><option value="">{localize("选择基因（")}{localize(chromosomeGenes.length)}）</option>{chromosomeGenes.map(g=><option key={g.id} value={g.id}>{localize(g.name)} · {localize(g.msu_id||g.catalog?.msu||g.id)}</option>)}</select></label>
    <div className="review-search" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setQuery('');}}>
      <label>{localize("关注基因")}<input type="search" aria-label={localize("查找关注基因")} value={query} placeholder={localize("名称或 MSU/RAP ID")}
        onKeyDown={e=>{if(e.key==='Escape')setQuery('');if(e.key==='Enter'&&available.length===1)add(available[0]);}}
        onChange={e=>setQuery(e.target.value)}/></label>
      {query.trim()&&<div className="review-matches">{available.map(g=><button type="button" key={g.id} onClick={()=>add(g)}><span><strong>{localize(g.name)}</strong>
        <small>{localize(g.catalog?.msu||g.id)}</small></span><span>{localize("加入")}</span></button>)}{!available.length&&<p>{localize("未找到可加入的基因。")}</p>}</div>}
    </div>
    {models.length>0&&<div className="breeder-pins">{models.map(({gene})=><div key={gene.id} className="breeder-pin" data-active={focus?.gene.id===gene.id}>
      <button type="button" aria-label={localize('查看 '+gene.name+' 型别证据')} aria-pressed={focus?.gene.id===gene.id}
        onClick={()=>onFocus(gene.id)}>{localize(gene.name)}</button>
      <button type="button" aria-label={localize('取消关注 '+gene.name)} onClick={()=>change({geneIds:ids.filter(id=>id!==gene.id)})}>×</button>
    </div>)}</div>}
  </div>;
}

function CombinationPanel({data,models,settings,change,ready,reference,scope,target,axis,focus,reviewResult,onReview}){
  const localize = useText();
  const [limit,setLimit]=useState(8);
  const [key,setKey]=useState(null);
  const result=useMemo(()=>ready?jointCalls(reference,models.map(m=>m.scheme)):null,[ready,reference,models]);
  const rows=useMemo(()=>traitRows(reference,axis,target),[reference,axis,target]);
  const scopeSamples=reference;
  const reviewCounts=useMemo(()=>new Map((reviewResult?.groups??[]).map(g=>[g.key,g.n])),[reviewResult]);
  const markers=focus?.scheme.markers.filter(Boolean)??[];
  const indexMarkers=models.map(m=>m.scheme.markers.find(v=>v?.alt));
  const typedByTrial=new Map(rows.filter(r=>r.value!==null).map(r=>[r.sample.id,r]));
  const genotypeGroups=result?.groups.map(g=>({...g,paired:0,met:0}))??[];
  const byCombo=new Map(genotypeGroups.map(g=>[g.key,g]));
  for(const m of result?.members??[]){
    const g=byCombo.get(m.key),row=typedByTrial.get(m.sample.id);
    if(g&&row){g.paired++;g.met+=Number(row.target_status==='met');}
  }
  const ids=models.map(m=>m.gene.id);
  const active=genotypeGroups.find(g=>g.key===key);
  function exportCombinations(){
    const cols=['population_n','joint_typed_n','combination_n','frequency_within_typed','trait_dataset','dataset_version','environment_id','paired_n','target_n','target_min','target_max','material_scope','selected_combination_n','dataset_versions','genotype_definitions',...ids];
    const context={population_n:scopeSamples.length,joint_typed_n:result.assigned,trait_dataset:axis?.dataset,dataset_version:axis?.version,environment_id:axis?.environment,
      target_min:target.min,target_max:target.max,material_scope:scope,
      dataset_versions:JSON.stringify(data.meta.datasets.map(d=>[d.id,d.version])),
      genotype_definitions:JSON.stringify(Object.fromEntries(models.map(m=>[m.gene.id,{scheme:m.scheme.id,markers:m.scheme.markers.map(v=>v?.id??null)}])))};
    const records=genotypeGroups.length?genotypeGroups.map(g=>({...context,combination_n:g.n,frequency_within_typed:g.n/result.assigned,selected_combination_n:reviewCounts.get(g.key)??0,paired_n:g.paired,target_n:target.active?g.met:null,
      ...Object.fromEntries(ids.map((id,i)=>[id,g.labels[i]]))})):[context];
    exportTxt('riceflux_breeder_combinations.txt',cols,records);
  }
  return <section className="review-analysis-body" aria-label={localize("群体组合")}>
    {result&&<>
      <p className="breeder-counts" data-testid="breeder-joint-n">{models.length===1?localize("群体判型"):localize("群体联合判型")} <b>{localize(result.assigned.toLocaleString())}</b> / {localize(scopeSamples.length.toLocaleString())}{" "+localize("份")}</p>
      {genotypeGroups.length>0&&<div className="matrix-scroll"><table className="individual-table">
        <thead><tr><th>{localize("基因型组合")}</th><th>{localize("清单中")}</th><th>{localize("群体频数")}</th>{axis&&<th>{localize("表型配对")}</th>}</tr></thead>
        <tbody>{genotypeGroups.slice(0,limit).map(g=><tr key={g.key}><th>
          <button type="button" className="review-link" aria-pressed={key===g.key} onClick={()=>setKey(key===g.key?null:g.key)}
            title={localize("查看实际携带材料")}>{localize(g.labels.map(shortType).join(' × '))}</button>
        </th><td>{localize(reviewCounts.get(g.key)??0)}</td><td>{localize(g.n)}<small title={localize("完整判型材料内的比例")}>{localize(ratio(g.n,result.assigned))}</small></td>
          {axis&&<td>{localize(g.paired)}{target.active&&<small>{localize("达标")+" "}{localize(g.met)}</small>}</td>}</tr>)}</tbody>
      </table></div>}
      {!genotypeGroups.length&&<p className="breeder-note">{localize("当前群体暂无完整组合。")}</p>}
      <div className="review-footer">
        {genotypeGroups.length>limit&&<button className="review-link" type="button" onClick={()=>setLimit(n=>n+12)}>{localize("更多型别")}</button>}
        <button className="review-link" type="button" onClick={exportCombinations}>{localize("下载组合 TXT")}</button>
      </div>
    </>}
    {active&&<CarrierList key={active.key} title={localize(active.labels.map(shortType).join(' × '))}
      samples={result.members.filter(m=>m.key===active.key).map(m=>m.sample)} axis={axis} target={target} onReview={onReview}
      definition={JSON.stringify(ids.map((id,i)=>[id,models[i].scheme.id,active.labels[i]]))}/>}
    <details className="review-disclosure review-schemes"><summary>{localize("判型、位点质量与连锁")}</summary>
      <div className="breeder-schemes">{models.map(({gene,menu,scheme})=><label key={gene.id}>{localize(gene.name)}
        <select aria-label={localize(gene.name+' 育种判型')} title={localize(scheme.doi.join(' · '))} value={scheme.id} onChange={e=>change({schemes:{...settings.schemes,[gene.id]:e.target.value}})}>
          {menu.map(s=><option key={s.id} value={s.id}>{localize(schemeNames[s.kind])} · {localize(s.positions.length)}{" "+localize("位点")}{localize(menu.filter(m=>m.kind===s.kind&&m.positions.length===s.positions.length).length>1&&s.doi.length>0?' · '+s.doi[0]:'')}{s.ready?'':localize(" · 待覆盖")}</option>)}
        </select>
      </label>)}</div>
      {ready&&markers.length>0&&<>
      <h3>{localize(focus.gene.name)}{" "+localize("位点质量")}</h3>
      <div className="matrix-scroll"><table className="individual-table"><thead><tr><th>{localize("标记")}</th><th>{localize("完整 / 覆盖")}</th><th>Missing</th><th>MAF</th></tr></thead>
        <tbody>{markers.map(v=>{const s=markerCoverage(scopeSamples,v);return <tr key={v.id}><th>{localize(v.markerType||'SNP')} · {localize(v.id)}<small>{localize(v.ref)} → {localize(v.alt??'—')}{" "+localize("· 未覆盖")+" "}{localize(s.uncovered)}</small></th><td>{localize(s.complete)} / {localize(s.n)}</td><td>{localize(ratio(s.total-s.called,s.total))}</td><td>{localize(s.maf===null?'—':ratio(s.maf,1))}</td></tr>;})}</tbody></table></div>
      </>}
      {ready&&indexMarkers.filter(Boolean).length>1&&<LinkagePanel genes={models.map(m=>m.gene)} markers={indexMarkers} cohort={scopeSamples}/>}
    </details>
  </section>;
}


function TraitLookup({data,axes,reference,scope,settings,change,initialTrait,siteSelections,onReview,onParents}){
  const localize = useText();
  const [scan,setScan]=useState(false),[limit,setLimit]=useState(12),[carrier,setCarrier]=useState(null);
  const traits=queryTraits(data);
  const trait=traits.find(t=>t.id===(settings.lookupTrait??initialTrait))??traits[0];
  const {sources,axis}=useMemo(()=>reviewAxes(axes.filter(a=>a.trait_id===trait?.id),reference,
    {axis:settings.lookupAxis,trait:trait?.id},trait?.id),[axes,reference,settings.lookupAxis,trait?.id]);
  const bounds=settings.goals?.[axis?.key]??{};
  const target=useMemo(()=>targetRange(bounds),[bounds.min,bounds.max]);
  const rows=useMemo(()=>traitRows(reference,axis,target),[reference,axis,target]);
  const relatedIds=useMemo(()=>new Set(data.reference.genes.filter(g=>g.trait_ids.includes(trait?.id)).map(g=>g.id)),[data,trait?.id]);
  const genes=useMemo(()=>data.genes.filter(g=>relatedIds.has(g.id)).sort((a,b)=>Number(!!b.variants.length)-Number(!!a.variants.length)||a.name.localeCompare(b.name)),[data,relatedIds]);
  const gene=genes.find(g=>g.id===settings.lookupGene)??genes[0];
  const schemes=useMemo(()=>gene?geneSchemes(gene,data.evidence,[],siteSelections[gene.id]):[],[gene,data,siteSelections]);
  const scheme=schemes.find(s=>s.id===settings.lookupScheme)??schemes[0];
  const focus=gene?{gene,scheme,trackKey:trackingKey(axis,gene,scheme)}:null;
  const covered=useMemo(()=>genes.filter(g=>g.variants.some(v=>v.assayedDatasets?.has(axis?.dataset))),[genes,axis?.dataset]);
  const focusStatus=useGeneCalls(data,gene?[gene.id]:[],Boolean(axis&&scheme?.ready));
  const scanStatus=useGeneCalls(data,covered.map(g=>g.id),Boolean(scan&&axis));
  const summaries=useMemo(()=>scan&&axis&&scanStatus.ready?covered.flatMap(g=>{
    const definition=geneSchemes(g,data.evidence,[],siteSelections[g.id])[0];
    const results=genotypePhenotypes(rows,definition,target);
    return results.map(result=>({...result,gene:g,scheme:definition,comparable:results.length>1}));
  }).sort((a,b)=>Number(b.comparable)-Number(a.comparable)||(target.active?b.met-a.met||b.n-a.n:b.n-a.n)):[],[scan,axis,scanStatus.ready,covered,rows,target,data,siteSelections]);
  const comparable=summaries.filter(r=>r.comparable);
  const comparableGenes=new Set(comparable.map(r=>r.gene.id)).size;
  const measuredN=rows.filter(r=>Number.isFinite(r.value)).length;
  const original=gene?eventRows(gene):[];
  const tracking=focus&&settings.tracking?.[focus.trackKey];
  const carrierLabel=carrier&&carrier.gene===gene?.id&&carrier.scheme===scheme?.id&&carrier.axis===axis?.key?carrier.label:null;
  const carrierSamples=useMemo(()=>carrierLabel&&focusStatus.ready?rows.filter(r=>Number.isFinite(r.value)&&
    ['G_chip','G_direct'].includes(r.sample.genotype_evidence)).flatMap(r=>{
      const call=typeMaterial(r.sample,scheme);
      return call.status==='called'&&call.label===carrierLabel?[r.sample]:[];
    }):[],[carrierLabel,focusStatus.ready,rows,scheme]);
  function selectTrait(id){
    setScan(false);setLimit(12);setCarrier(null);
    change({lookupTrait:id,lookupAxis:'',lookupGene:'',lookupScheme:''});
  }
  function selectGene(id,definition=''){
    setCarrier(null);
    change({lookupGene:id,lookupScheme:definition});
  }
  function exportScan(){
    const fields=['dataset_id','dataset_version','trait_id','environment_id','unit','gene_id','gene','scheme','type','paired_n','comparable',
      'median','q1','q3','target_min','target_max','target_n','target_rate','doi'];
    exportTxt('riceflux_trait_haplotypes.txt',fields,summaries.map(r=>({...r,dataset_id:axis.dataset,dataset_version:axis.version,
      trait_id:axis.trait_id,environment_id:axis.environment,unit:axis.unit,gene_id:r.gene.id,gene:r.gene.name,scheme:r.scheme.id,
      type:r.label,paired_n:r.n,target_min:target.min,target_max:target.max,target_n:r.met,
      target_rate:r.met===null?null:r.met/r.n,doi:r.scheme.doi.join(',')})));
  }
  if(!trait)return <p className="breeder-note">{localize("当前没有可查询的性状。")}</p>;
  return <section className="breeder-card task-panel" aria-label={localize("按性状查单倍型")}>
    <div className="task-form">
      {data.individuals.some(isCross)&&<label>{localize("范围")}<select aria-label={localize("型别比较对象")} value={scope}
        onChange={e=>{setCarrier(null);change({scope:e.target.value,lookupAxis:''});}}>
        <option value="material">{localize("品种与中间材料")}</option><option value="cross">{localize("杂交组合")}</option>
      </select></label>}
      <label>{localize("性状")}<select aria-label={localize("查询单倍型的性状")} value={trait.id} onChange={e=>selectTrait(e.target.value)}>
        {traits.map(t=><option key={t.id} value={t.id}>{localize(t.name)}</option>)}
      </select></label>
      {genes.length>0&&<label>{localize("关联基因")}<select aria-label={localize("性状关联基因")} value={gene.id} onChange={e=>selectGene(e.target.value)}>
        {genes.map(g=><option key={g.id} value={g.id}>{localize(g.name)}{g.variants.length?'':localize(" · 无观测位点")}</option>)}
      </select></label>}
      {axis&&measuredN>0&&<ReviewRange key={axis.key} axis={axis} bounds={bounds} target={target} observations={rows}
        onBounds={value=>change({goals:{...settings.goals,[axis.key]:value}})} selectedCount={rows.length} scopeLabel="同来源群体"/>}
    </div>
    {axis?<div className="task-context-row"><span>{localize(trialLabel(axis))} · {localize(measuredN.toLocaleString())}{" "+localize("份实测")}</span>
      <ReviewSource axis={axis} sources={sources} datasets={data.meta.datasets} onAxis={key=>change({lookupAxis:key})}/></div>:
      <p className="breeder-note">{localize("当前数据没有这个性状的实测表型，可核对已记录的文献和位点。")}</p>}
    {genes.length===0&&<p className="breeder-note">{localize("先验库暂无这个性状的关联基因。")}</p>}
    {gene&&<div className="task-result">
      <div className="task-heading"><h2>{localize(gene.name)}{" "+localize("型别证据")}</h2>
        <button type="button" className="review-link" onClick={()=>onParents(gene.id,scheme.id,axis,trait.id)}>{localize("带到双亲比较")}</button>
      </div>
      {schemes.length>1&&<details className="review-disclosure"><summary>{localize("判型定义")}</summary>
        <label>{localize("定义")}<select aria-label={localize("性状查询判型定义")} value={scheme.id} onChange={e=>selectGene(gene.id,e.target.value)}>
          {schemes.map(s=><option key={s.id} value={s.id}>{localize(schemeNames[s.kind])} · {localize(s.positions.length)}{" "+localize("位点")}</option>)}
        </select></label>
      </details>}
      {axis&&scheme.ready&&(focusStatus.ready?<PhenotypeEvidence
        reference={reference} scope={scope} axis={axis} target={target} focus={focus} tracking={tracking}
        onTrack={label=>change({tracking:{...settings.tracking,[focus.trackKey]:label}})}
        onCarriers={label=>setCarrier({gene:gene.id,scheme:scheme.id,axis:axis.key,label})}/>:
        <p role={focusStatus.error?'alert':'status'}>{focusStatus.error?<>{localize(focusStatus.error)} <button type="button" onClick={focusStatus.retry}>{localize("重试")}</button></>:'正在读取分型…'}</p>)}
      {axis&&!scheme.ready&&<p className="breeder-note">{localize("目前缺少这个定义的可用位点，无法用群体实测复核该型别。")}</p>}
      {carrierLabel&&<CarrierList key={carrierLabel} title={localize(shortType(carrierLabel)+' · 有同口径实测')}
        samples={carrierSamples} axis={axis} target={target} onReview={s=>onReview(s,axis,focus)}
        definition={JSON.stringify([gene.id,scheme.id,carrierLabel])}/>}
      {original.length>0&&<details className="review-disclosure"><summary>{localize("原文事件与性状")}</summary>
        <div className="matrix-scroll"><table className="individual-table"><thead><tr><th>{localize("原文性状")}</th><th>{localize("型别或变异")}</th><th>{localize("原文描述")}</th><th>{localize("来源")}</th></tr></thead>
          <tbody>{original.map(e=><tr key={e.key}><td>{localize(e.trait||'—')}</td><td>{localize(e.label||e.state||'—')}</td><td>{localize(e.effect||'—')}</td>
            <td>{e.doi.map(d=><a key={d} href={'https://doi.org/'+d} target="_blank" rel="noreferrer">{localize(d)} </a>)}</td></tr>)}</tbody>
        </table></div>
      </details>}
    </div>}
    {axis&&covered.length>1&&<div className="task-result">
      <button type="button" onClick={()=>setScan(!scan)} aria-expanded={scan}>{scan?localize("收起同一性状的型别"):localize("查看同一性状的型别")}</button>
      {scan&&scanStatus.ready&&<p className="breeder-note">{localize(comparableGenes)}{localize("个基因有两个或以上的实测配对型别。")}{summaries.length-comparable.length>0?localize(" 仅一个配对型别的基因保留在下载表中。"):''}
        {target.active?localize(" 表中按达标份数排列，并列出各型别的配对数和比例。"):''}</p>}
      {scan&&!scanStatus.ready&&<p role={scanStatus.error?'alert':'status'}>{scanStatus.error?<>{localize(scanStatus.error)} <button type="button" onClick={scanStatus.retry}>{localize("重试")}</button></>:'正在收集分型与实测配对…'}</p>}
      {scan&&scanStatus.ready&&comparable.length>0&&<div className="matrix-scroll"><table className="individual-table" aria-label={localize("性状型别总表")}>
        <thead><tr><th>{localize("基因")}</th><th>{localize("型别")}</th><th>{localize("配对 n")}</th><th>{localize("中位数 [Q1, Q3]")}</th>{target.active&&<th>{localize("达标")}</th>}</tr></thead>
        <tbody>{comparable.slice(0,limit).map(r=><tr key={JSON.stringify([r.gene.id,r.label])}>
          <th><button className="review-link" type="button" onClick={()=>{selectGene(r.gene.id,r.scheme.id);document.querySelector('.task-panel h2')?.scrollIntoView({block:'center'});}}>{localize(r.gene.name)}</button></th>
          <td>{localize(shortType(r.label))}</td><td>{localize(r.n)}</td><td>{localize(shown(r.median))} [{localize(shown(r.q1))}, {localize(shown(r.q3))}]</td>
          {target.active&&<td>{localize(r.met)} / {localize(r.n)} · {localize(ratio(r.met,r.n))}</td>}</tr>)}</tbody>
      </table></div>}
      {scan&&scanStatus.ready&&summaries.length>0&&<div className="review-footer">
        {comparable.length>limit&&<button className="review-link" type="button" onClick={()=>setLimit(n=>n+20)}>{localize("更多型别")}</button>}
        <button className="review-link" type="button" onClick={exportScan}>{localize("下载性状型别 TXT")}</button>
      </div>}
      {scan&&scanStatus.ready&&!summaries.length&&<p className="breeder-note">{localize("没有找到同口径实测与完整判型的配对记录。")}</p>}
    </div>}
  </section>;
}

function TaskChoice({view,onChange}){
  const localize = useText();
  return <div className="task-tabs" aria-label={localize("资料查询方式")}>
    <button type="button" aria-pressed={view==='materials'} onClick={()=>onChange('materials')}>{localize("查材料和组合")}</button>
    <button type="button" aria-pressed={view==='haplotypes'} onClick={()=>onChange('haplotypes')}>{localize("按性状查单倍型")}</button>
  </div>;
}

export function BreederWorkspace({data,cohort,settings,onChange,initialGene,initialTrait,siteSelections}){
  const localize = useText();
  const [task,setTask]=useState(()=>{
    const requested=new URLSearchParams(location.search).get('task');
    return breedingTasks.some(item=>item.id===requested)?requested:'';
  });
  const [lookup,setLookup]=useState('materials');
  const [legacy,setLegacy]=useState(Boolean(task));
  const [checkedImport,setCheckedImport]=useState(null);
  const [checkedKnown,setCheckedKnown]=useState('');
  const [draft,setDraft]=useState(null);
  const [upload,setUpload]=useState({});
  const [catalogSelected,setCatalogSelected]=useState(false);
  const [inspected,setInspected]=useState(null);
  const plan=draft?.data===data?draft:null;
  const planning=Boolean(plan&&!plan.ran);
  const catalog=useMemo(()=>new Map(data.individuals.map(s=>[materialKey(s),s])),[data]);
  const keys=useMemo(()=>settings.samples??[...new Set([settings.female,settings.male].filter(Boolean))],
    [settings.samples,settings.female,settings.male]);
  const selectedAll=useMemo(()=>keys.map(key=>catalog.get(key)).filter(Boolean),[keys,catalog]);
  const scope=settings.scope??(data.individuals.some(s=>!isCross(s))?'material':'cross');
  const candidates=useMemo(()=>data.individuals.filter(s=>isCross(s)===(scope==='cross')),[data,scope]);
  const selected=useMemo(()=>selectedAll.filter(s=>isCross(s)===(scope==='cross')),[selectedAll,scope]);
  const parents=useMemo(()=>data.individuals.filter(s=>!isCross(s)),[data]);
  const pair=useMemo(()=>[catalog.get(settings.female),catalog.get(settings.male)].filter(s=>s&&!isCross(s)),
    [catalog,settings.female,settings.male]);
  const reviewing=task==='traits'&&lookup==='materials';
  const dashboard=scope==='material'&&(!task&&!planning||reviewing)&&selectedAll.every(s=>s.dataset_id==='rice6044')
    ?data.meta.datasets.find(d=>d.id==='rice6044'):null;
  const showReview=reviewing||Boolean(dashboard);
  const reviewCandidates=useMemo(()=>dashboard?candidates.filter(s=>s.dataset_id===dashboard.id):candidates,[candidates,dashboard]);
  const reference=useMemo(()=>dashboard?reviewCandidates:cohort.filter(s=>isCross(s)===(scope==='cross')),
    [cohort,scope,dashboard,reviewCandidates]);
  const axes=useMemo(()=>breederAxes(data),[data]);
  const catalogRecords=useMemo(()=>dashboard?axes.filter(a=>a.dataset===dashboard.id).map(a=>({...a,observed:a.source.n})):[],[axes,dashboard]);
  const sourceSamples=task==='parents'?pair:selected;
  const {sources,axis}=useMemo(()=>{
    if(!dashboard)return reviewAxes(axes,sourceSamples,{axis:settings.axis,trait:settings.trait},initialTrait);
    const focused=catalogRecords.find(a=>a.key===settings.axis)??mostMeasured(catalogRecords.filter(a=>a.trait_id===settings.trait));
    return {sources:catalogRecords,axis:focused};
  },[axes,sourceSamples,dashboard,catalogRecords,settings.axis,settings.trait,initialTrait]);
  const axisKey=axis?.key,bounds=settings.goals?.[axisKey]??{};
  const target=useMemo(()=>targetRange(bounds),[bounds.min,bounds.max]);
  const observations=useMemo(()=>traitRows(selected,axis,target,reference),[selected,axis,target,reference]);
  const models=useMemo(()=>(settings.geneIds??[]).flatMap(id=>{
    const gene=data.genes.find(g=>g.id===id);
    if(!gene)return [];
    const schemeGene=dashboard?{...gene,variants:gene.variants.filter(v=>v.assayedDatasets?.has(dashboard.id))}:gene;
    const menu=geneSchemes(schemeGene,data.evidence,[],siteSelections[id]),chosen=settings.schemes?.[id];
    const scheme=menu.find(s=>s.id===chosen)??(siteSelections[id]&&menu.find(s=>s.id==='custom'))??menu[0];
    return [{gene,menu,scheme,trackKey:trackingKey(axis,gene,scheme)}];
  }).map((m,index)=>({...m,index})),[data,settings.geneIds,settings.schemes,siteSelections,axis,dashboard]);
  const needsCalls=models.length>0&&(task==='parents'?pair.length===2:task==='stack'||!!dashboard||reviewing&&selected.length>0);
  const status=useGeneCalls(data,models.map(m=>m.gene.id),needsCalls);
  const result=useMemo(()=>status.ready&&models.length&&selected.length?jointCalls(selected,models.map(m=>m.scheme)):null,
    [status.ready,selected,models]);
  const callById=useMemo(()=>new Map((result?.members??[]).map(m=>[m.sample.id,m])),[result]);
  const focus=models.find(m=>m.gene.id===settings.focus)??models[0];
  const pairSuggestions=useMemo(()=>{
    if(task!=='parents'||pair.length!==2||!axis)return [];
    const ids=new Set(data.reference.genes.filter(g=>g.trait_ids.includes(axis.trait_id)).map(g=>g.id));
    return data.genes.filter(g=>ids.has(g.id)&&!models.some(m=>m.gene.id===g.id)&&
      g.variants.some(v=>pair.every(s=>v.assayedDatasets?.has(s.dataset_id)))).slice(0,6);
  },[pair,axis,data,models,task]);
  function change(update){onChange(previous=>({...previous,...update}));}
  function open(id){
    const url=new URL(location.href);
    if(id==='introgression')url.searchParams.set('task',id);
    else url.searchParams.delete('task');
    history.replaceState(null,'',url);
    setTask(id);
    window.scrollTo(0,0);
  }
  function showMaterial(samples,view){
    append(samples,view);
    setCatalogSelected(true);
    setInspected(samples.length===1&&samples[0].dataset_id==='rice6044'?{key:materialKey(samples[0])}:null);
    setLookup('materials');
    open('traits');
  }
  function append(samples,view){
    const noCurrent=selected.length===0&&samples.length>0&&samples.every(s=>isCross(s)!==(scope==='cross'));
    const nextScope=view??(noCurrent?(isCross(samples[0])?'cross':'material'):scope);
    onChange(previous=>({...previous,samples:[...new Set([...(previous.samples??keys),...samples.map(materialKey)])],
      ...(nextScope!==scope?{scope:nextScope,axis:'',trait:''}:{})}));
  }
  function remove(samples){
    const obsolete=new Set(samples.map(materialKey));
    onChange(previous=>{
      const review=previous.review;
      return {...previous,samples:(previous.samples??keys).filter(key=>!obsolete.has(key)),
        ...(review?{review:{...review,decisions:Object.fromEntries(Object.entries(review.decisions).filter(([key])=>!obsolete.has(key)))}}:{})};
    });
  }
  function chooseAxis(key){
    change({axis:key,trait:axes.find(e=>e.key===key)?.trait_id??''});
  }
  function chooseCatalogTrait(id){
    const record=mostMeasured(catalogRecords.filter(a=>a.trait_id===id));
    change({axis:record?.key??'',trait:id,queryTrait:id});
  }
  function openParents(geneId,schemeId,shownAxis,traitId){
    const pinned=[...new Set([...models.map(m=>m.gene.id),geneId])];
    change({geneIds:pinned,focus:geneId,schemes:{...settings.schemes,[geneId]:schemeId},trait:traitId,axis:shownAxis?.key??''});
    open('parents');
  }
  function selectTrait(trait){
    const next={queryTrait:trait.id,lookupTrait:trait.id,lookupAxis:'',lookupGene:focus?.gene.id??'',lookupScheme:''};
    if(dashboard){
      if(catalogRecords.some(a=>a.trait_id===trait.id)){
        chooseCatalogTrait(trait.id);
        return;
      }
      change(next);
      setLookup('haplotypes');
      open('traits');
      return;
    }
    if(trait.environments?.length&&task==='parents'&&pair.length===2){
      change({...next,trait:trait.id,axis:''});
      return;
    }
    if(trait.environments?.length&&selected.length){
      change({...next,trait:trait.id,axis:''});
      setLookup('materials');
    }else{
      change(next);
      setLookup('haplotypes');
    }
    open('traits');
  }
  function selectEntities(hits){
    const {type}=hits[0],items=hits.map(h=>h.item);
    setLegacy(false);
    setUpload({});
    if(plan&&!plan.ran){
      if(type==='trait')changePlan({traits:items,axis:''});
      else if(type==='material')addPlanMaterials(items);
      else changePlan({genes:[...new Map([...plan.genes,...items].map(g=>[g.id,g])).values()]});
      return;
    }
    if(plan)setDraft(null);
    if(type==='material'){
      showMaterial(items,isCross(items.at(-1))?'cross':'material');
    }else if(type==='trait'){
      selectTrait(items[0]);
    }else{
      const latest=items.at(-1);
      change({geneIds:[...new Set([...models.map(m=>m.gene.id),...items.map(g=>g.id)])],focus:latest.id,
        lookupGene:latest.id,lookupScheme:''});
      if(dashboard||task==='parents'||task==='check'||reviewing&&selected.length)return;
      if(task==='traits'&&lookup==='haplotypes'&&items.length===1)return;
      open('stack');
    }
  }
  function changePlan(update){setDraft(previous=>({...previous,...update}));}
  function propose(sentence){
    const parsed=makeBreederPlan(sentence,data);
    if(!parsed)return;
    setLegacy(false);
    setUpload({});
    setDraft({...parsed,data});
    open('');
  }
  function addPlanMaterials(items){
    changePlan({materials:[...new Map([...plan.materials,...items].map(s=>[materialKey(s),s])).values()]});
  }
  function runPlan(source){
    const trait=plan.traits[0],keys=plan.materials.map(materialKey),geneIds=plan.genes.map(g=>g.id);
    const goal=targetRange(plan.goal??{});
    const settingsPatch={samples:keys,geneIds,focus:geneIds[0]??'',
      scope:keys.length&&plan.materials.every(isCross)?'cross':'material',
      female:plan.scenario==='parents'?plan.female:'',male:plan.scenario==='parents'?plan.male:'',
      queryTrait:trait?.id??'',trait:trait?.id??'',lookupTrait:trait?.id??'',lookupGene:geneIds[0]??'',
      axis:source?.key??'',lookupAxis:source?.key??'',lookupScheme:''};
    onChange(previous=>({...previous,...settingsPatch,
      ...(source&&goal.active?{goals:{...previous.goals,[source.key]:{min:plan.goal.min,max:plan.goal.max}}}:{})}));
    if(plan.scenario==='traits')setLookup(keys.length&&(!trait||trait.environments?.length)?'materials':'haplotypes');
    if(plan.scenario==='check'){setCheckedImport(null);setCheckedKnown(plan.materials[0].id);}
    changePlan({ran:true});
    open(plan.scenario);
  }
  async function loadFiles(files){
    setUpload({busy:true});
    try{
      if(files.length>3)throw Error('请选择一份名单，或同一材料的 VCF、PAV 和表型文件。');
      const inputs=await readCheckFiles(files),texts=inputs.map(f=>f.text);
      const fields=texts[0].trimStart().split(/\r?\n/,1)[0].split('\t');
      setLegacy(false);
      if(texts.length===1&&!isVcf(texts[0])&&!fields.some(k=>['marker_id','genotype','trait','source_gene_id'].includes(k.trim()))){
        const rows=resolveSampleList(texts[0],dashboard?reviewCandidates:data.individuals);
        const samples=rows.flatMap(r=>r.sample?[r.sample]:[]);
        const missed=rows.filter(r=>r.status!=='matched');
        const info='匹配 '+samples.length+' 份'+(missed.length?' · '+missed.length+' 条未匹配或需指定数据集':'');
        const names=missed.slice(0,6).map(r=>r.sample_id).join('、');
        if(!samples.length)throw Error(info+(names?' · '+names:''));
        if(plan&&!plan.ran)addPlanMaterials(samples);
        else showMaterial(samples,samples.every(isCross)?'cross':'material');
        setUpload({notice:info+(names?' · '+names:'')});
      }else{
        setCheckedImport({...parseMaterialChecks(texts,data.genes.flatMap(g=>g.variants),'G_mixed',data.genes),inputs});
        setCheckedKnown('');
        if(plan?.scenario==='check'){
          change({samples:[],geneIds:plan.genes.map(g=>g.id),queryTrait:''});
          changePlan({ran:true});
        }else if(plan)setDraft(null);
        open('check');
        setUpload({});
      }
    }catch(e){setUpload({error:e.message});}
  }
  function newQuery(){
    change({samples:[],geneIds:[],female:'',male:'',axis:'',trait:'',queryTrait:'',lookupTrait:'',lookupAxis:'',lookupGene:'',lookupScheme:'',review:undefined});
    setCheckedImport(null);
    setCheckedKnown('');
    setDraft(null);
    setUpload({});
    setLegacy(false);
    setCatalogSelected(false);
    setInspected(null);
    open('');
  }
  function removeMaterial(s){
    remove([s]);
    const key=materialKey(s);
    if(task==='parents'&&(settings.female===key||settings.male===key)){
      change({female:'',male:''});
      setLookup('materials');
      open('traits');
    }
  }
  function removeGene(id){
    const geneIds=models.filter(m=>m.gene.id!==id).map(m=>m.gene.id);
    change({geneIds,lookupGene:settings.lookupGene===id?'':settings.lookupGene,lookupScheme:''});
    if(!geneIds.length&&task==='stack')open('');
  }
  function updateBounds(value){
    onChange(previous=>({...previous,axis:axisKey,goals:{...previous.goals,[axisKey]:value}}));
  }
  const chosenTrait=queryTraits(data).find(t=>t.id===settings.queryTrait);
  const chosenParents=selectedAll.filter(s=>!isCross(s));
  function compareSelected(){
    change({samples:keys,female:materialKey(chosenParents[0]),male:materialKey(chosenParents[1])});
    open('parents');
  }
  function viewTraitTypes(){
    const traitId=axis?.trait_id??chosenTrait?.id??initialTrait;
    change({lookupTrait:traitId,lookupAxis:axis?.key??'',lookupGene:focus?.gene.id??'',lookupScheme:''});
    setLookup('haplotypes');
    open('traits');
  }
  const geneControls=null;
  const datasets=data.meta.datasets,heading=breedingTasks.find(item=>item.id===task)?.title;
  const availableTraits=new Map(sources.map(a=>[a.trait_id,a.trait_name]));
  const canCompare=task!=='parents'&&chosenParents.length===2;
  const canStack=task!=='stack'&&models.length>=2;
  const canLookup=showReview&&Boolean(axis);
  const canReview=!showReview&&selected.length>0;
  return <main className="breeder-workspace">
    <header className="breeder-workbench-header">
    <div className="breeder-intro"><h1>{localize("育种工作台")}</h1><p>{task==='introgression'?localize("家系内效应复核"):dashboard?dashboard.name:datasets.length===1?datasets[0].name:datasets.length+' 个数据集'}</p></div>
    {task==='introgression'?<button className="review-link" type="button" onClick={()=>open('')}>{localize("返回材料比较")}</button>:
    <BreederInput data={data} onSelect={selectEntities} onSentence={propose} onUpload={loadFiles} upload={upload} planning={planning} compact={Boolean(dashboard)} datasetId={dashboard?.id}
      materials={planning?[]:selectedAll} genes={planning?[]:models.map(m=>m.gene)}
      trait={planning?null:chosenTrait} onRemoveMaterial={removeMaterial} onRemoveGene={removeGene}
      importName={task==='check'?checkedImport?.sample.name:null} onRemoveImport={()=>{setCheckedImport(null);open('');}}
      onRemoveTrait={()=>change({queryTrait:'',trait:'',axis:'',lookupTrait:'',lookupAxis:''})} onReset={newQuery}>
      {!planning&&(canCompare||canStack||canLookup||canReview)&&<>
        {canCompare&&!dashboard&&<button className="review-link" type="button" onClick={compareSelected}>{localize("比较双亲")}</button>}
        {canStack&&<button className="review-link" type="button" onClick={()=>open('stack')}>{localize("查看基因组合")}</button>}
        {canLookup&&<button className="review-link" type="button" onClick={viewTraitTypes}>{localize("查")}{localize(axis.trait_name)}{localize("的型别")}</button>}
        {canReview&&<button className="review-link" type="button" onClick={()=>{setLookup('materials');open('traits');}}>{localize("查看所选材料")}</button>}
      </>}
      {!planning&&<button className="review-link" type="button" onClick={()=>{setDraft(null);open('introgression');}}>{localize("亲本导入决策")}</button>}
    </BreederInput>}
    </header>
    {task!=='introgression'&&<section className="breeder-card" aria-label={localize("育种基因选择")}>
      <GeneControls data={data} models={models} focus={focus} change={change} onFocus={value=>change({focus:value})}/>
      <button type="button" className="review-link" onClick={()=>open('check')}>{localize("多材料优势状态体检")}</button>
      <button type="button" className="review-link" disabled={models.length<2} onClick={()=>open('stack')}>{localize("多基因比较（")}{localize(models.length)}）</button>
    </section>}
    {plan&&<BreederPlan plan={plan} axes={axes} onChange={changePlan} onRun={runPlan} onClose={()=>setDraft(null)}/>}
    {heading&&!reviewing&&task!=='introgression'&&<h2 className="entry-result-title">{task==='traits'?localize("性状型别"):heading}</h2>}
    {task==='introgression'&&<IntrogressionReview/>}
    {task==='parents'&&<ParentPanel data={data} candidates={parents} axis={axis} models={models} ready={status.ready}
      settings={settings} change={update=>change({samples:keys,...update})}
      target={target} onCrosses={samples=>showMaterial(samples,'cross')}
      onExplore={()=>{change({lookupTrait:axis?.trait_id??initialTrait,lookupAxis:axis?.key??''});setLookup('haplotypes');open('traits');}}>
      <div className="task-form">
        {axis&&<label>{localize("关注性状")}<select aria-label={localize("双亲比较性状")} value={axis.trait_id} onChange={e=>change({trait:e.target.value,axis:''})}>
          {[...availableTraits].map(([id,name])=><option key={id} value={id}>{localize(name)}</option>)}
        </select></label>}
        {localize(geneControls)}
      </div>
      {pairSuggestions.length>0&&<div className="task-suggestions">
        <span>{localize("目标性状的候选基因")}</span>
        {pairSuggestions.map(g=><button className="review-link" type="button" key={g.id}
          aria-label={localize('添加 '+g.name)} onClick={()=>change({geneIds:[...models.map(m=>m.gene.id),g.id],focus:g.id})}>{localize(g.name)} +</button>)}
      </div>}
      {pair.length===2&&pair[0]!==pair[1]&&<button type="button" className="review-link"
        onClick={()=>change({female:settings.male,male:settings.female})}>{localize("调换母父本")}</button>}
      {axis&&<ReviewSource axis={axis} sources={sources} datasets={datasets} onAxis={chooseAxis}/>}
    </ParentPanel>}
    {task==='traits'&&legacy&&!dashboard&&<TaskChoice view={lookup} onChange={setLookup}/>}
    {dashboard&&<BreederCatalog data={data} onAddGene={gene=>selectEntities([{type:'gene',item:gene}])} onCompare={canCompare?compareSelected:null} dataset={dashboard} candidates={reviewCandidates} selected={selected}
      sources={sources} axis={axis} bounds={bounds} target={target} observations={observations}
      models={models} status={status} callById={callById}
      selectedOnly={catalogSelected} onSelectedOnly={setCatalogSelected} inspect={inspected} onInspect={key=>setInspected(key?{key}:null)}
      chooseTrait={chooseCatalogTrait} chooseAxis={chooseAxis}
      chooseScheme={(geneId,schemeId)=>change({schemes:{...settings.schemes,[geneId]:schemeId}})} removeGene={removeGene}
      add={append} remove={s=>remove([s])} clear={()=>{remove(selected);setCatalogSelected(false);setInspected(null);}}
      onBounds={updateBounds} review={settings.review} onReview={review=>change({review})}/>}
    {reviewing&&!dashboard&&<BreederReview data={data} candidates={candidates} selected={selected} totalSelected={selectedAll.length} unavailable={keys.length-selectedAll.length}
        scope={scope} changeScope={value=>change({scope:value,axis:'',trait:''})}
        add={append} remove={s=>remove([s])} clear={()=>remove(selected)} axis={axis} sources={sources} bounds={bounds} target={target}
        onAxis={chooseAxis} onTrait={trait=>change({trait,axis:''})}
        onBounds={updateBounds}
        models={models} observations={observations} referenceN={observations[0]?.reference_n} callById={callById} showInput={legacy}>
      {localize(geneControls)}
    </BreederReview>}
    {task==='traits'&&!reviewing&&<TraitLookup data={data} axes={axes} reference={reference} scope={scope} settings={settings}
        change={change} initialTrait={initialTrait} siteSelections={siteSelections}
        onReview={(s,shownAxis,mark)=>{
          showMaterial([s],isCross(s)?'cross':'material');
          change({trait:shownAxis.trait_id,axis:shownAxis.key,
            geneIds:[...new Set([...models.map(m=>m.gene.id),mark.gene.id])],schemes:{...settings.schemes,[mark.gene.id]:mark.scheme.id}});
        }} onParents={openParents}/>}
    {task==='stack'&&<section className="breeder-card task-panel" aria-label={localize("多基因聚合")}>
      <div className="task-form">
        {localize(geneControls)}
        {data.individuals.some(isCross)&&<label>{localize("对象")}<select aria-label={localize("聚合对象")} value={scope}
          onChange={e=>change({scope:e.target.value,axis:'',trait:''})}>
          <option value="material">{localize("品种与中间材料")}</option><option value="cross">{localize("杂交组合")}</option>
        </select></label>}
      </div>
      {models.length<2&&<p className="breeder-note">{models.length?localize("再添加一个基因可查看组合。"):localize("搜索基因以查看群体型别。")}</p>}
      {models.length>0&&<CombinationPanel data={data} models={models} settings={settings} change={change} ready={status.ready}
          reference={reference} scope={scope} target={settings.axis?target:targetRange()} axis={settings.axis?axis:null} focus={focus} reviewResult={result}
          onReview={s=>showMaterial([s],isCross(s)?'cross':'material')}/>}
    </section>}
    {task==='check'&&<MaterialCheck data={data} axes={axes} models={models} initialGene={initialGene} siteSelections={siteSelections}
      geneControls={geneControls} fileCheck={checkedImport} setFileCheck={setCheckedImport}
      initialSampleId={checkedKnown} initialSamples={selectedAll} showInput={legacy||!checkedImport&&!checkedKnown}/>}
    {needsCalls&&!status.ready&&<p className="breeder-status" role={status.error?'alert':'status'}>
      {status.error?<>{localize(status.error)} <button type="button" onClick={status.retry}>{localize("重试")}</button></>:'正在载入关注基因的分型…'}
    </p>}
  </main>;
}
