import React,{useMemo,useState} from 'react';
import {RegionalPhenotypes} from './RegionalPhenotypes.jsx';
import {assessmentPolicy,isTargetRange,targetKey} from './traitAssessment.js';
import {regionalView} from './regions.js';
import {typeMaterial} from './jointHaplotypes.js';
import {presetTitle,readableDefinition} from './provenance.js';
import {reportedAllele} from './traitEvidence.js';

function TargetEditor({trait,unit,range,onChange}) {
  const [lower,setLower]=useState(range?.[0]?.toString()??'');
  const [upper,setUpper]=useState(range?.[1]?.toString()??'');
  const [error,setError]=useState(false);
  function apply(event){
    event.preventDefault();
    const value=[Number(lower),Number(upper)];
    if(!lower.trim()||!upper.trim()||!isTargetRange(value)){setError(true);return;}
    setError(false);onChange(value);
  }
  return <div className="trait-target">
    <form onSubmit={apply} aria-label={trait.name+'目标区间'}>
      <label>下限 <input type="number" step="any" aria-label={trait.name+'目标下限'} value={lower} onChange={e=>setLower(e.target.value)}/></label>
      <label>上限 <input type="number" step="any" aria-label={trait.name+'目标上限'} value={upper} onChange={e=>setUpper(e.target.value)}/></label>
      <span>{unit}</span><button type="submit">应用区间</button>
      {range&&<button type="button" onClick={()=>{setLower('');setUpper('');setError(false);onChange(null);}}>清除</button>}
    </form>
    {error?<p role="alert">请输入两个有效数值，下限须小于或等于上限。</p>:
      range&&<p role="status">目标 {range[0]}–{range[1]} {unit} · 中位数距区间最近者优先，相同距离比较区间内比例。</p>}
  </div>;
}

function TraitCard({trait,associated,gene,cohort,groups,scheme,selectedIds,targets,onTarget,onInspect}) {
  const [selection,setSelection]=useState({});
  const view=useMemo(()=>regionalView(trait,selection),[trait,selection]);
  const policy=assessmentPolicy(trait,view.active);
  const key=targetKey(trait,view.active);
  const range=policy.mode==='relative'?targets[key]:undefined;
  return <section className="trait-card" data-trait={trait.id} aria-label={trait.name+' · '+view.unit}>
    <header className="trait-card-heading"><h3>{trait.name} <small>{view.unit}</small></h3>
      <span className={'trait-badge '+(policy.mode==='absolute'?'trait-absolute':'trait-relative')}>{policy.mode==='absolute'?'绝对性状':'相对性状'}</span>
      {associated&&<span className="trait-associated">基因关联</span>}
    </header>
    {policy.mode==='relative'?<TargetEditor key={key+JSON.stringify(range)} trait={trait} unit={view.unit} range={range} onChange={r=>onTarget(key,r)}/>:
      <p className="trait-criterion">{policy.criterion||'该鉴定指标的量尺方向待核。'}
        {policy.direction&&<a href={policy.protocol} target="_blank" rel="noreferrer"> 测定来源 ↗</a>}
      </p>}
    <RegionalPhenotypes trait={trait} gene={gene} groups={groups} cohort={cohort} selectedIds={selectedIds} compact
      markerIds={scheme.markers.map(v=>v.id)} view={view} assessment={{policy,range,scheme:scheme.id}}
      onInspect={onInspect} onChange={patch=>setSelection(current=>({assay:view.assay,year:view.year,site:view.active.source.site,...current,...patch}))}/>
  </section>;
}

function DescriptorCard({entry}) {
  const [selected,setSelected]=useState('');
  const [key,trial]=entry.trials.has(selected)?[selected,entry.trials.get(selected)]:entry.trials.entries().next().value;
  const {record,counts,total}=trial;
  return <section className="trait-card">
    <header className="trait-card-heading"><h3>{record.descriptor}</h3>
      <small>{[entry.dataset,record.dictionary_id].filter(Boolean).join(' · ')}</small></header>
    {entry.trials.size>1&&<label>试验 <select aria-label={record.descriptor+'试验'} value={key} onChange={e=>setSelected(e.target.value)}>
      {[...entry.trials].map(([id,{record}])=><option key={id} value={id}>{[record.site,record.crop_year].filter(Boolean).join(' · ')||'试验未登记'}</option>)}
    </select></label>}
    <p>{[record.site,record.crop_year].filter(Boolean).join(' · ')} · {total} 条记录</p>
    <ul>{[...counts].map(([group,values])=><li key={group}><b>{group}</b>{' · '}{[...values].map(([label,n])=>`${label} × ${n}`).join('；')}</li>)}</ul>
  </section>;
}

function DescriptorProfile({cohort,groups}) {
  const [open,setOpen]=useState(false);
  const rows=useMemo(()=>{
    if(!open)return [];
    const bySample=new Map(groups.flatMap(g=>g.members.map(s=>[s.id,g.label])));
    const entries=new Map();
    for(const sample of cohort)for(const record of sample.descriptors||[]){
      const key=JSON.stringify([sample.dataset_id,record.source_id,record.descriptor_id,record.dictionary_id]);
      if(!entries.has(key))entries.set(key,{key,dataset:sample.dataset_name,trials:new Map()});
      const {trials}=entries.get(key);
      const trialKey=JSON.stringify([record.site,record.crop_year]);
      if(!trials.has(trialKey))trials.set(trialKey,{record,counts:new Map([['当前全部材料',new Map()]]),total:0});
      const trial=trials.get(trialKey),group=bySample.get(sample.id);
      trial.total++;
      const label=record.value_code+(record.value_label?' · '+record.value_label:'');
      for(const name of ['当前全部材料',...(group?[group]:[])]){
        if(!trial.counts.has(name))trial.counts.set(name,new Map());
        const counts=trial.counts.get(name);
        counts.set(label,(counts.get(label)||0)+1);
      }
    }
    return [...entries.values()];
  },[open,cohort,groups]);
  if(!cohort.some(sample=>sample.descriptors?.length))return null;
  return <details className="trait-descriptors" onToggle={e=>setOpen(e.currentTarget.open)}>
    <summary>分类表型</summary>
    {open&&rows.map(entry=><DescriptorCard key={entry.key} entry={entry}/>)}
  </details>;
}

export function PhenotypeProfile({data,gene,related,cohort,variants,schemes,claims,selectedIds,targets,onTarget,onInspect}) {
  const [schemeId,setSchemeId]=useState(null);
  const available=useMemo(()=>{
    const definitions=schemes.filter(s=>s.kind==='literature'&&s.ready).map(s=>{
      const effects=new Map();
      for(const definition of s.definitions){
        const matches=claims.filter(c=>c.definition_id===definition.id&&s.doi.includes(c.doi));
        if(definition.valid&&matches.length)effects.set(definition.sequence.replaceAll('·',' '),matches);
      }
      return {...s,effects};
    });
    const byMarker=new Map();
    for(const claim of claims){
      if(claim.judgment!=='favourable'||!claim.marker_state)continue;
      const allele=reportedAllele(gene,claim,data.evidence);
      if(!allele||allele.index<0)continue;
      const {marker,state}=allele;
      if(!byMarker.has(marker.id))byMarker.set(marker.id,{
        id:'allele:'+marker.id,kind:'observed',markers:[marker],positions:[marker.pos],ready:true,
        title:'文献功能等位 · '+marker.id,effects:new Map(),
      });
      const map=byMarker.get(marker.id).effects;
      map.set(state,[...(map.get(state)||[]),claim]);
    }
    return [...definitions,...byMarker.values()];
  },[claims,data.evidence,gene,schemes]);
  const axes=useMemo(()=>new Map(data.traits.filter(t=>t.environments?.length).map(t=>[t.id,t.environments.map(e=>e.id)])),[data.traits]);
  const preferred=useMemo(()=>{
    return available.find(s=>{
      const endpoints=new Map([...s.effects].map(([sequence,records])=>[sequence,
        records.filter(c=>c.judgment==='favourable').flatMap(c=>axes.get(c.trait_id)||[])]).filter(([,ids])=>ids.length));
      return endpoints.size>0&&cohort.some(sample=>{
        const typed=typeMaterial(sample,s);
        return typed.status==='called'&&endpoints.get(typed.bases)?.some(id=>Number.isFinite(sample.phenotypes[id]));
      });
    });
  },[available,cohort,axes]);
  const named=available.find(s=>s.id===schemeId)||(schemeId!=='selection'?(preferred||available[0]):null);
  const scheme=useMemo(()=>named||{id:'selection',kind:'observed',markers:variants,positions:variants.map(v=>v.pos),ready:variants.length>0},[named,variants]);
  const groups=useMemo(()=>{
    const assigned=new Map();
    for(const sample of cohort){
      const call=typeMaterial(sample,scheme);
      if(call.status!=='called'&&call.status!=='unmatched')continue;
      const key=call.bases;
      if(!assigned.has(key)){
        const effects=call.status==='called'?scheme.effects?.get(key):undefined;
        const label=call.status==='called'?(effects?.[0]?.label||readableDefinition(call.label)):'观测型 '+call.bases;
        assigned.set(key,{key,label,effects,members:[]});
      }
      assigned.get(key).members.push(sample);
    }
    return [...assigned.values()].sort((a,b)=>b.members.length-a.members.length||a.label.localeCompare(b.label));
  },[cohort,scheme]);
  const plots=useMemo(()=>groups.length?groups:[{key:'reference',label:'当前全部材料',members:cohort}],[groups,cohort]);
  const associated=new Set(related.map(t=>t.id));
  const favourableTraits=new Set(groups.flatMap(g=>(g.effects||[]).filter(c=>c.judgment==='favourable'&&
    g.members.some(s=>axes.get(c.trait_id)?.some(id=>Number.isFinite(s.phenotypes[id])))).map(c=>c.trait_id)));
  const paperTraits=new Set([...(scheme.effects?.values()||[])].flatMap(effects=>effects.map(c=>c.trait_id)));
  const measured=data.traits.filter(t=>t.environments?.length).sort((a,b)=>
    Number(favourableTraits.has(b.id))-Number(favourableTraits.has(a.id))||
    Number(paperTraits.has(b.id))-Number(paperTraits.has(a.id))||Number(associated.has(b.id))-Number(associated.has(a.id)));
  const columns=new Map([['relative',[]],['absolute',[]]]);
  for(const trait of measured)columns.get(assessmentPolicy(trait,trait.environments[0]).mode).push(trait);
  const stacks=[...columns].filter(([,traits])=>traits.length).sort((a,b)=>Number(favourableTraits.has(b[1][0].id))-Number(favourableTraits.has(a[1][0].id)));
  const unmeasured=related.filter(t=>!t.environments?.length).map(t=>t.name);
  return <section className="panel trait-profile" aria-label="全部表型与单倍型评价">
    <header className="panel-title"><div><h2>表型与单倍型评价</h2><p>{measured.length} 项定量表型 · 按鉴定指标、地点和年份比较</p></div></header>
    <div className="profile-toolbar">
      <label>分型方案 <select aria-label="表型分型方案" value={scheme.id} onChange={e=>setSchemeId(e.target.value)}>
        <option value="selection">当前位点纯合型</option>
        {available.map(s=><option key={s.id} value={s.id}>{s.title||presetTitle(s)}</option>)}
      </select></label>
      <span>{groups.length?`${groups.length} 型 · ${groups.reduce((n,g)=>n+g.members.length,0).toLocaleString()} 份完成判型`:'当前无完整判型，展示群体原始表型'}</span>
    </div>
    {unmeasured.length>0&&<p className="profile-unmeasured">暂无配对实测 · {unmeasured.join('、')}</p>}
    {stacks.map(([mode,traits])=><section className="trait-stack" key={mode}>
      <h3 className="trait-stack-heading">{mode==='relative'?'相对性状':'绝对性状'}</h3>
      {traits.map(trait=><TraitCard key={trait.id} trait={trait} associated={associated.has(trait.id)} gene={gene}
        cohort={cohort} groups={plots} scheme={scheme} selectedIds={selectedIds} targets={targets} onTarget={onTarget} onInspect={onInspect}/>)}
    </section>)}
    <DescriptorProfile cohort={cohort} groups={groups}/>
    {measured.length>0&&<p className="footnote">优势标识对应本试验和所选材料的描述性表现。n 为该型有实测值的材料数。</p>}
  </section>;
}
