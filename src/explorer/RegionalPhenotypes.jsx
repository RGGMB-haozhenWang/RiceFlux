import {useText} from './locale.jsx';
import './regions.css';
import React, {useMemo,useState} from 'react';
import {regionalDistributions, siteName} from './regions.js';
import {TrialProtocol} from './TrialProtocol.jsx';
import {PhenotypeTests} from './PhenotypeTests.jsx';
import {typeMaterial} from './jointHaplotypes.js';
import {presetTitle} from './provenance.js';
import {assessPhenotype,isTargetRange} from './traitAssessment.js';
import {effectDirections,quantitativeEffectText,claimEvidenceKey} from './traitEvidence.js';
import {phenotypeEffectComparisons} from './phenotypeEffectComparisons.js';
import {buildHaplotypeMapping} from './haplotypeIdentity.js';

const numberFormat = new Intl.NumberFormat('zh-CN', {maximumFractionDigits:3,useGrouping:false});
const valueText = value => numberFormat.format(value);
const signed=value=>(value>0?'+':'')+valueText(value);
const median=value=>Number.isFinite(value)?valueText(value):'—';
const literatureLabel=claim=>claim.judgment==='favourable'?'文献优势':claim.judgment==='unfavourable'?'文献较弱':'文献效应';
const literatureStyle=claim=>claim.judgment==='favourable'?'literature-positive':claim.judgment==='unfavourable'?'literature-negative':'';
const directionArrow=claim=>claim.direction==='increase'?'↑':'↓';

function RangePlot({row,domain,target}) {
  const localize = useText();
  const scale=Math.max(1,Math.abs(domain[0]),Math.abs(domain[1]));
  const position = v => 100 * (v/scale-domain[0]/scale) / (domain[1]/scale-domain[0]/scale);
  const caption=localize('范围 #0#–#1#，四分位区间 #2#–#3#，中位数 #4#',
    [row.min,row.max,row.q1,row.q3,row.median].map(valueText));
  return <svg className="region-range" viewBox="0 0 100 16" preserveAspectRatio="none" role="img" aria-label={localize(caption)}>
    <title>{localize(caption)}{target?localize("；目标 #0#–#1#", [valueText(target[0]), valueText(target[1])]):''}</title>
    {target&&<g aria-hidden="true"><rect className="target-band" x={Math.min(99.5,position(target[0]))} y="0"
      width={Math.max(.5,position(target[1])-position(target[0]))} height="16"/></g>}
    <line className="range-line" x1={position(row.min)} x2={position(row.max)} y1="8" y2="8"/>
    {[row.min,row.max].map((v,i) => <line className="range-line" key={i} x1={position(v)} x2={position(v)} y1="5" y2="11"/>)}
    <rect x={position(row.q1)} width={Math.max(.8,position(row.q3)-position(row.q1))} y="3" height="10" rx="1"/>
    <line className="range-median" x1={position(row.median)} x2={position(row.median)} y1="2" y2="14"/>
    {row.highlighted.map(s => <circle key={s.id} cx={position(s.value)} cy="8" r="2"><title>{localize(s.id)} · {localize(s.value)}</title></circle>)}
  </svg>;
}

function observedDelta({difference,differenceUnit,relative}) {
  if(!Number.isFinite(difference))return '';
  return signed(difference)+(differenceUnit?' '+differenceUnit:'')+(Number.isFinite(relative)?'（'+signed(relative)+'%）':'');
}

function EffectDetails({comparisons,view,matched=true}) {
  const localize = useText();
  const trial=[siteName(view.active.source.site),view.year,view.assays.length>1&&view.assay].filter(Boolean).join(' · ');
  return comparisons.map(({claim,literature,observed,relation})=><div className="phenotype-effect-entry" key={claimEvidenceKey(claim)}>
    <p className="phenotype-effect-heading"><b>{localize(claim.label)}{localize(claim.control_label?' 对 '+claim.control_label:'')}</b>
      <a href={'https://doi.org/'+claim.doi} target="_blank" rel="noreferrer">{localize("原文 ↗")}</a></p>
    <div className="phenotype-effect-current">
      <p><b>{localize("当前实测")}</b> · {localize(trial)}</p>
      {matched&&observed&&['ready','insufficient'].includes(observed.status)?<>
        <p>{localize("中位数")+" "}{localize(median(observed.targetMedian))} / {localize(median(observed.controlMedian))} {localize(view.unit)} · n = {localize(observed.targetN)} / {localize(observed.controlN)}</p>
        <p>{observed.status==='insufficient'?'两组各至少需要 10 份有测值':<b>{observedDelta(observed)||localize("差值无法计算")}</b>}</p>
      </>:<p>{relation==='extension'?localize("涵盖全部文献位点。切换到原文分型方案可查看同口径实测。"):
        relation==='ambiguous'?localize("当前位点无法区分同一原文的多个型名。"):
        observed?localize("当前分型未匹配文献目标型与对照型"):localize("原文对照尚未映射到当前分型")}</p>}
    </div>
    {literature.length?literature.map((q,i)=><div className="phenotype-effect-paper" key={i} title={localize(q.note||undefined)}>
      <p><b>{localize("文献")}</b> · {localize(q.comparison)}</p>
      <p>{(q.target||q.control)&&<>{localize(q.target||'—')} / {localize(q.control||'—')} {localize(q.unit)} · </>}{localize("差值")}<b>{localize(quantitativeEffectText(q,'difference'))}</b>{" "+localize("· 相对变化")+" "}<b>{localize(quantitativeEffectText(q,'relative'))}</b></p>
      <small>{localize(q.locator)}</small>
    </div>):<div className="phenotype-effect-paper"><p>{localize("文献效应量待核")}</p><small>{localize(claim.locator)}</small></div>}
  </div>);
}

function RowEffect({comparisons,view}) {
  const localize = useText();
  const preview=comparisons.find(item=>item.observed?.status==='ready')||comparisons[0];
  const {claim,observed,relation,controlKey}=preview;
  const delta=observed?.status==='ready'?observedDelta(observed):'';
  const projected=relation==='extension';
  return <details className="region-row-effect">
    <summary><span className={'trait-badge '+(projected?'':literatureStyle(claim))}>
      {projected?localize("文献位点匹配"):localize(literatureLabel(claim))+' '+directionArrow(claim)}</span>
      {delta&&<span className="region-effect-value">{localize("实测")+" "}{localize(delta)}<small>{" "+localize("· 对")+" "}{localize(controlKey.replaceAll(' ','·'))}{localize("（原文")+" "}{localize(claim.control_label)}）</small></span>}</summary>
    <EffectDetails comparisons={comparisons} view={view}/>
  </details>;
}

export function RegionalPhenotypes({trait, groups, allGroups=groups, gene, schemes=[],cohort=[],markerIds=[], view, onChange, selectedIds,compact=false,assessment,onInspect,claims=[],mapping}) {
  const localize = useText();
  const [schemeId,setSchemeId]=useState('');
  const [allRows,setAllRows]=useState(false);
  const available=schemes.filter(s=>s.kind==='literature'&&s.ready);
  const scheme=available.find(s=>s.id===schemeId);
  const named=useMemo(()=>{
    if(!scheme)return null;
    const haps=new Map();
    for(const s of cohort){const call=typeMaterial(s,scheme);if(!['called','ambiguous','unmatched'].includes(call.status))continue;
      if(!haps.has(call.bases))haps.set(call.bases,{key:call.bases,label:call.bases.replaceAll(' ','·'),members:[]});
      haps.get(call.bases).members.push(s);
    }
    return [...haps.values()].sort((a,b)=>b.members.length-a.members.length||a.label.localeCompare(b.label));
  },[scheme,cohort]);
  const localMapping=useMemo(()=>scheme&&gene?buildHaplotypeMapping(gene,scheme,schemes,named):null,[scheme,gene,schemes,named]);
  const correspondence=mapping||localMapping;
  const plotGroups=named||groups;
  const {sites,domain} = useMemo(() => regionalDistributions(plotGroups,view,selectedIds,Boolean(assessment)),[plotGroups,view,selectedIds,Boolean(assessment)]);
  const range=assessment?.range,policy=assessment?.policy;
  const axis=range&&domain?[Math.min(domain[0],range[0]),Math.max(domain[1],range[1])]:domain;
  const activeSite = view.active.source.site;
  return <div className={'regional-chart'+(compact?' compact-regions':'')+(assessment?' assessed-regions':'')} data-target={range?'active':undefined} aria-label={localize(trait.name+'分地区表型')}>
    <div className="region-toolbar">
      <div className="year-picker" role="group" aria-label={localize("试验年份")}><span>{localize("试验年份")}</span>
        {view.years.map(y => <button type="button" key={y} aria-pressed={y===view.year} onClick={() => onChange({year:y})}>{localize(y)}</button>)}
      </div>
      {view.assays.length>1 && <label className="assay-picker">{localize("鉴定指标")}<select aria-label={localize("鉴定指标")} value={view.assay} onChange={e => onChange({assay:e.target.value})}>
          {view.assays.map(a => <option key={a}>{localize(a)}</option>)}
        </select></label>}
    </div>
    {compact&&<label className="site-select">{localize("试验地点")}<select aria-label={localize("表型试验地点")} value={activeSite} onChange={e=>onChange({site:e.target.value})}>{sites.map(({site})=><option key={site} value={site}>{localize(siteName(site))}</option>)}</select></label>}
    <div className="phenotype-tools">
      {available.length>0&&<label>{localize("分组")+" "}<select aria-label={localize("表型分组方案")} value={scheme?.id||''} onChange={e=>setSchemeId(e.target.value)}><option value="">{localize("当前位点组合")}</option>{available.map(s=><option key={s.id} value={s.id}>{localize(presetTitle(s))}</option>)}</select></label>}
      {view.active.source.provenance&&<details className="phenotype-provenance"><summary>{localize("鉴定与地点溯源 / Trial source")}</summary><TrialProtocol record={view.active.source.provenance}/></details>}
      <PhenotypeTests groups={named||allGroups} view={view} definition={{trait:trait.id,gene:gene?.id,mode:scheme?.id||assessment?.scheme||'selected_genotypes',markers:scheme?scheme.markers.map(v=>v.id):markerIds}}/>
      {onInspect&&<button type="button" className="site-detail" onClick={event=>onInspect(trait,view,event.currentTarget)}>{localize("查看所选试验个体")}</button>}
    </div>
    {range&&<p className="target-legend"><i/>{localize("目标区间 ·")+" "}{localize(valueText(range[0]))}–{localize(valueText(range[1]))} {localize(view.unit)}</p>}
    <details className="region-description" open={!compact}><summary>{localize("统计口径 ·")+" "}{localize(view.unit)}</summary><p>{localize("各地共用同一横轴。箱体为四分位区间，中线为中位数，两端为最小值和最大值。n 为有测值的组合成员数。")}</p></details>
    <div className="region-grid">{sites.filter(s=>!compact||s.site===activeSite).map(({site,endpoint,rows,total}) => {
      const active = site===activeSite, name = siteName(site);
      const report=policy?assessPhenotype(rows,policy,range):null;
      const candidates=report?.preferred;
      const traitEffects=row=>(plotGroups[row.index]?.effects||[]).filter(({claim})=>claim.trait_id===trait.id);
      const favourable=row=>row.n>0&&traitEffects(row).some(({claim,relation})=>relation==='exact'&&claim.judgment==='favourable');
      const sorted=assessment?[...rows].sort((a,b)=>Number(favourable(b))-Number(favourable(a))):rows;
      const displayed=assessment&&!allRows?sorted.filter((row,i)=>i<8||candidates?.has(row.key)||traitEffects(row).length):sorted;
      const comparisons=active?phenotypeEffectComparisons(claims,trait.id,correspondence,rows,view.unit):[];
      const byRow=new Map(), unmatched=[];
      const displayedKeys=new Set(total?displayed.map(row=>row.key):[]);
      for(const comparison of comparisons){
        const keys=comparison.targetKeys.filter(key=>displayedKeys.has(key));
        for(const key of keys)byRow.set(key,[...(byRow.get(key)||[]),comparison]);
        if(!keys.length)unmatched.push(comparison);
      }
      return <section className={'region-card'+(active?' is-active':'')} key={site} aria-label={localize(name+' '+view.year)} data-site={site}>
        <header><h3>{localize(name)}{localize(assessment?' · '+view.year:'')}</h3>
          {endpoint && !assessment&&<button type="button" className="site-detail" aria-label={localize('查看'+name+'个体明细')} aria-pressed={active}
            onClick={() => onChange({site})}>{active?localize("已选明细"):localize("查看明细")}</button>}
        </header>
        {total ? <>
          <div className="region-row region-labels"><span>{assessment?localize("单倍型"):localize("组合")}</span><span>{localize("分布")}</span><span>{localize("中位数")}</span><span>n</span>{range&&<span>{localize("区间内")}</span>}</div>
          {displayed.map(row => {
            const rowEffects=byRow.get(row.key);
            const linkedClaims=traitEffects(row).filter(({claim})=>!rowEffects?.some(item=>item.claim===claim));
            const identity=correspondence?.byGroup.get(row.key);
            const aliases=identity?.matches||[];
            return <div className={'region-row'+(favourable(row)?' literature-priority':'')+(candidates?.has(row.key)?' preferred-row':'')} key={identity?.id||row.key} data-group={row.index+1} data-haplotype-id={identity?.id}>
            <span className="region-group-name">
              <span className="region-vector" title={localize(identity?.sites)}>{localize(plotGroups[row.index]?.label||'G'+String(row.index+1).padStart(2,'0'))}</span>
              {aliases.length>0&&<small className="region-source-alias" title={localize(aliases.map(a=>a.label+' · '+a.doi+' · '+a.sites).join('\n'))}>
                {aliases[0].status==='extension'?localize("文献相关"):localize("原文")} {localize(aliases[0].label)}{localize(aliases.length>1?' +'+(aliases.length-1):'')}
              </small>}
              {linkedClaims.map(({claim,relation})=><a className={'trait-badge reported-phenotype-link '+(relation==='exact'?literatureStyle(claim):'')} key={claimEvidenceKey(claim)}
                href={'https://doi.org/'+claim.doi} target="_blank" rel="noreferrer"
                title={localize(claim.trait+' '+effectDirections[claim.direction]+' · '+claim.context+' · '+claim.locator+(claim.rice6044_context?' · 6044 实测 '+claim.rice6044_context:''))}>
                {relation==='exact'?localize(literatureLabel(claim))+' '+directionArrow(claim):localize("文献位点匹配")} ↗
              </a>)}
              {candidates?.has(row.key)&&<small className="trait-badge target-match">{policy.mode==='relative'?localize("区间优势"):localize("抗性优势")}{candidates.size>1?localize(" · 并列"):''}</small>}
            </span>
            {row.n ? <RangePlot row={row} domain={axis} target={range}/> : <span className="missing-range">—</span>}
            <span>{localize(row.n?valueText(row.median):'—')}</span><span>{localize(row.n)}</span>
            {range&&<span className="range-count" title={row.n?localize("中位数距区间 #0# #1#", [valueText(report.results.get(row.key).distance), view.unit]):undefined}>{localize(row.n?`${report.results.get(row.key).inRange}/${row.n}`:'—')}</span>}
            {rowEffects&&<RowEffect comparisons={rowEffects} view={view}/>}
          </div>;})}
          <div className="region-row region-scale"><span/><div><span>{localize(valueText(axis[0]))}</span><span>{localize(valueText(axis[0]/2+axis[1]/2))}</span><span>{localize(valueText(axis[1]))}</span></div></div>
          {assessment&&rows.length>8&&<button type="button" className="site-detail" onClick={()=>setAllRows(value=>!value)}>{allRows?localize("收起其余单倍型"):localize("显示全部 #0# 型", [rows.length])}</button>}
          {report?.results.size===1&&<p className="region-empty">{localize("仅一个单倍型有配对实测值。")}</p>}
        </> : <p className="region-empty">{!endpoint?localize("该年无此测定列"):!endpoint.source.n?localize("原表此列无实测值"):!plotGroups.length?localize("当前无完整分型组合"):localize("当前组合无实测值")}{localize(endpoint?' · n = 0':'')}</p>}
        {unmatched.length>0&&<details className="unmatched-phenotype-effects">
          <summary>{localize("未匹配分型的文献效应")}</summary>
          <EffectDetails comparisons={unmatched} view={view} matched={false}/>
        </details>}
      </section>;
    })}</div>
    {!assessment&&<p className="footnote">{localize("原始表型见“个体明细”。")}{selectedIds.length>0?localize("圆点为关注材料。"):''}</p>}
  </div>;
}
